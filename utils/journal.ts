import type { SceneTextResponse } from '~/types/scene'

/**
 * Ce qu'une scène laisse à la suivante.
 *
 * L'histoire n'est pas générée d'un bloc au départ : dix scènes demanderaient
 * 26 000 tokens de sortie pour un plafond de 16 384, et ça figerait tout avant
 * que le joueur ait joué. Chaque scène naît donc à son tour, avec ce résumé.
 *
 * Il est construit à partir de ce que le client a DÉJÀ — titre, lieu, objectif,
 * noms, objet emporté. Aucun appel au modèle pour résumer : ça ne coûte rien à
 * fabriquer, et environ 0,06 centime d'entrée par scène à transporter.
 */
export interface JournalEntry {
  scene_title: string
  place_name: string
  /** Ce que le joueur y a accompli : l'objectif de la scène. */
  what_changed: string
  /** Les noms qui ont compté, pour qu'ils ne réapparaissent pas ailleurs. */
  who_mattered: string[]
  /** Ce qu'il en a emporté. */
  carried: string | null
}

export function entryFrom(scene: SceneTextResponse): JournalEntry {
  const byId = (id?: string) => scene.npcs?.find(n => n.id === id)?.name
  const who = [byId(scene.key_item?.informant_npc_id), byId(scene.key_item?.npc_id)]
    .filter((n): n is string => Boolean(n))

  return {
    scene_title: scene.scene_title,
    place_name: scene.place?.name ?? scene.scene_title,
    what_changed: scene.quest?.objective ?? '',
    who_mattered: who,
    carried: scene.key_item?.name ?? null,
  }
}

/** Le résumé tel que le modèle le lit. Borné : les scènes anciennes tombent. */
export function renderJournal(entries: JournalEntry[], max: number): string {
  return entries.slice(-max).map((e, i) => {
    const lines = [`${i + 1}. ${e.scene_title} — ${e.place_name}`]
    if (e.what_changed) lines.push(`   ce qui s'y est joué : ${e.what_changed}`)
    if (e.who_mattered.length) lines.push(`   qui a compté : ${e.who_mattered.join(', ')}`)
    if (e.carried) lines.push(`   emporté : ${e.carried}`)
    return lines.join('\n')
  }).join('\n')
}

/**
 * Un objet que le joueur transporte d'une scène à l'autre.
 *
 * `decrypted` dit si son nom a été lu — un objet dont l'épreuve n'a pas été
 * passée ne peut pas être nommé dans le récit, puisque le joueur l'ignore.
 */
export interface CarriedItem {
  id: string
  label: string
  decrypted: boolean
  /** Le lieu où il a été ramassé, pour que le récit puisse y renvoyer. */
  from?: string
  /**
   * `key` : il ouvre quelque chose, ici ou plus loin. `lore` : il n'ouvre rien
   * et éclaire la quête. Les deux voyagent, mais une scène ne s'en sert pas de
   * la même façon — l'une se déverrouille, l'autre se comprend.
   */
  kind: 'key' | 'lore'
  /** Sa couleur, pour une carte : c'est ce que le joueur retient et compare. */
  color?: string
}
