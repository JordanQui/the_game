<script setup lang="ts">
import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { useNarrative } from '~/composables/useNarrative'
import { usePaywall } from '~/composables/usePaywall'
import { useImageGen } from '~/composables/useImageGen'
import { useSceneCommands } from '~/composables/useSceneCommands'

const gameStore = useGameStore()
const playerStore = usePlayerStore()
const { handlePlayerInput, retryLastTurn } = useNarrative()
const { checkPaywallTrigger, mentionsExit } = usePaywall()
const { generateSceneImage } = useImageGen()
const { isCommand, run: runSceneCommand } = useSceneCommands()

/** Les PNJ prennent de la place sur petit écran : repliés par défaut. */
const showNpcs = ref(false)

async function onCommand(input: string) {
  // Le canal '#' parle au scénario, pas au modèle : il passe avant tout le
  // reste et rien ne part chez gpt-4o.
  if (isCommand(input)) {
    runSceneCommand(input)
    return
  }

  if (checkPaywallTrigger(input)) {
    const gate = playerStore.scene?.paywall.gate_text
    if (gate) gameStore.addNarrativeEntry('narration', gate)
    setTimeout(() => gameStore.triggerPaywall(), 1400)
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
    <!-- Mobile : le 16/9 de SceneImage donne la hauteur, plein cadre.
         Desktop : hauteur imposée, sinon l'aspect-ratio la calcule depuis la
         largeur, déborde du cadre et on n'en voit que la tranche du haut. -->
    <div class="shrink-0 sm:h-[45dvh]">
      <SceneImage
        :src="gameStore.currentSceneImageUrl"
        :loading="gameStore.sceneImageLoading"
        :error="gameStore.sceneImageError"
        @retry="retryImage"
      />
    </div>

    <!-- Bandeau : lieu + accès aux PNJ -->
    <div class="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-amber-900/30">
      <p class="flex-1 min-w-0 truncate text-amber-400/90 font-serif text-sm">
        {{ playerStore.place?.name ?? playerStore.scene?.scene_title }}
      </p>
      <button
        v-if="playerStore.npcs.length"
        class="shrink-0 text-xs text-amber-600/80 hover:text-amber-400 transition-colors py-1 px-2 -my-1"
        @click="showNpcs = !showNpcs"
      >
        {{ playerStore.npcs.length }} présents {{ showNpcs ? '▴' : '▾' }}
      </button>
    </div>

    <!-- Liste des PNJ -->
    <Transition name="slide">
      <div v-if="showNpcs" class="shrink-0 flex gap-2 px-4 py-2 border-b border-amber-900/30 overflow-x-auto">
        <NPCDialogue
          v-for="npc in playerStore.npcs"
          :key="npc.id"
          :npc="npc"
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
          class="shrink-0 text-amber-400 hover:text-amber-300 text-xs uppercase tracking-wider border border-amber-800/60 px-3 py-1.5 transition-colors"
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
