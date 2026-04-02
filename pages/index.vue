<script setup lang="ts">
import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'

const gameStore = useGameStore()
const playerStore = usePlayerStore()

// Initialize to login screen
onMounted(() => {
  if (gameStore.currentScreen === 'init') {
    gameStore.setScreen('login')
  }
})

// After facebook data is loaded, move to world build
watch(() => playerStore.facebookData, (data) => {
  if (data && gameStore.currentScreen === 'facebook_loading') {
    gameStore.setScreen('world_build_loading')
  }
})
</script>

<template>
  <div class="min-h-screen bg-ink-900">
    <Transition name="screen" mode="out-in">
      <LoginScreen v-if="gameStore.currentScreen === 'login'" key="login" />
      <LoadingScreen v-else-if="gameStore.currentScreen === 'facebook_loading'" key="fb-loading" message="Récupération de vos données..." />
      <WorldBuildScreen v-else-if="gameStore.currentScreen === 'world_build_loading'" key="world-build" />
      <GameShell v-else-if="gameStore.currentScreen === 'playing'" key="game" />
      <PaywallScreen v-else-if="gameStore.currentScreen === 'paywall'" key="paywall" />
      <LoadingScreen v-else-if="gameStore.currentScreen === 'payment_processing'" key="payment-processing" message="Traitement du paiement..." />
      <div v-else-if="gameStore.currentScreen === 'payment_success'" key="payment-success" class="min-h-screen flex items-center justify-center text-center px-6">
        <div class="space-y-6 max-w-sm">
          <p class="text-amber-300 font-serif text-3xl text-glow">La quête commence...</p>
          <p class="text-parchment/70 font-serif text-sm italic">Votre aventure dans {{ playerStore.world?.name }} ne fait que commencer.</p>
          <GlowButton @click="gameStore.setScreen('playing')">
            Continuer l'aventure
          </GlowButton>
        </div>
      </div>
      <LoadingScreen v-else key="init" />
    </Transition>
  </div>
</template>

<style>
.screen-enter-active, .screen-leave-active {
  transition: opacity 0.5s ease;
}
.screen-enter-from, .screen-leave-to {
  opacity: 0;
}
</style>
