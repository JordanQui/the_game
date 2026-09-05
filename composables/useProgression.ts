import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { forgetStoredScene } from '~/composables/useScene'

/**
 * Le passage d'une scène à la suivante.
 *
 * Il n'existait nulle part : franchir le sas ramenait au même endroit, parce
 * que « continuer » ne faisait que réafficher l'écran de jeu — avec la scène
 * courante toujours en mémoire. Le paiement débloquait un droit d'accès sans
 * rien faire avancer.
 *
 * Un seul chemin ici, emprunté par la sortie jouée, par l'écran de paiement et
 * par les raccourcis de debug : les trois doivent laisser exactement le même
 * état derrière eux.
 */

export interface SceneRef {
  id: string
  title: string
  act: string | null
  kind: string
}

export function useProgression() {
  const gameStore = useGameStore()
  const playerStore = usePlayerStore()

  /** Les scènes dans l'ordre, telles que le build les a inscrites. */
  function scenes(): SceneRef[] {
    return (useRuntimeConfig().public.sceneIndex ?? []) as SceneRef[]
  }

  /** La scène qui suit celle en cours, ou null si c'était la dernière. */
  function next(): SceneRef | null {
    const all = scenes()
    const here = playerStore.scene?.scene_id ?? gameStore.pendingSceneId
    const i = all.findIndex(s => s.id === here)
    if (i < 0) return all[1] ?? null
    return all[i + 1] ?? null
  }

  /**
   * Ouvre une scène, quelle qu'elle soit.
   *
   * La scène quittée s'inscrit au journal — c'est lui que la suivante lira — et
   * la copie gardée en session est oubliée, sans quoi l'écran de construction
   * reposerait l'ancienne au lieu d'en demander une neuve.
   */
  function goTo(scene: SceneRef) {
    playerStore.closeScene()
    gameStore.startNewScene(scene.id)
    forgetStoredScene()
    // L'épilogue a son propre écran : il demande son texte et son image seul.
    gameStore.setScreen(scene.kind === 'ending' ? 'ending' : 'scene_build_loading')
  }

  /** Passe à la suite. Faux s'il n'y a plus rien après. */
  function advance(): boolean {
    const target = next()
    if (!target) return false
    goTo(target)
    return true
  }

  return { scenes, next, goTo, advance }
}
