import type { SceneTextResponse } from '~/types/scene'
import type { UserProfile } from '~/types/user'
import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { useImageGen } from '~/composables/useImageGen'

/** La génération de scène tourne autour de 15-20 s ; au-delà, c'est perdu. */
const SCENE_TEXT_TIMEOUT_MS = 90_000

/**
 * Orchestre le pipeline découplé.
 *
 * Le texte arrive en ~20 s et la scène est jouable immédiatement ; l'image
 * arrive ~25 s plus tard et se glisse au-dessus du texte sans bloquer. Les
 * deux appels ne doivent jamais être fusionnés : ensemble ils dépassent
 * n'importe quel timeout serverless.
 */
export function useScene() {
  const gameStore = useGameStore()
  const playerStore = usePlayerStore()
  const { generateSceneImage } = useImageGen()

  const scene = ref<SceneTextResponse | null>(null)
  const isLoadingText = ref(false)
  const error = ref<string | null>(null)

  /** Phase 1. Bloquant : sans texte, pas de scène. */
  async function loadSceneText(sceneId?: string, user?: UserProfile) {
    isLoadingText.value = true
    error.value = null
    try {
      const res = await $fetch<SceneTextResponse>('/api/scene/text', {
        method: 'POST',
        body: { sceneId, user },
        signal: AbortSignal.timeout(SCENE_TEXT_TIMEOUT_MS),
      })
      scene.value = res
      playerStore.setScene(res)
      gameStore.addNarrativeEntry('narration', res.scene_text)
      gameStore.setPlayingSubState('awaiting_input')
      return res
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'TimeoutError'
      error.value = aborted
        ? 'Le monde a mis trop de temps à se dessiner.'
        : err instanceof Error ? err.message : 'Impossible de charger la scène'
      return null
    } finally {
      isLoadingText.value = false
    }
  }

  /** Phase 2. Non bloquant : on joue déjà pendant que l'image se dessine. */
  function loadSceneImage(res: SceneTextResponse) {
    return generateSceneImage({
      sceneId: res.scene_id,
      placeName: res.place.name,
      palette: res.palette,
      decor: res.decor,
    })
  }

  /** Le flux complet : texte d'abord, image ensuite, sans attendre. */
  async function enterScene(sceneId?: string, user?: UserProfile) {
    const res = await loadSceneText(sceneId, user)
    if (res) void loadSceneImage(res)
    return res
  }

  /** La commande du joueur touche-t-elle la porte ? */
  function hitsPaywall(input: string): boolean {
    const s = scene.value
    if (!s) return false
    if (gameStore.turnCount < s.paywall.min_turns_before_trigger) return false
    const lower = input.toLowerCase()
    return s.paywall.exit_keywords.some(kw => lower.includes(kw))
  }

  return { scene, isLoadingText, error, loadSceneText, loadSceneImage, enterScene, hitsPaywall }
}
