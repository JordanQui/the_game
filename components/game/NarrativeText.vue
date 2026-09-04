<script setup lang="ts">
import type { NarrativeEntry } from '~/types/game'
import { usePlayerStore } from '~/stores/player'
import { collectNames, highlightNames } from '~/utils/highlight'

const props = defineProps<{ entries: NarrativeEntry[] }>()

const playerStore = usePlayerStore()

/** Tout ce qui vient des données du joueur et mérite d'être repérable. */
const names = computed(() => {
  const scene = playerStore.scene
  if (!scene) return []
  return collectNames([
    scene.place?.name,
    scene.key_item?.name,
    scene.quest?.artifact,
    ...scene.npcs.map(n => n.name),
    ...(scene.decor ?? []).map(d => d.name),
    ...(scene.interactables ?? []).map(i => i.label),
  ])
})

const render = (text: string) => highlightNames(text, names.value)

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
  <div ref="scrollContainer" class="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
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
        />
        <span v-else v-html="render(entry.text)" />
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.entry-enter-active { transition: opacity 0.4s ease, transform 0.4s ease; }
.entry-enter-from { opacity: 0; transform: translateY(6px); }
</style>
