<script setup lang="ts">
import { usePlayerStore } from '~/stores/player'
import { useGameStore } from '~/stores/game'
import { useImageGen } from '~/composables/useImageGen'
import { useNarrative } from '~/composables/useNarrative'
import { buildInterestsString, buildLifeEventsString } from '~/utils/facebook-classifier'

const playerStore = usePlayerStore()
const gameStore = useGameStore()
const { generateSceneImage } = useImageGen()
const { streamNarrative } = useNarrative()

const loadingMessages = [
  'Les étoiles alignent les présages...',
  'Les vieilles cartes se redessinent...',
  'Les esprits du monde prennent forme...',
  'L\'histoire cherche son héros...',
]
const currentMessage = ref(loadingMessages[0])
let msgInterval: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  let msgIdx = 0
  msgInterval = setInterval(() => {
    msgIdx = (msgIdx + 1) % loadingMessages.length
    currentMessage.value = loadingMessages[msgIdx]
  }, 2500)

  await buildWorld()

  if (msgInterval) clearInterval(msgInterval)
  gameStore.setScreen('playing')
})

onUnmounted(() => { if (msgInterval) clearInterval(msgInterval) })

async function buildWorld() {
  if (!playerStore.facebookData) return

  const fd = playerStore.facebookData
  const lifeEventsSummary = buildLifeEventsString(fd)
  const interestsAndHobbies = buildInterestsString(fd)
  const importantLifeEvents = fd.importantLifeEvents.turning_points.join('. ')

  // Build world + NPCs + quest in parallel
  const { world, npcs, quest } = await $fetch<{
    world: { name: string; description: string }
    npcs: import('~/types/game').GeneratedNPC[]
    quest: import('~/types/game').GeneratedQuest
  }>('/api/world/build', {
    method: 'POST',
    body: {
      colonneId: 'auberge_v1',
      playerName: fd.playerName,
      lifeEventsSummary,
      interestsAndHobbies,
      importantLifeEvents,
    },
  })

  playerStore.setWorld(world)
  playerStore.setNpcs(npcs)
  playerStore.setQuest(quest)

  // Generate scene image and opening narrative in parallel
  await Promise.all([
    generateSceneImage(
      'A cozy medieval fantasy tavern interior at night, warm golden candlelight, thick wooden beams on ceiling, crackling stone fireplace, adventurers and mysterious patrons at rough-hewn tables, mugs of ale, wanted posters on walls, atmospheric smoke, oil painting style, fantasy illustration, rich amber and brown tones, highly detailed, cinematic lighting',
      'oil painting, fantasy illustration, warm amber and ochre tones',
      { scene_mood: 'mysterious and inviting' }
    ),
    streamNarrative('levels.0.opening_narrative.prompt', {
      player_name: fd.playerName,
      world_name: world.name,
    }),
  ])
}
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center px-6 text-center">
    <div class="space-y-8 max-w-sm">
      <!-- Animated candle icon -->
      <div class="text-5xl animate-flicker select-none">🕯️</div>

      <!-- Status message -->
      <Transition name="fade" mode="out-in">
        <p :key="currentMessage" class="text-amber-400/80 font-serif text-lg italic">
          {{ currentMessage }}
        </p>
      </Transition>

      <!-- Progress indicators -->
      <div class="space-y-2 text-left w-full">
        <div v-for="(label, key) in {
          worldName: 'Le royaume prend forme',
          worldDescription: 'L\'ambiance se dessine',
          npcs: 'Les habitants arrivent',
          quest: 'La quête se révèle',
        }" :key="key" class="flex items-center gap-3 text-xs">
          <span :class="playerStore.buildProgress[key as keyof typeof playerStore.buildProgress] ? 'text-amber-400' : 'text-ink-600'">
            {{ playerStore.buildProgress[key as keyof typeof playerStore.buildProgress] ? '✓' : '○' }}
          </span>
          <span :class="playerStore.buildProgress[key as keyof typeof playerStore.buildProgress] ? 'text-parchment/70' : 'text-ink-500'">
            {{ label }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.6s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
