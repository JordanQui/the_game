import type { TurnMode } from '~/types/scene'
import type { LocalAnswer } from '~/utils/scene-oracle'

/**
 * Le deck de moments.
 *
 * Ce que le jeu répond à une saisie ne se décidait nulle part en particulier :
 * l'ordre de priorité était réparti entre `GameShell`, `useNarrative` et
 * `usePaywall`, et il ne se lisait qu'en suivant les retours anticipés de trois
 * fichiers. Un moment inséré au mauvais endroit passait inaperçu jusqu'à la
 * partie où il masquait le suivant.
 *
 * Ici l'ordre EST la liste. Le patron vient de la quality-based narrative de
 * Failbetter : un état plat — les qualités — et un paquet de moments dont
 * chacun déclare à quelles conditions il peut se jouer. On tire le premier qui
 * matche.
 *
 * Rien dans ce fichier ne coûte un appel au modèle : tirer, c'est filtrer une
 * liste de dix entrées. Ce qui coûte, c'est ce que le moment tiré décide de
 * jouer — et la moitié du deck existe justement pour répondre sans appeler
 * personne.
 *
 * Aucune condition ne lit la saisie du joueur : tout ce qui relevait du texte
 * a déjà été décanté en booléens par `useStorylets`. Le deck se teste donc
 * sans Vue, sans Pinia et sans scène.
 */

/**
 * L'état du monde tel que le deck a le droit de le regarder.
 *
 * Volontairement plat et sans objet imbriqué : une qualité qu'on ne peut pas
 * écrire en une ligne est une qualité qui n'a pas encore été comprise.
 */
export interface Qualities {
  /** La saisie commence par '#' : elle parle au scénario, pas au monde. */
  isCommand: boolean

  /** Tours déjà joués. Celui qu'on est en train de jouer n'y est pas encore. */
  turn: number

  /** La commande emploie les mots de la sortie, quel qu'en soit le moment. */
  mentionsExit: boolean
  /** Tour à partir duquel la porte accepte de s'ouvrir. */
  exitOpensAtTurn: number

  /** Le joueur veut parler à quelqu'un sans savoir son nom : il lui manque l'oeil. */
  addressesNobody: boolean
  /** Le joueur s'adresse au détenteur de l'objet-clé. */
  addressesHolder: boolean

  /** Cette scène exige un objet pour être quittée. */
  sceneHasKeyItem: boolean
  /** Le joueur le tient. */
  hasKeyItem: boolean
  /** Il lui est déjà tendu : il n'a plus qu'à le prendre. */
  pendingKeyItem: boolean
  /** Un habitué l'a mis sur la piste du détenteur. */
  informed: boolean
  /** Échanges avec le détenteur, celui de ce tour-ci compté d'avance. */
  holderExchanges: number
  /** Échanges qu'il exige avant de céder. */
  exchangesBeforeHandover: number

  /** La salle est déjà venue au joueur : le dénouement a eu lieu. */
  resolved: boolean
  /** Tour où elle vient. 0 quand la scène n'en prévoit pas. */
  resolutionAtTurn: number

  /** Une réponse déjà écrite dans la scène couvre la saisie. */
  localAnswer: LocalAnswer | null
  /** Ni le plafond de tours ni le budget ne sont atteints. */
  canCallModel: boolean
}

/** Ce qu'un moment fait quand il est tiré. */
export type StoryletPlay =
  /** Le canal '#' : on agit sur la machine à états, rien ne part au modèle. */
  | { kind: 'command' }
  /** La porte s'ouvre : le texte de sortie, puis l'écran. */
  | { kind: 'exit' }
  /** Une réponse déjà écrite quelque part. Aucun appel, aucun token. */
  | { kind: 'local'; say: 'oracle' | 'nobody' | 'exhausted' }
  /** Un tour facturé. `mode` cadre le prompt côté serveur. */
  | { kind: 'model'; mode?: TurnMode }

/** Ce qu'un moment change dans l'état, une fois joué. */
export type StoryletEffect = 'offer_key_item' | 'mark_resolved' | 'mark_informed'

export interface Storylet {
  id: string
  /** Ce que ce moment est, en une ligne. Sert aussi de trace au débogage. */
  note: string
  when: (q: Qualities) => boolean
  play: StoryletPlay
  /** Appliqué une fois le moment joué, jamais avant. */
  after?: StoryletEffect[]
}

/**
 * Le paquet, dans l'ordre de priorité.
 *
 * Cet ordre reproduit exactement celui qui était éparpillé dans le code : le
 * refactor ne devait rien changer à ce que joue une partie. Les endroits où il
 * se discute sont signalés — c'est tout l'intérêt de l'avoir mis à plat.
 */
export const DECK: Storylet[] = [
  {
    id: 'commande',
    note: "le canal '#' court-circuite tout, y compris la porte",
    when: q => q.isCommand,
    play: { kind: 'command' },
  },
  {
    id: 'sortie_bloquee',
    note: "il veut sortir mais l'objet lui manque : on le renvoie vers son détenteur",
    when: q => q.mentionsExit && q.sceneHasKeyItem && !q.hasKeyItem,
    play: { kind: 'model', mode: 'blocked_exit' },
  },
  {
    id: 'sortie',
    note: 'la porte cède : il a ce qu\'il était venu chercher, et l\'heure est venue',
    when: q => q.mentionsExit
      && q.turn >= q.exitOpensAtTurn
      && (!q.sceneHasKeyItem || q.hasKeyItem),
    play: { kind: 'exit' },
  },
  {
    id: 'sortie_trop_tot',
    note: 'il parle de partir trop tôt : on ramène le regard vers la porte sans dicter',
    when: q => q.mentionsExit,
    play: { kind: 'model', mode: 'exit_nudge' },
  },
  {
    id: 'anonyme',
    note: "il aborde quelqu'un sans le nommer : l'oeil, pas un tour d'ambiance facturé",
    when: q => q.addressesNobody,
    play: { kind: 'local', say: 'nobody' },
  },
  {
    id: 'remise',
    note: "le détenteur a assez parlé : il tend l'objet",
    // Passe AVANT l'oracle : la remise est le dénouement de la scène, elle
    // doit être narrée même quand la saisie ressemble à une question dont la
    // réponse est déjà écrite.
    when: q => q.addressesHolder
      && q.sceneHasKeyItem
      && q.informed
      && !q.hasKeyItem
      && !q.pendingKeyItem
      && q.holderExchanges >= q.exchangesBeforeHandover,
    play: { kind: 'model', mode: 'handover' },
    after: ['offer_key_item'],
  },
  {
    id: 'deja_ecrit',
    note: 'la scène générée contient déjà la réponse : la repayer serait payer deux fois',
    when: q => q.localAnswer !== null,
    play: { kind: 'local', say: 'oracle' },
  },
  {
    id: 'autonomie',
    note: 'plafond de tours ou budget atteint : la scène finit sans le modèle',
    when: q => !q.canCallModel,
    play: { kind: 'local', say: 'exhausted' },
  },
  {
    id: 'denouement',
    note: 'au seuil du script, la salle vient au joueur et pose l\'objet devant lui',
    // Discutable : il passe après l'oracle et après l'autonomie, donc une
    // question du type « je fais quoi ? » pile au tour du dénouement le
    // repousse d'un tour. C'était déjà le cas avant le deck.
    when: q => q.sceneHasKeyItem
      && q.resolutionAtTurn > 0
      && !q.resolved
      && !q.hasKeyItem
      && !q.pendingKeyItem
      // +1 : le tour qu'on s'apprête à jouer est celui du dénouement.
      && q.turn + 1 >= q.resolutionAtTurn,
    play: { kind: 'model', mode: 'resolution' },
    after: ['mark_resolved', 'mark_informed', 'offer_key_item'],
  },
  {
    id: 'tour',
    note: 'rien de particulier : un tour de jeu ordinaire',
    when: () => true,
    play: { kind: 'model' },
  },
]

/**
 * Tire le premier moment dont les conditions sont remplies.
 *
 * Le dernier du deck accepte tout : le tirage ne peut pas échouer, et il n'y a
 * donc pas de cas « aucun moment » à traiter chez l'appelant.
 */
export function draw(q: Qualities, deck: Storylet[] = DECK): Storylet {
  return deck.find(s => s.when(q)) ?? deck[deck.length - 1]!
}
