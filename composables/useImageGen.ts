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
    // État dédié : l'image ne touche pas au playingSubState, sinon elle
    // bloquerait la saisie pendant les ~30 s de génération.
    gameStore.startSceneImage()

    try {
      const res = await $fetch<SceneImageResponse>('/api/scene/image', {
        method: 'POST',
        query: import.meta.dev && useRoute().query.fresh ? { fresh: '1' } : {},
        body: {
          scene_id: input.sceneId,
          place_name: input.placeName,
          palette: input.palette,
          decor: input.decor,
        },
      })
      gameStore.setSceneImage(res.image)
      gameStore.finishSceneImage()
      return res.image
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de génération d\'image'
      error.value = message
      gameStore.failSceneImage(message)
      return null
    } finally {
      isLoading.value = false
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
