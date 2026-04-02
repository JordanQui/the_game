import { useGameStore } from '~/stores/game'
import { interpolate } from '~/utils/prompt-builder'

export function useImageGen() {
  const gameStore = useGameStore()
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function generateSceneImage(prompt: string, style: string, variables?: Record<string, string>) {
    isLoading.value = true
    error.value = null
    gameStore.setPlayingSubState('image_loading')

    try {
      const finalPrompt = variables ? interpolate(prompt, variables) : prompt
      const { url } = await $fetch<{ url: string }>('/api/image/generate', {
        method: 'POST',
        body: { prompt: finalPrompt, style },
      })
      gameStore.setSceneImage(url)
      return url
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Erreur de génération d\'image'
      return null
    } finally {
      isLoading.value = false
      if (gameStore.playingSubState === 'image_loading') {
        gameStore.setPlayingSubState('awaiting_input')
      }
    }
  }

  async function generateNpcPortrait(npcAppearance: string): Promise<string | null> {
    try {
      const { url } = await $fetch<{ url: string }>('/api/image/generate', {
        method: 'POST',
        body: {
          prompt: interpolate('Medieval fantasy character portrait, {{npc_appearance}}, oil painting style, warm candlelight illumination, detailed face with character, fantasy tavern background, painterly brushwork', {
            npc_appearance: npcAppearance,
          }),
          style: 'character portrait, detailed face, warm lighting',
        },
      })
      return url
    } catch {
      return null
    }
  }

  return { generateSceneImage, generateNpcPortrait, isLoading, error }
}
