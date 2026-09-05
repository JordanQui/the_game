<script setup lang="ts">
import { useGameStore } from '~/stores/game'
import { useGyroEye } from '~/composables/useGyroEye'

/**
 * L'oeil de visée tactile.
 *
 * Ne s'affiche que sur les appareils sans survol : sur desktop, la souris fait
 * déjà ce travail et un oeil de plus serait un doublon encombrant.
 */
const gameStore = useGameStore()
const { needsEye, supported, enabled, denied, enable } = useGyroEye()

const style = computed(() => ({
  left: `${gameStore.eyePos.x * 100}%`,
  top: `${gameStore.eyePos.y * 100}%`,
}))
</script>

<template>
  <div v-if="needsEye">
    <!-- Avant activation : le bouton de permission, exigé par iOS. -->
    <button
      v-if="!enabled"
      class="fixed top-3 right-3 z-40 flex items-center gap-2 px-3 py-2
             font-display text-[10px] uppercase tracking-[0.18em]
             text-neon-300 bg-ink-900/90 border border-neon-600/50"
      @click="enable"
    >
      <svg viewBox="0 0 24 16" class="w-5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.4">
        <path d="M1 8s4-6.5 11-6.5S23 8 23 8s-4 6.5-11 6.5S1 8 1 8Z" />
        <circle cx="12" cy="8" r="3.4" />
      </svg>
      {{ denied ? 'Accès refusé' : supported ? 'Ouvrir l\'œil' : 'Indisponible' }}
    </button>

    <!-- Actif : l'oeil suit l'inclinaison de l'appareil. -->
    <div
      v-else
      class="eye pointer-events-none fixed z-40"
      :class="gameStore.revealing && 'is-locked-on'"
      :style="style"
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 16" class="w-10 h-7" fill="none" stroke="currentColor" stroke-width="1.2">
        <path d="M1 8s4-6.5 11-6.5S23 8 23 8s-4 6.5-11 6.5S1 8 1 8Z" />
        <circle cx="12" cy="8" r="3.4" fill="currentColor" fill-opacity="0.35" />
        <path d="M12 0v3M12 13v3M0 8h3M21 8h3" stroke-width="0.8" opacity="0.7" />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.eye {
  transform: translate(-50%, -50%);
  color: #ff4f9b;
  filter: drop-shadow(0 0 6px rgba(255, 46, 136, 0.6));
  transition: color 0.12s ease, filter 0.12s ease;
}

/* Verrouillé sur un nom : l'oeil le dit avant même qu'on lise. */
.is-locked-on {
  color: #ffd9ec;
  filter: drop-shadow(0 0 12px rgba(255, 46, 136, 0.95));
}
</style>
