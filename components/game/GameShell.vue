<script setup lang="ts">
import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { useNarrative } from '~/composables/useNarrative'
import { usePaywall } from '~/composables/usePaywall'

const gameStore = useGameStore()
const playerStore = usePlayerStore()
const { handlePlayerInput } = useNarrative()
const { checkPaywallTrigger } = usePaywall()

/** Les PNJ prennent de la place sur petit écran : repliés par défaut. */
const showNpcs = ref(false)

async function onCommand(input: string) {
  if (checkPaywallTrigger(input)) {
    const gate = playerStore.scene?.paywall.gate_text
    if (gate) gameStore.addNarrativeEntry('narration', gate)
    setTimeout(() => gameStore.triggerPaywall(), 1400)
    return
  }
  await handlePlayerInput(input)
}
</script>

<template>
  <div class="flex flex-col h-[100dvh] bg-ink-900">
    <!-- Illustration : plafonnée pour laisser le texte respirer sur mobile -->
    <div class="shrink-0 max-h-[38dvh] sm:max-h-[45dvh] overflow-hidden">
      <SceneImage
        :src="gameStore.currentSceneImageUrl"
        :loading="gameStore.playingSubState === 'image_loading'"
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
