<script setup lang="ts">
const { t } = useLang()

import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { useProgression } from '~/composables/useProgression'
import { nightOf } from '~/utils/journal'

/**
 * Le paiement est passé : on le confirme, et on laisse le joueur ouvrir le sas.
 *
 * L'écran s'intercale entre le paiement et la scène 2 pour deux raisons. Le
 * joueur doit LIRE que son paiement est accepté avant que l'écran de
 * construction ne prenne la main. Et la génération de la scène suivante ne part
 * que sur son geste : pas d'appel payé tant qu'il n'a pas franchi le seuil.
 *
 * Rien ne se révèle ici qu'il ne sache déjà : la mission affichée est le but de
 * la nuit, celui que l'auberge lui a donné avant que le barman parle.
 */
const gameStore = useGameStore()
const playerStore = usePlayerStore()
const progression = useProgression()

const mission = computed(() =>
  playerStore.scene?.night?.goal ?? nightOf(playerStore.journal)?.goal ?? null)

/**
 * Un seul passage. Le bouton lance une génération : un double clic en
 * lancerait deux, et la seconde écraserait la première.
 */
const opening = ref(false)

function openAirlock() {
  if (opening.value) return
  opening.value = true
  // Plus rien après la porte : on rend la main à la scène plutôt que de rester
  // bloqué devant un bouton qui ne mène nulle part.
  if (!progression.advance()) gameStore.setScreen('playing')
}
</script>

<template>
  <div class="relative min-h-[100dvh] overflow-hidden flex flex-col items-center justify-center px-5 py-10">
    <div
      class="absolute inset-x-0 bottom-0 h-[50vh] pointer-events-none"
      style="background: radial-gradient(85% 100% at 50% 100%, rgb(var(--neon-500) / 0.16) 0%, transparent 68%)"
    />

    <div class="relative z-10 w-full max-w-md space-y-9 text-center">

      <!-- La confirmation d'abord, hors fiction : le paiement est accepté. -->
      <div class="space-y-4">
        <svg viewBox="0 0 24 24" class="w-9 h-9 mx-auto text-neon-400" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="M8 2 H16 L22 8 V16 L16 22 H8 L2 16 V8 Z" />
          <path d="M7.5 12.5 L10.5 15.5 L16.5 9" />
        </svg>
        <p class="text-neon-400/80 text-[10px] uppercase tracking-[0.32em] font-display">
          {{ t('payment_success.eyebrow') }}
        </p>
        <h1 class="neon-text font-display uppercase text-2xl sm:text-3xl tracking-[0.05em] leading-tight">
          {{ t('payment_success.title') }}
        </h1>
        <div class="neon-rule w-24 mx-auto" />
        <p class="text-ink-100 text-[15px] sm:text-sm leading-relaxed">
          {{ t('payment_success.body') }}
        </p>
      </div>

      <!-- La mission : ce qu'il est sorti chercher cette nuit, et rien de plus. -->
      <div v-if="mission" class="space-y-3 border-y border-steel-600/40 py-6">
        <p class="text-neon-400/80 text-[10px] uppercase tracking-[0.32em] font-display">
          {{ t('payment_success.mission_label') }}
        </p>
        <p class="text-ink-50 text-[15px] sm:text-sm leading-relaxed">
          {{ mission }}
        </p>
      </div>

      <p class="text-neon-300/80 text-[13px] leading-relaxed italic">
        {{ t('payment_success.ready') }}
      </p>

      <GlowButton :loading="opening" class="w-full" @click="openAirlock">
        {{ t('payment_success.cta') }}
      </GlowButton>

      <p v-if="playerStore.quest?.title" class="text-steel-400 text-[10px] uppercase tracking-[0.18em] font-display">
        {{ playerStore.playerName }} — {{ playerStore.quest.title }}
      </p>
    </div>

    <div class="crt-scanlines absolute inset-0 z-20 pointer-events-none opacity-40" />
  </div>
</template>
