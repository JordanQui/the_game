<script setup lang="ts">
import type { NarrativeEntry } from '~/types/game'
import { usePlayerStore } from '~/stores/player'
import { useGameStore } from '~/stores/game'

const props = defineProps<{ entries: NarrativeEntry[] }>()

const playerStore = usePlayerStore()
const gameStore = useGameStore()

/**
 * Uniquement les NOMS DE PERSONNAGES.
 *
 * Le chiffrement porte sur l'identité des gens, pas sur les choses : un objet
 * qu'on ne peut pas lire n'ajoute aucun enjeu, il empêche juste de jouer.
 */
const names = computed(() => {
  const scene = playerStore.scene
  if (!scene) return []
  const people = scene.npcs.map(n => ({ value: n.name, kind: 'name' as const })).filter(t => t.value)
  // L'objet scellé se brouille autrement : c'est une chose, pas une identité.
  const sealed = scene.sealed_object?.name
    ? [{ value: scene.sealed_object.name, kind: 'object' as const }]
    : []
  return [...people, ...sealed]
})

defineEmits<{ challenge: [] }>()

const scrollContainer = ref<HTMLElement | null>(null)

function scrollToBottom() {
  nextTick(() => {
    const el = scrollContainer.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

// Surveiller la ref de l'élément ne déclenchait jamais rien : elle ne change
// qu'au montage. Il faut suivre le contenu, texte en cours de frappe compris.
watch(
  () => [props.entries.length, props.entries[props.entries.length - 1]?.text] as const,
  scrollToBottom,
  { immediate: true }
)
</script>

<template>
  <div
    ref="scrollContainer"
    class="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0 transition-opacity duration-150"
    :class="[gameStore.revealing && 'is-hacking', gameStore.readDenied && 'is-denied']"
  >
    <TransitionGroup name="entry" tag="div" class="space-y-4">
      <div
        v-for="entry in entries"
        :key="entry.id"
        :class="{
          'narrative-text text-parchment/90 text-[15px] sm:text-sm leading-relaxed whitespace-pre-line': entry.type === 'narration',
          'pl-4 border-l-2 border-neon-700/60 text-neon-200 text-sm italic': entry.type === 'npc_speech',
          'text-neon-500/70 text-xs uppercase tracking-widest whitespace-pre-line': entry.type === 'system',
          'text-ink-400 text-xs font-mono': entry.type === 'player_command',
        }"
      >
        <span v-if="entry.type === 'npc_speech' && entry.npcName" class="block text-neon-400/80 text-xs mb-1 not-italic font-sans uppercase tracking-wider">
          {{ entry.npcName }}
        </span>
        <span v-if="entry.type === 'player_command'" class="text-neon-600/50 mr-1">&gt;</span>
        <TypewriterText
          v-if="entry === entries[entries.length - 1] && ['narration', 'npc_speech'].includes(entry.type)"
          :text="entry.text"
          :names="names"
          @challenge="$emit('challenge')"
        />
        <GlitchText v-else :text="entry.text" :names="names" @challenge="$emit('challenge')" />
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
/*
 * Pendant la lecture d'un nom, tout le reste s'efface. On ne lit qu'une chose
 * à la fois : c'est ce qui oblige à mémoriser au lieu de recopier.
 */
.is-hacking :deep(*) {
  color: transparent !important;
  text-shadow: none !important;
}

/*
 * Le nom déchiffré et SES DEUX COUCHES internes doivent survivre à l'effacement.
 * La règle précédente n'épargnait que l'élément portant la classe, pas ses
 * enfants — et comme le texte visible est justement dans un enfant, le nom
 * disparaissait avec le reste.
 */
.is-hacking :deep(.glitch-name),
.is-hacking :deep(.glitch-name *) {
  color: #ffd9ec !important;
  text-shadow:
    0 0 4px rgba(255, 46, 136, 0.95),
    0 0 14px rgba(255, 46, 136, 0.7) !important;
}

/*
 * Lecture refusée, faute d'oeil actif. Le texte ne disparaît pas : il se met à
 * trembler comme le nom, pour dire que l'illisibilité vient de gagner du
 * terrain. Aucun message, juste la réaction du système.
 */
.is-denied {
  animation: read-denied 0.7s steps(2, end);
}

@keyframes read-denied {
  0%, 100% { transform: none; filter: none; opacity: 1 }
  10% { transform: translateX(-2px) skewX(-1.5deg); filter: blur(0.6px); opacity: 0.75 }
  25% { transform: translateX(3px); filter: blur(0.3px); opacity: 0.9 }
  40% { transform: translateX(-1px) skewX(1deg); filter: blur(0.9px); opacity: 0.6 }
  60% { transform: translateX(2px); filter: blur(0.4px); opacity: 0.85 }
  80% { transform: translateX(-1px); filter: blur(0.2px); opacity: 0.95 }
}

.entry-enter-active { transition: opacity 0.4s ease, transform 0.4s ease; }
.entry-enter-from { opacity: 0; transform: translateY(6px); }
</style>
