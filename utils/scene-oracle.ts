import type { SceneTextResponse } from '~/types/scene'
import { normalize } from '~/utils/text-match'

/**
 * Répond localement, sans appeler le modèle.
 *
 * La génération de scène a déjà produit — et déjà facturé — la description de
 * chaque élément de décor, ce que sait chaque personnage, la quête et l'objet.
 * Rappeler gpt-4o pour ressortir ces informations revient à payer deux fois.
 *
 * Cet oracle sert donc tout ce qui est déjà connu, et ne laisse au modèle que
 * ce qu'il est seul à savoir faire : une réplique neuve, une réaction inédite.
 */

export type LocalAnswerKind = 'decor' | 'npc_known' | 'guidance' | 'budget_exhausted'

export interface LocalAnswer {
  text: string
  kind: LocalAnswerKind
  /** Rendu comme réplique de PNJ plutôt que comme narration. */
  npcName?: string
}

/** Formulations par lesquelles un joueur demande quoi faire. */
const GUIDANCE_KEYWORDS = [
  'que faire', 'quoi faire', 'que dois je faire', 'je fais quoi', 'aide', 'aide moi',
  'help', 'indice', 'je suis perdu', 'je sais pas', 'je ne sais pas', 'objectif',
  'ma quete', 'la quete', 'rappelle', 'resume', 'ou en suis je',
]

/** Verbes d'observation : ils ne demandent jamais rien de neuf au modèle. */
const LOOK_KEYWORDS = [
  'examiner', 'examine', 'observer', 'observe', 'regarder', 'regarde', 'inspecter',
  'inspecte', 'voir', 'vois', 'fouiller', 'fouille', 'lire', 'lis',
]

function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some(n => haystack.includes(normalize(n)))
}

/** Le nom d'un élément apparaît-il dans la commande ? */
function namedIn(input: string, name: string): boolean {
  const words = normalize(name)
    .split(' ')
    .filter(w => w.length > 3 && !['dans', 'avec', 'pour', 'leur', 'sous', 'cette'].includes(w))
  if (!words.length) return false
  return words.some(w => input.includes(w))
}

/**
 * Le récapitulatif de progression, assemblé depuis la scène déjà générée.
 * C'est la réponse à « je fais quoi ? », et elle ne coûte rien.
 */
export function buildGuidance(
  scene: SceneTextResponse,
  state: { hasKeyItem: boolean; talkedToNpcIds: string[] }
): string {
  const lines: string[] = []
  lines.push(`Quête : ${scene.quest.title} — ${scene.quest.objective}`)

  const item = scene.key_item
  if (item && !state.hasKeyItem) {
    const holder = scene.npcs.find(n => n.id === item.npc_id)
    const others = scene.npcs.filter(n => !state.talkedToNpcIds.includes(n.id))
    lines.push("Il te manque quelque chose : personne ne sort d'ici sans.")
    if (others.length) {
      lines.push(`Tu n'as pas encore parlé à : ${others.map(n => n.name).join(', ')}.`)
    } else if (holder) {
      lines.push(`${holder.name} en sait plus qu'il n'en dit.`)
    }
  } else if (item) {
    lines.push(`Tu tiens ${item.name}. ${item.why}`)
    lines.push(`Il ne te reste qu'à franchir ${scene.paywall.exit_keywords[0] ?? 'le sas'}.`)
  }

  if (scene.npcs.length) {
    lines.push(`Ici ce soir : ${scene.npcs.map(n => `${n.name} (${n.archetype})`).join(' · ')}`)
  }
  return lines.join('\n')
}

/**
 * Tente de répondre sans le modèle.
 *
 * Renvoie null quand seule une génération peut faire l'affaire — c'est alors,
 * et seulement alors, qu'on paie un tour.
 */
export function resolveLocally(
  input: string,
  scene: SceneTextResponse,
  state: { hasKeyItem: boolean; talkedToNpcIds: string[] }
): LocalAnswer | null {
  const text = normalize(input)

  // « Je fais quoi ? » — la réponse est entièrement dans la scène déjà générée.
  if (containsAny(text, GUIDANCE_KEYWORDS)) {
    return { text: buildGuidance(scene, state), kind: 'guidance' }
  }

  // Observation d'un élément de décor : sa description est déjà écrite.
  if (containsAny(text, LOOK_KEYWORDS)) {
    const element = scene.decor.find(dec => dec.name && namedIn(text, dec.name))
    if (element?.description) {
      return { text: element.description, kind: 'decor' }
    }
  }

  // Un personnage déjà interrogé qui redit ce qu'il sait : aucune nouveauté à
  // générer. Le premier échange, lui, passe par le modèle.
  const npc = scene.npcs.find(n => namedIn(text, n.name))
  if (npc && state.talkedToNpcIds.includes(npc.id) && containsAny(text, GUIDANCE_KEYWORDS)) {
    return { text: npc.knows, kind: 'npc_known', npcName: npc.name }
  }

  return null
}
