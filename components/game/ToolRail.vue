<script setup lang="ts">
import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'

/**
 * Les outils de lecture.
 *
 * Chacun modifie ce que le texte laisse voir, et le curseur prend sa forme :
 * l'oeil déchiffre les identités, la loupe — l'augmentation — analyse les
 * objets scellés. La loupe n'apparaît qu'une fois l'augmentation obtenue :
 * avant, le joueur ne doit pas soupçonner qu'un second mode existe.
 */
const gameStore = useGameStore()
const playerStore = usePlayerStore()

const lensLabel = computed(() => playerStore.scene?.key_item?.name ?? 'Analyse')
</script>

<template>
  <div class="shrink-0 flex items-center gap-1.5 px-4 py-1.5">
    <button
      class="p-1.5 -my-0.5 transition-colors"
      :class="gameStore.activeTool === 'eye' ? 'text-neon-400' : 'text-steel-400 hover:text-neon-600'"
      :aria-pressed="gameStore.activeTool === 'eye'"
      aria-label="Œil : déchiffrer les identités"
      title="Œil — déchiffrer les identités"
      @click="gameStore.setTool('eye')"
    >
      <svg viewBox="0 0 24 16" class="w-6 h-4" fill="none" stroke="currentColor" stroke-width="1.4">
        <path d="M1 8s4-6.5 11-6.5S23 8 23 8s-4 6.5-11 6.5S1 8 1 8Z" />
        <circle cx="12" cy="8" r="3.4" :fill="gameStore.activeTool === 'eye' ? 'currentColor' : 'none'" />
      </svg>
    </button>

    <button
      v-if="gameStore.hasAugmentation"
      class="p-1.5 -my-0.5 transition-colors"
      :class="gameStore.activeTool === 'lens' ? 'text-neon-400' : 'text-steel-400 hover:text-neon-600'"
      :aria-pressed="gameStore.activeTool === 'lens'"
      :aria-label="`${lensLabel} : analyser les objets`"
      :title="`${lensLabel} — analyser les objets scellés`"
      @click="gameStore.setTool('lens')"
    >
      <svg viewBox="0 0 20 20" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="8.5" cy="8.5" r="6" />
        <path d="M13 13l5 5" stroke-linecap="round" />
        <path
          v-if="gameStore.activeTool === 'lens'"
          d="M8.5 5.2v6.6M5.2 8.5h6.6" stroke-width="0.9" opacity="0.6"
        />
      </svg>
    </button>
  </div>
</template>
