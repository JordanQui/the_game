<script setup lang="ts">
import type { SceneQuest } from '~/types/scene'
import { useGameStore } from '~/stores/game'

// La quête est exposée dès l'arrivée dans la scène : c'est elle qui doit
// donner envie de franchir la porte.
defineProps<{ quest: SceneQuest | null }>()
const open = ref(false)

const gameStore = useGameStore()
</script>

<template>
  <div v-if="quest" class="panel-ancient">
    <button
      class="w-full flex items-center justify-between px-3 py-2 text-neon-400/85 text-[10px] uppercase tracking-[0.25em] font-display hover:text-neon-300 transition-colors"
      @click="open = !open"
    >
      <span>Journal de Quête</span>
      <span class="text-base">{{ open ? '▴' : '▾' }}</span>
    </button>
    <Transition name="slide">
      <div v-if="open" class="px-3 pb-3 space-y-3 border-t border-neon-600/25 pt-2">
        <p class="text-neon-300 font-display uppercase tracking-wider text-xs">{{ quest.title }}</p>
        <p class="text-ink-200/75 text-xs leading-relaxed">{{ quest.hook }}</p>
        <div v-for="field in [
          { label: 'Objectif', value: quest.objective },
          { label: 'Enjeu', value: quest.stakes },
          { label: 'À rétablir', value: quest.restoration },
          { label: 'Artefact', value: quest.artifact },
        ]" :key="field.label" class="space-y-1">
          <p class="text-neon-400/70 text-[10px] uppercase tracking-[0.2em] font-display">{{ field.label }}</p>
          <p class="text-ink-200/80 text-xs leading-relaxed">{{ field.value }}</p>
        </div>

        <div v-if="gameStore.inventory.length" class="space-y-1 pt-1 border-t border-neon-600/20">
          <p class="text-neon-400/70 text-[10px] uppercase tracking-[0.2em] font-display pt-2">Sur toi</p>
          <p class="text-ink-200/80 text-xs leading-relaxed">
            {{ gameStore.inventory.map(o => o.label).join(', ') }}
          </p>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.slide-enter-active, .slide-leave-active { transition: all 0.25s ease; overflow: hidden; }
.slide-enter-from, .slide-leave-to { max-height: 0; opacity: 0; }
.slide-enter-to, .slide-leave-from { max-height: 300px; opacity: 1; }
</style>
