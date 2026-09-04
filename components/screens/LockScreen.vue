<script setup lang="ts">
import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { usePaywall } from '~/composables/usePaywall'

const gameStore = useGameStore()
const playerStore = usePlayerStore()
const { openExit } = usePaywall()

const quest = computed(() => playerStore.quest)
const exitLabel = computed(() => playerStore.scene?.paywall.cta ?? 'Franchir le sas')

/**
 * La sortie reste ouverte malgré le blocage : le joueur n'a pas perdu, il a
 * seulement traîné. On lui remet la quête en main et il décide.
 */
function takeTheExit() {
  openExit()
}
</script>

<template>
  <div class="relative min-h-[100dvh] overflow-hidden flex items-center justify-center px-6 py-12">
    <!-- Le néon du comptoir, en veilleuse : la nuit s'est arrêtée ici -->
    <div
      class="absolute inset-x-0 bottom-0 h-[45vh] pointer-events-none"
      style="background: radial-gradient(80% 100% at 50% 100%, rgba(255,46,136,0.14) 0%, transparent 65%)"
    />

    <div class="relative z-10 w-full max-w-md space-y-8">
      <!-- Verdict -->
      <div class="space-y-5 text-center">
        <p class="font-display text-[10px] uppercase tracking-[0.4em] text-neon-400/80">
          Fin de la nuit
        </p>
        <div class="neon-rule w-28 mx-auto" />
        <p class="text-ink-100 text-[15px] sm:text-sm leading-relaxed whitespace-pre-line">
          {{ gameStore.lockVerdict }}
        </p>
      </div>

      <!-- Ce qu'il fallait comprendre -->
      <div v-if="gameStore.lockRecap.length" class="space-y-5">
        <div class="flex items-center gap-3">
          <span class="h-px flex-1 bg-steel-600" />
          <p class="font-display text-[10px] uppercase tracking-[0.28em] text-steel-400 shrink-0">
            Ce qu'il fallait comprendre
          </p>
          <span class="h-px flex-1 bg-steel-600" />
        </div>

        <ul class="space-y-4">
          <li
            v-for="(line, i) in gameStore.lockRecap"
            :key="i"
            class="flex items-start gap-3.5"
          >
            <svg viewBox="0 0 8 10" class="w-2 h-2.5 mt-1 shrink-0 fill-neon-500" aria-hidden="true">
              <path d="M0 0 L5 5 L0 10 L3 10 L8 5 L3 0 Z" />
            </svg>
            <span class="text-ink-200/80 text-[13px] leading-relaxed">{{ line }}</span>
          </li>
        </ul>
      </div>

      <!-- La porte reste ouverte -->
      <div class="space-y-4 flex flex-col items-center pt-2">
        <p v-if="quest" class="text-steel-400 text-[11px] text-center leading-relaxed max-w-xs">
          {{ quest.title }} t'attend toujours dehors.
        </p>
        <GlowButton class="w-full" @click="takeTheExit">{{ exitLabel }}</GlowButton>
      </div>
    </div>

    <div class="crt-scanlines absolute inset-0 z-20 pointer-events-none opacity-40" />
  </div>
</template>
