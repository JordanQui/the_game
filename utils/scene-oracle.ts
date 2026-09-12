import type { SceneTextResponse } from '~/types/scene'
import type { LangCode } from '~/types/i18n'
import { DEFAULT_LANG } from '~/types/i18n'
import { normalize } from '~/utils/text-match'
import { pack, translate } from '~/utils/languages'
import { teaching, isTakeable } from '~/utils/interactables'

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

/** Ce que l'oracle a besoin de savoir du joueur pour répondre sans le modèle. */
export interface OracleState {
  hasKeyItem: boolean
  talkedToNpcIds: string[]
  /** Il a ouvert un objet qui avait quelque chose à lui apprendre. */
  hasAnalysed: boolean
  /** Les ids de ce qu'il porte déjà : ce qui est ramassé n'est plus à trouver. */
  carriedIds: string[]
}

export interface LocalAnswer {
  text: string
  kind: LocalAnswerKind
  /** Rendu comme réplique de PNJ plutôt que comme narration. */
  npcName?: string
}

function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some(n => haystack.includes(normalize(n)))
}

/**
 * Le nom d'un élément apparaît-il dans la commande ?
 *
 * Les mots vides viennent du pack : ils étaient français en dur, et « dans »
 * ou « avec » ne filtrent rien dans une phrase anglaise — c'est « with » et
 * « from » qu'il faut y écarter, sans quoi un nom composé les prendrait pour
 * des mots pleins et matcherait n'importe quelle commande qui les contient.
 */
function namedIn(input: string, name: string, lang: LangCode): boolean {
  const stopwords = pack(lang).input.stopwords.map(normalize)
  const words = normalize(name)
    .split(' ')
    .filter(w => w.length > 3 && !stopwords.includes(w))
  if (!words.length) return false
  return words.some(w => input.includes(w))
}

/**
 * Le récapitulatif de progression, assemblé depuis la scène déjà générée.
 * C'est la réponse à « je fais quoi ? », et elle ne coûte rien.
 */
export function buildGuidance(
  scene: SceneTextResponse,
  state: OracleState,
  lang: LangCode = DEFAULT_LANG,
): string {
  const t = (key: string, vars?: Record<string, string>) => translate(lang, key, vars)
  const lines: string[] = []
  lines.push(t('oracle.quest', { title: scene.quest.title, objective: scene.quest.objective }))

  const item = scene.key_item
  if (item && !state.hasKeyItem) {
    const holder = scene.npcs.find(n => n.id === item.npc_id)
    const others = scene.npcs.filter(n => !state.talkedToNpcIds.includes(n.id))
    lines.push(t('oracle.missing'))
    if (others.length) {
      lines.push(t('oracle.not_talked', { names: others.map(n => n.name).join(', ') }))
    } else if (holder) {
      lines.push(t('oracle.holder_knows', { name: holder.name }))
    }
  } else if (item) {
    lines.push(t('oracle.holding', { item: item.name, why: item.why }))
    // Le tenir ne suffit pas là où on vient de le recevoir : la porte attend
    // qu'on s'en soit servi. Ne pas le dire ici enverrait le joueur vers un sas
    // qui le refuserait — voir le moment `sortie_sans_analyse`.
    if (scene.grants_augmentation && !state.hasAnalysed && teaching(scene, lang).length) {
      lines.push(t('oracle.use_lens'))
    } else {
      // Le libellé de la sortie plutôt que le premier mot-clé : depuis que les
      // mots-clés viennent du pack, le premier est un verbe générique
      // (« sortir », « exit ») et non le nom de la porte de CETTE scène.
      lines.push(t('oracle.just_exit', {
        exit: scene.exit_label || scene.paywall.exit_keywords[0] || '',
      }))
    }
  }

  // Les gens ne donnent pas tout. Sans cette ligne, le récapitulatif n'envoie
  // le joueur que vers des personnages, et il traverse la salle sans voir que
  // le récit y a posé quelque chose — la Majuscule est le seul signal, et rien
  // d'autre ne le lui apprend.
  const loose = (scene.interactables ?? []).filter(
    obj => obj.label && isTakeable(obj, lang) && !state.carriedIds.includes(obj.id))
  if (loose.length) lines.push(t('oracle.takeable'))

  if (scene.npcs.length) {
    lines.push(t('oracle.present', {
      npcs: scene.npcs.map(n => `${n.name} (${n.archetype})`).join(' · '),
    }))
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
  state: OracleState,
  lang: LangCode = DEFAULT_LANG,
): LocalAnswer | null {
  const text = normalize(input)
  // Les formulations viennent du pack : « what do I do » ne ressemble en rien
  // à « je fais quoi », et une liste française n'aurait rien reconnu ailleurs —
  // chaque « aide ? » serait alors reparti en génération, donc facturé.
  const { guidance, look } = pack(lang).input

  // « Je fais quoi ? » — la réponse est entièrement dans la scène déjà générée.
  if (containsAny(text, guidance)) {
    return { text: buildGuidance(scene, state, lang), kind: 'guidance' }
  }

  // Observation d'un élément de décor : sa description est déjà écrite.
  if (containsAny(text, look)) {
    const element = scene.decor.find(dec => dec.name && namedIn(text, dec.name, lang))
    if (element?.description) {
      return { text: element.description, kind: 'decor' }
    }
  }

  // Un personnage déjà interrogé qui redit ce qu'il sait : aucune nouveauté à
  // générer. Le premier échange, lui, passe par le modèle.
  const npc = scene.npcs.find(n => namedIn(text, n.name, lang))
  if (npc && state.talkedToNpcIds.includes(npc.id) && containsAny(text, guidance)) {
    return { text: npc.knows, kind: 'npc_known', npcName: npc.name }
  }

  return null
}
