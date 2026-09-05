import { interfaceVariables } from '~/utils/ui-theme'

/**
 * Pose la couleur des premiers écrans, avant toute scène.
 *
 * L'accueil et la scène 1 n'ont pas de palette générée d'où tirer leur rose :
 * ils prennent celle, déclarée, de l'image figée de l'auberge. Ça passe par la
 * même fonction que les scènes suivantes, donc le rose de l'interface EST un
 * `palette.accent` — il n'existe plus de magenta écrit en dur.
 *
 * Les mêmes valeurs sont déjà dans `main.css` pour le premier rendu : ce
 * plugin ne fait que reprendre la main, sans changement visible. Elles ne
 * peuvent pas diverger sans qu'on le voie, `scripts/check-palette.mjs` compare
 * les deux.
 */
export default defineNuxtPlugin(() => {
  const palette = useRuntimeConfig().public.uiPalette as
    { dominant: { hex: string }; secondary: { hex: string }; accent: { hex: string } } | undefined
  if (!palette?.accent?.hex) return

  const root = document.documentElement
  for (const [name, value] of Object.entries(interfaceVariables(palette))) {
    root.style.setProperty(name, value)
  }
})
