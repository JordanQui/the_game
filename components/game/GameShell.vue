<script setup lang="ts">
import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { useNarrative } from '~/composables/useNarrative'
import { usePaywall } from '~/composables/usePaywall'

const gameStore = useGameStore()
const playerStore = usePlayerStore()
const { handlePlayerInput } = useNarrative()
const { checkPaywallTrigger } = usePaywall()

async function onCommand(input: string) {
  if (checkPaywallTrigger(input, 3)) {
    gameStore.addNarrativeEntry('narration', 'Vous posez la main sur la poignée de la porte...')
    setTimeout(() => gameStore.triggerPaywall(), 1200)
    return
  }
  await handlePlayerInput(input)
}
</script>

<template>
  <div class="flex flex-col h-screen max-h-screen bg-ink-900">
    <!-- Scene image zone -->
    <div class="shrink-0">
      <SceneImage
        :src="gameStore.currentSceneImageUrl"
        :loading="gameStore.playingSubState === 'image_loading'"
      />
    </div>

    <!-- NPC list (sidebar strip) -->
    <div v-if="playerStore.npcs.length" class="shrink-0 flex gap-2 px-4 py-2 border-b border-amber-900/30 overflow-x-auto">
      <NPCDialogue
        v-for="npc in playerStore.npcs"
        :key="npc.id"
        :npc="npc"
        class="shrink-0 w-48"
      />
    </div>

    <!-- Quest log -->
    <div class="shrink-0 px-4 pt-2">
      <QuestLog :quest="playerStore.quest" :revealed="gameStore.questRevealed" />
    </div>

    <!-- Narrative text area -->
    <NarrativeText :entries="gameStore.narrativeHistory" />

    <!-- Command input -->
    <div class="shrink-0">
      <CommandInput
        :disabled="gameStore.isInputDisabled"
        @command="onCommand"
      />
    </div>
  </div>
</template>
