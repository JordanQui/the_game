import { normalize } from '~/utils/text-match'
import type { Interactable } from '~/types/scene'

/**
 * Ce qui, dans une scène, s'ACQUIERT.
 *
 * La distinction compte deux fois, et il fallait donc qu'elle n'existe qu'une :
 * elle décide du bouton « Ramasser » qui apparaît sous le récit, et de ce qui
 * se chiffre dans le texte. Les deux listes doivent être la même — un objet
 * qu'on peut prendre sans qu'il soit chiffré s'attrape sans avoir été lu, un
 * objet chiffré qu'on ne peut pas prendre est une promesse en l'air.
 *
 * Le décor ordinaire n'en fait pas partie : on ne ramasse pas une voûte de
 * béton, et la chiffrer noierait le signal sous le mobilier.
 */

/** Verbes qui désignent une prise. Le reste — examiner, parler — n'en est pas une. */
export const TAKE_VERBS = [
  'prendre', 'ramasser', 'recuperer', 'récupérer', 'empocher', 'saisir', 'voler', 'emporter',
]

/** L'objet se ramasse-t-il ? La sortie, qui déclenche le paywall, n'est pas un objet. */
export function isTakeable(obj: Interactable): boolean {
  if (obj.triggers_paywall) return false
  return TAKE_VERBS.includes(normalize(obj.verb ?? ''))
}
