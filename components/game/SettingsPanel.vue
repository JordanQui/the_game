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
  <div class="fixed top-3 right-3 z-40">
    <button
      class="p-2 bg-ink-900/85 border border-steel-600/50 transition-colors"
      :class="gameStore.settingsOpen ? 'text-neon-400' : 'text-steel-400 hover:text-neon-600'"
      :aria-expanded="gameStore.settingsOpen"
      aria-label="Réglages"
      title="Réglages"
      @click="gameStore.toggleSettings()"
    >
      <!-- Roue crantée : denture calculée, pas des rayons de soleil -->
      <svg viewBox="0 0 20 20" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round">
        <path d="M8.78 0.88 L11.22 0.88 L11.90 3.26 L13.42 3.89 L15.58 2.69 L17.31 4.42 L16.11 6.58 L16.74 8.10 L19.12 8.78 L19.12 11.22 L16.74 11.90 L16.11 13.42 L17.31 15.58 L15.58 17.31 L13.42 16.11 L11.90 16.74 L11.22 19.12 L8.78 19.12 L8.10 16.74 L6.58 16.11 L4.42 17.31 L2.69 15.58 L3.89 13.42 L3.26 11.90 L0.88 11.22 L0.88 8.78 L3.26 8.10 L3.89 6.58 L2.69 4.42 L4.42 2.69 L6.58 3.89 L8.10 3.26 Z" />
        <circle cx="10" cy="10" r="3.1" />
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
