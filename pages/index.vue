<script setup lang="ts">
import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'

const gameStore = useGameStore()
const playerStore = usePlayerStore()

onMounted(() => {
  if (gameStore.currentScreen === 'init') gameStore.setScreen('login')
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
      <LoadingScreen v-else-if="gameStore.currentScreen === 'payment_processing'" key="pay" message="Traitement du paiement..." />
      <div v-else-if="gameStore.currentScreen === 'payment_success'" key="success" class="min-h-[100dvh] flex items-center justify-center text-center px-6">
        <div class="space-y-6 max-w-sm">
          <p class="text-amber-300 font-serif text-3xl text-glow">La porte s'ouvre...</p>
          <p class="text-parchment/70 font-serif text-sm italic">
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
