import type { ScenePalette, DecorElement, SceneImageResponse } from '~/types/scene'
import { useGameStore } from '~/stores/game'

/**
 * gpt-image-* ne renvoie que du base64 : `image` est une data URI, directement
 * utilisable en `src`. Rien n'expire, contrairement aux anciennes URLs dall-e-3.
 */
export function useImageGen() {
  const gameStore = useGameStore()
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function generateSceneImage(input: {
    sceneId: string
    placeName: string
    palette: ScenePalette
    decor: DecorElement[]
  }): Promise<string | null> {
    isLoading.value = true
    error.value = null
    gameStore.setPlayingSubState('image_loading')

    try {
      const res = await $fetch<SceneImageResponse>('/api/scene/image', {
        method: 'POST',
        body: {
          scene_id: input.sceneId,
          place_name: input.placeName,
          palette: input.palette,
          decor: input.decor,
        },
      })
      gameStore.setSceneImage(res.image)
      return res.image
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

  async function generateNpcPortrait(
    appearance: string,
    palette: ScenePalette,
    sceneId?: string
  ): Promise<string | null> {
    try {
      const res = await $fetch<SceneImageResponse>('/api/image/generate', {
        method: 'POST',
        body: { sceneId, appearance, palette },
      })
      return res.image
    } catch {
      return null
    }
  }

  return { generateSceneImage, generateNpcPortrait, isLoading, error }
}
