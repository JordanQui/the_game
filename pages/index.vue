<script setup lang="ts">
import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { usePaymentStore } from '~/stores/payment'

const gameStore = useGameStore()
const playerStore = usePlayerStore()
const paymentStore = usePaymentStore()

// Un joueur qui a déjà payé reprend sans repasser par le paywall. L'appel ne
// déclenche aucune génération : il ne fait que lire un cookie signé.
onMounted(async () => {
  if (gameStore.currentScreen === 'init') gameStore.setScreen('login')
  try {
    const access = await $fetch<{ active: boolean; expiresAt?: number }>('/api/access')
    paymentStore.setAccess(access.active, access.expiresAt ?? null)
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
      <LockScreen v-else-if="gameStore.currentScreen === 'locked'" key="locked" />
      <PaywallScreen v-else-if="gameStore.currentScreen === 'paywall'" key="paywall" />
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
          <GlowButton @click="gameStore.setScreen('playing')">Continuer l'aventure</GlowButton>
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
