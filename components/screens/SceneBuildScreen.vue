<script setup lang="ts">
import { usePlayerStore } from '~/stores/player'
import { useGameStore } from '~/stores/game'
import { useScene } from '~/composables/useScene'

const playerStore = usePlayerStore()
const gameStore = useGameStore()
const { loadSceneText, loadSceneImage, error } = useScene()

const messages = [
  'Les étoiles alignent les présages...',
  'Les vieilles cartes se redessinent...',
  'Les esprits du monde prennent forme...',
  'L\'histoire cherche son héros...',
]
const currentMessage = ref(messages[0])
let interval: ReturnType<typeof setInterval> | null = null

function startMessages() {
  let i = 0
  interval = setInterval(() => {
    i = (i + 1) % messages.length
    currentMessage.value = messages[i]
  }, 2500)
}

async function build() {
  startMessages()

  // Phase 1 : le texte. Bloquant, c'est lui qui rend la scène jouable.
  const scene = await loadSceneText(undefined, playerStore.profile ?? undefined)

  if (interval) clearInterval(interval)
  if (!scene) return

  gameStore.setScreen('playing')

  // Phase 2 : l'image, en tâche de fond. On joue déjà.
  void loadSceneImage(scene).then(() => playerStore.markImageReady())
}

onMounted(build)

onUnmounted(() => { if (interval) clearInterval(interval) })
</script>

<template>
  <div class="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center">
    <div class="space-y-8 w-full max-w-sm">
      <div class="text-5xl animate-flicker select-none">🕯️</div>

      <Transition name="fade" mode="out-in">
        <p :key="currentMessage" class="text-amber-400/80 font-serif text-base sm:text-lg italic">
          {{ currentMessage }}
        </p>
      </Transition>

      <div class="space-y-2 text-left">
        <div class="flex items-center gap-3 text-xs">
          <span :class="playerStore.buildProgress.text ? 'text-amber-400' : 'text-ink-600'">
            {{ playerStore.buildProgress.text ? '✓' : '○' }}
          </span>
          <span :class="playerStore.buildProgress.text ? 'text-parchment/70' : 'text-ink-500'">
            Le lieu et la quête prennent forme
          </span>
        </div>
        <div class="flex items-center gap-3 text-xs">
          <span class="text-ink-600">○</span>
          <span class="text-ink-500">L'illustration se dessine (en arrière-plan)</span>
        </div>
      </div>

      <div v-if="error" class="space-y-3 pt-2">
        <p class="text-red-400/80 text-xs">{{ error }}</p>
        <GlowButton class="w-full" @click="build">Réessayer</GlowButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.6s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
