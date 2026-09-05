import type { SceneTextResponse } from '~/types/scene'
import type { InterfaceSource } from '~/utils/ui-theme'
import { interfaceVariables } from '~/utils/ui-theme'

/**
 * Teint l'interface aux couleurs de la scène.
 *
 * Les variables sont posées sur `<html>`, où toute la feuille de style va les
 * chercher. Rien n'est recompilé : les classes Tailwind (`bg-neon-500`,
 * `border-neon-600/45`) désignent déjà `rgb(var(--neon-500) / <alpha>)`, donc
 * changer la variable change l'interface entière d'un coup.
 *
 * Sans appel à ce composable, la racine garde les valeurs écrites dans
 * `main.css` — le magenta d'origine. C'est ce qui se passe sur l'écran
 * d'accueil et sur la scène 1.
 */
/** Dernier recours : les rampes du thème, si rien n'est déclaré. */
const FALLBACK: InterfaceSource = {
  dominant: { hex: '#0E1420' },
  secondary: { hex: '#46536E' },
  accent: { hex: '#FF2E88' },
}

export function useInterfacePalette() {
  /**
   * Applique la palette d'une scène, si elle le demande.
   *
   * Une scène en `fixed` remet le magenta : sans ce retour, la teinte de la
   * scène précédente resterait collée à l'interface en revenant en arrière.
   */
  function applyScene(scene: Pick<SceneTextResponse, 'interface_palette' | 'palette'>) {
    if (!import.meta.client) return
    const source = scene.interface_palette === 'from_scene' && scene.palette
      ? scene.palette
      : declared()
    write(interfaceVariables(source))
  }

  /** Repose la palette de l'auberge : sortie de partie, retour à l'accueil. */
  function reset() {
    if (!import.meta.client) return
    write(interfaceVariables(declared()))
  }

  /**
   * La palette déclarée pour les premiers écrans, lue dans le script au build.
   *
   * Si elle manque — script incomplet — on retombe sur les rampes du thème
   * plutôt que de laisser l'interface sans couleur.
   */
  function declared() {
    const palette = useRuntimeConfig().public.uiPalette as InterfaceSource | undefined
    return palette?.accent?.hex ? palette : FALLBACK
  }

  function write(vars: Record<string, string>) {
    const root = document.documentElement
    for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value)
  }

  return { applyScene, reset }
}
