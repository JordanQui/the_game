<script setup lang="ts">
import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { useNarrative } from '~/composables/useNarrative'
import { usePaywall } from '~/composables/usePaywall'
import { useImageGen } from '~/composables/useImageGen'
import { useSceneCommands } from '~/composables/useSceneCommands'
import { normalize } from '~/utils/text-match'

const gameStore = useGameStore()
const playerStore = usePlayerStore()
const { handlePlayerInput, retryLastTurn } = useNarrative()
const { checkPaywallTrigger, blockedByKeyItem, openExit, mentionsExit } = usePaywall()
const { generateSceneImage } = useImageGen()
const { isCommand, run: runSceneCommand } = useSceneCommands()

/**
 * Ouvert par défaut : le joueur doit voir tout de suite avec qui parler, c'est
 * par là que passe la progression. Il peut toujours replier pour lire.
 */
const showNpcs = ref(true)

async function onCommand(input: string) {
  // Le canal '#' parle au scénario, pas au modèle : il passe avant tout le
  // reste et rien ne part chez gpt-4o.
  if (isCommand(input)) {
    runSceneCommand(input)
    return
  }

  // Il veut sortir mais l'objet lui manque : on le renvoie vers son détenteur.
  if (blockedByKeyItem(input)) {
    await handlePlayerInput(input, 'blocked_exit')
    return
  }

  if (checkPaywallTrigger(input)) {
    const gate = playerStore.scene?.paywall.gate_text
    if (gate) gameStore.addNarrativeEntry('narration', gate)
    setTimeout(openExit, 1400)
    return
  }

  // Le joueur parle de sortir mais il est trop tôt : on ramène le regard
  // vers la porte sans jamais lui dicter la commande.
  if (mentionsExit(input)) {
    await handlePlayerInput(input, 'exit_nudge')
    return
  }

  await handlePlayerInput(input)
}

/**
 * Les objets que le joueur peut ramasser maintenant.
 *
 * Un objet devient ramassable quand il a été NOMMÉ dans le récit : le script
 * impose que `interactables` liste exactement ce qui apparaît dans le texte,
 * mais le joueur ne doit pas voir un bouton pour une chose dont on ne lui a
 * pas encore parlé. La sortie est exclue — on la franchit, on ne la ramasse pas.
 */
const pickable = computed(() => {
  const scene = playerStore.scene
  if (!scene?.interactables) return []

  const narrated = normalize(
    gameStore.narrativeHistory
      .filter(e => e.type === 'narration' || e.type === 'npc_speech')
      .map(e => e.text)
      .join(' ')
  )

  return scene.interactables.filter((obj) => {
    if (obj.triggers_paywall) return false
    if (gameStore.inventory.some(o => o.id === obj.id)) return false
    const label = normalize(obj.label).replace(/^(l['’]|le |la |les |un |une |des )/, '')
    return label.length > 2 && narrated.includes(label)
  })
})

function pickUp(obj: { id: string; label: string }) {
  gameStore.pickUp(obj.id, obj.label)
  gameStore.addNarrativeEntry('system', `Tu ramasses ${obj.label}.`)
}

/** Le joueur prend l'objet que le détenteur lui tend. */
function collectItem() {
  const item = playerStore.scene?.key_item
  if (!item) return
  gameStore.collectKeyItem()
  gameStore.addNarrativeEntry('system', `Tu tiens maintenant ${item.name}.`)
}

function retryImage() {
  const scene = playerStore.scene
  if (!scene) return

  // Illustration figée : il n'y a rien à regénérer, on la repose.
  if (scene.static_image) {
    gameStore.setSceneImage(scene.static_image)
    gameStore.finishSceneImage()
    return
  }

  void generateSceneImage({
    sceneId: scene.scene_id,
    placeName: scene.place.name,
    palette: scene.palette,
    decor: scene.decor,
  })
}
</script>

<template>
  <div class="flex flex-col h-[100dvh] bg-ink-900">
    <!-- Le cadre reste 16/9 sur les deux tailles. Mobile : il prend toute la
         largeur. Desktop : c'est la hauteur qui le dimensionne, et il se centre
         — un 16/9 pleine largeur y ferait 810px de haut, sans place pour le
         texte. -->
    <div class="shrink-0 flex justify-center">
      <SceneImage
        :src="gameStore.currentSceneImageUrl"
        :loading="gameStore.sceneImageLoading"
        :error="gameStore.sceneImageError"
        @retry="retryImage"
      />
    </div>

    <!-- Bandeau : lieu + accès aux PNJ -->
    <div class="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-neon-700/30">
      <p class="flex-1 min-w-0 truncate text-neon-400/90 font-display uppercase tracking-[0.14em] text-[11px]">
        {{ playerStore.place?.name ?? playerStore.scene?.scene_title }}
      </p>
      <button
        v-if="playerStore.npcs.length"
        class="shrink-0 text-xs text-neon-600/80 hover:text-neon-400 transition-colors py-1 px-2 -my-1"
        @click="showNpcs = !showNpcs"
      >
        {{ playerStore.npcs.length }} à qui parler {{ showNpcs ? '▴' : '▾' }}
      </button>
    </div>

    <!-- Liste des PNJ -->
    <Transition name="slide">
      <div v-if="showNpcs" class="shrink-0 flex gap-2 px-4 py-2 border-b border-neon-700/30 overflow-x-auto">
        <NPCDialogue
          v-for="npc in playerStore.npcs"
          :key="npc.id"
          :npc="npc"
          :talked="gameStore.talkedToNpcIds.includes(npc.id)"
          class="shrink-0 w-44 sm:w-48"
        />
      </div>
    </Transition>

    <!-- Journal de quête -->
    <div class="shrink-0 px-4 pt-2">
      <QuestLog :quest="playerStore.quest" />
    </div>

    <!-- Narration -->
    <NarrativeText :entries="gameStore.narrativeHistory" />

    <!-- Objets nommés dans le récit : un bouton pour chacun -->
    <Transition name="slide">
      <div v-if="pickable.length" class="shrink-0 flex flex-wrap gap-2 px-4 pb-2">
        <button
          v-for="obj in pickable"
          :key="obj.id"
          class="flex items-center gap-2 font-display text-[10px] uppercase tracking-[0.16em]
                 text-neon-300 border border-neon-600/50 hover:border-neon-400 hover:text-neon-200
                 px-2.5 py-1.5 transition-colors"
          @click="pickUp(obj)"
        >
          <span class="text-neon-500">+</span> Ramasser {{ obj.label }}
        </button>
      </div>
    </Transition>

    <!--
      L'objet est tendu, pas donné. Un objet qui apparaît tout seul dans
      l'inventaire ne se remarque pas : il faut un geste du joueur.
    -->
    <Transition name="slide">
      <div
        v-if="gameStore.pendingKeyItem && playerStore.scene?.key_item"
        class="shrink-0 flex items-center gap-3 mx-4 mb-2 px-3 py-2.5 border border-neon-500/50 bg-neon-700/10"
      >
        <svg viewBox="0 0 8 10" class="w-2 h-2.5 shrink-0 fill-neon-500 animate-deco-pulse" aria-hidden="true">
          <path d="M0 0 L5 5 L0 10 L3 10 L8 5 L3 0 Z" />
        </svg>
        <p class="flex-1 min-w-0 text-ink-100 text-xs leading-snug">
          {{ playerStore.scene.key_item.name }} t'est tendu.
        </p>
        <button
          class="shrink-0 font-display text-[10px] uppercase tracking-[0.2em] text-neon-200 bg-neon-500/70
                 hover:bg-neon-400 hover:text-ink-900 px-3 py-1.5 transition-colors"
          @click="collectItem"
        >
          Récupérer
        </button>
      </div>
    </Transition>

    <!-- Tour en échec : la saisie reste ouverte, et on peut relancer -->
    <Transition name="slide">
      <div
        v-if="gameStore.turnError"
        class="shrink-0 flex items-center gap-3 mx-4 mb-2 px-3 py-2 border border-red-900/50 bg-red-950/20"
      >
        <p class="flex-1 min-w-0 text-red-300/70 text-xs leading-snug">
          {{ gameStore.turnError }}
        </p>
        <button
          class="shrink-0 text-neon-400 hover:text-neon-300 text-xs uppercase tracking-wider border border-neon-700/60 px-3 py-1.5 transition-colors"
          @click="retryLastTurn"
        >
          Réessayer
        </button>
        <button
          class="shrink-0 text-ink-400 hover:text-parchment/60 text-lg leading-none px-1 transition-colors"
          aria-label="Ignorer"
          @click="gameStore.clearTurnError()"
        >
          ×
        </button>
      </div>
    </Transition>

    <!-- Saisie -->
    <div class="shrink-0 pb-[env(safe-area-inset-bottom)]">
      <CommandInput
        :disabled="gameStore.isInputDisabled"
        @command="onCommand"
      />
    </div>
  </div>
</template>

<style scoped>
.slide-enter-active, .slide-leave-active { transition: all 0.25s ease; overflow: hidden; }
.slide-enter-from, .slide-leave-to { max-height: 0; opacity: 0; }
.slide-enter-to, .slide-leave-from { max-height: 200px; opacity: 1; }
</style>
