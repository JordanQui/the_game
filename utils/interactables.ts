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

/** Une chose du récit que la loupe peut ouvrir. */
export interface Analyzable {
  id: string
  label: string
  /** Ce que l'analyse révèle. Vide : l'objet se déchiffre, mais n'apprend rien. */
  observation?: string
}

/**
 * Tout ce qui, dans une scène, se chiffre dans le texte et s'ouvre à la loupe.
 *
 * UNE SEULE LISTE, parce qu'elle sert deux endroits qui ne doivent jamais
 * diverger : ce que le récit brouille, et ce que la sortie de l'auberge exige
 * qu'on ait lu. Deux listes séparées, et le joueur se retrouverait devant une
 * porte qui réclame l'analyse d'un objet qu'aucun texte n'a chiffré.
 *
 * L'objet-clé en fait partie — il est brouillé dans le récit avant d'être
 * remis. À l'auberge il porte une `observation` : son nom est prononcé dès
 * l'ouverture et le joueur ne peut pas le lire, si bien que le déchiffrer plus
 * tard lui apprend quelque chose. Ailleurs, où l'objet-clé est une carte, le
 * déchiffrer donne son nom et rien d'autre.
 */
export function analyzables(scene: {
  scene_id?: string
  key_item?: { name?: string; observation?: string } | null
  sealed_object?: { id: string; name?: string; observation?: string } | null
  interactables?: Interactable[]
}): Analyzable[] {
  const out: Analyzable[] = []
  // Le même id que celui que `collectKeyItem` lui donnera : déchiffré dans le
  // récit, il reste déchiffré une fois dans l'inventaire.
  if (scene.key_item?.name) {
    out.push({
      id: `cle_${scene.scene_id}`,
      label: scene.key_item.name,
      observation: scene.key_item.observation,
    })
  }
  if (scene.sealed_object?.name) {
    out.push({
      id: scene.sealed_object.id,
      label: scene.sealed_object.name,
      observation: scene.sealed_object.observation,
    })
  }
  for (const obj of scene.interactables ?? []) {
    if (!obj.label || !isTakeable(obj)) continue
    out.push({ id: obj.id, label: obj.label, observation: obj.observation })
  }
  return out
}

/** Celles qui ont quelque chose à apprendre : c'est ce que la loupe sert à lire. */
export function teaching(scene: Parameters<typeof analyzables>[0]): Analyzable[] {
  return analyzables(scene).filter(o => o.observation?.trim())
}
