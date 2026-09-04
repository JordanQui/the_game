<script setup lang="ts">
import type { SceneQuest } from '~/types/scene'

// La quête est exposée dès l'arrivée dans la scène : c'est elle qui doit
// donner envie de franchir la porte.
defineProps<{ quest: SceneQuest | null }>()
const open = ref(false)
</script>

<template>
  <div v-if="quest" class="panel-ancient">
    <button
      class="w-full flex items-center justify-between px-3 py-2 text-amber-400/80 text-xs uppercase tracking-widest hover:text-amber-300 transition-colors"
      @click="open = !open"
    >
      <span>Journal de Quête</span>
      <span class="text-base">{{ open ? '▴' : '▾' }}</span>
    </button>
    <Transition name="slide">
      <div v-if="open" class="px-3 pb-3 space-y-2 border-t border-amber-900/30 pt-2">
        <p class="text-amber-300 font-serif text-sm">{{ quest.title }}</p>
        <p class="text-parchment/70 text-xs italic leading-relaxed">{{ quest.hook }}</p>
        <div class="space-y-1">
          <p class="text-amber-600/70 text-xs uppercase tracking-wider">Objectif</p>
          <p class="text-parchment/80 text-xs">{{ quest.objective }}</p>
        </div>
        <div class="space-y-1">
          <p class="text-amber-600/70 text-xs uppercase tracking-wider">Artefact</p>
          <p class="text-parchment/80 text-xs italic">{{ quest.artifact }}</p>
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
