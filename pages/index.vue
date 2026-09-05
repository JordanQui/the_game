<script setup lang="ts">
import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { usePaymentStore } from '~/stores/payment'
import { useProgression } from '~/composables/useProgression'

const gameStore = useGameStore()
const playerStore = usePlayerStore()

const progression = useProgression()

/**
 * Après paiement, on ENTRE dans la scène suivante.
 *
 * Le bouton se contentait de réafficher l'écran de jeu, qui gardait la scène
 * courante : on repayait pour revenir au même comptoir, devant le même sas
 * fermé. Le droit d'accès était accordé, mais rien ne l'utilisait.
 */
function continueAfterPayment() {
  if (!progression.advance()) gameStore.setScreen('playing')
}
const paymentStore = usePaymentStore()

// Un joueur qui a déjà payé reprend sans repasser par le paywall. L'appel ne
// déclenche aucune génération : il ne fait que lire un cookie signé.
onMounted(async () => {
  if (gameStore.currentScreen === 'init') gameStore.setScreen('login')

  try {
    const access = await $fetch<{
      active: boolean
      expiresAt?: number
      lock: { until: number; reason: 'stalled' | 'completed'; text?: string } | null
    }>('/api/access')
    paymentStore.setAccess(access.active, access.expiresAt ?? null)

    // La ville est fermée : on n'ouvre même pas l'écran de connexion. Toute
    // requête coûteuse serait refusée en 423 de toute façon, et l'adieu doit
    // revenir tel quel — au rechargement, dans un autre onglet, le lendemain.
    if (access.lock) gameStore.closeCity(access.lock)
  } catch {
    // Sans réponse, on reste sur le parcours payant : jamais l'inverse.
  }
})

// Les données Meta récupérées, on enchaîne sur la construction de la scène.
watch(() => playerStore.profile, (profile) => {
  if (profile && gameStore.currentScreen === 'facebook_loading') {
    gameStore.setScreen('scene_build_loading')
  }
})
</script>

<template>
  <div class="min-h-[100dvh] bg-ink-900">
    <Transition name="screen" mode="out-in">
      <LoginScreen v-if="gameStore.currentScreen === 'login'" key="login" />
      <LoadingScreen v-else-if="gameStore.currentScreen === 'facebook_loading'" key="fb" message="Récupération de vos données..." />
      <SceneBuildScreen v-else-if="gameStore.currentScreen === 'scene_build_loading'" key="scene-build" />
      <GameShell v-else-if="gameStore.currentScreen === 'playing'" key="game" />
      <PaywallScreen v-else-if="gameStore.currentScreen === 'paywall'" key="paywall" />
      <EndingScreen v-else-if="gameStore.currentScreen === 'ending'" key="ending" />
      <LockedScreen v-else-if="gameStore.currentScreen === 'locked'" key="locked" />
      <LoadingScreen v-else-if="gameStore.currentScreen === 'payment_processing'" key="pay" message="Traitement du paiement..." />
      <div v-else-if="gameStore.currentScreen === 'payment_success'" key="success" class="min-h-[100dvh] flex items-center justify-center text-center px-6">
        <div class="space-y-6 max-w-sm">
          <p class="neon-text font-display uppercase text-2xl sm:text-3xl tracking-[0.05em]">
            Le sas s'ouvre
          </p>
          <div class="neon-rule w-24 mx-auto" />
          <p class="text-ink-200/80 text-sm leading-relaxed">
            {{ playerStore.quest?.title }} ne fait que commencer.
          </p>
          <GlowButton @click="continueAfterPayment">Continuer l'aventure</GlowButton>
        </div>
      </div>
      <LoadingScreen v-else key="init" />
    </Transition>
  </div>
</template>

<style>
.screen-enter-active, .screen-leave-active { transition: opacity 0.5s ease; }
.screen-enter-from, .screen-leave-to { opacity: 0; }
</style>
