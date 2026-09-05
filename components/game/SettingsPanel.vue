<script setup lang="ts">
import { useGameStore } from '~/stores/game'

/**
 * Réglages de confort.
 *
 * Une seule question pour l'instant, mais elle compte : la posture de lecture
 * décale le tangage neutre du gyroscope. Sans elle, viser un nom allongé dans
 * son lit est impraticable — l'oeil se colle en haut de l'écran.
 */
const gameStore = useGameStore()

const POSTURES = [
  { key: 'assis' as const, label: 'Assis', detail: 'Appareil incliné vers soi' },
  { key: 'allonge' as const, label: 'Allongé', detail: 'Appareil à plat au-dessus du visage' },
]
</script>

<template>
  <div class="relative">
    <button
      class="p-1.5 -my-0.5 transition-colors"
      :class="gameStore.settingsOpen ? 'text-neon-400' : 'text-steel-400 hover:text-neon-600'"
      :aria-expanded="gameStore.settingsOpen"
      aria-label="Réglages"
      title="Réglages"
      @click="gameStore.toggleSettings()"
    >
      <!-- Roue crantée -->
      <svg viewBox="0 0 20 20" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.4">
        <circle cx="10" cy="10" r="2.8" />
        <path d="M10 1.6v2.2M10 16.2v2.2M1.6 10h2.2M16.2 10h2.2M4.1 4.1l1.6 1.6M14.3 14.3l1.6 1.6M15.9 4.1l-1.6 1.6M5.7 14.3l-1.6 1.6" stroke-linecap="round" />
      </svg>
    </button>

    <Transition name="slide">
      <div
        v-if="gameStore.settingsOpen"
        class="absolute right-0 top-full mt-2 z-40 w-60 bg-ink-900 border border-neon-600/45 p-4 space-y-3"
        style="box-shadow: 0 18px 44px rgba(0,0,0,.8)"
      >
        <p class="text-neon-400/80 text-[10px] uppercase tracking-[0.28em] font-display">
          Position de lecture
        </p>
        <p class="text-steel-400 text-[11px] leading-relaxed">
          Cale la visée sur la façon dont tu tiens l'appareil.
        </p>

        <div class="space-y-1.5">
          <button
            v-for="p in POSTURES"
            :key="p.key"
            class="w-full text-left px-3 py-2 border transition-colors"
            :class="gameStore.posture === p.key
              ? 'border-neon-500/70 text-neon-200 bg-neon-700/15'
              : 'border-steel-600/50 text-ink-200 hover:border-neon-600/60'"
            @click="gameStore.setPosture(p.key)"
          >
            <span class="block font-display text-[11px] uppercase tracking-[0.16em]">{{ p.label }}</span>
            <span class="block text-ink-300 text-[11px] mt-0.5">{{ p.detail }}</span>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.slide-enter-active, .slide-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.slide-enter-from, .slide-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
