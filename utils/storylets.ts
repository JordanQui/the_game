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
  /**
   * Une conversation est en cours et cette saisie s'y adresse.
   *
   * Vrai qu'il vienne de nommer quelqu'un ou qu'il poursuive un échange déjà
   * ouvert : dans les deux cas quelqu'un attend une réponse en face de lui, et
   * aucun moment local n'a le droit de parler à sa place.
   */
  talksToNpc: boolean
  /** Le joueur s'adresse au détenteur de l'objet-clé. */
  addressesHolder: boolean

  /** Cette scène exige un objet pour être quittée. */
  sceneHasKeyItem: boolean
  /**
   * On ne sort pas d'ici sans s'être servi de l'outil qu'on y a reçu.
   *
   * Vrai dans la scène qui remet l'augmentation, et seulement si le récit y a
   * bien mis quelque chose à lire : sans objet porteur d'`observation`, la
   * condition n'aurait aucun moyen d'être satisfaite et la porte ne s'ouvrirait
   * plus jamais.
   */
  exitNeedsAnalysis: boolean
  /** Il a ouvert au moins un objet qui avait quelque chose à lui apprendre. */
  hasAnalysed: boolean
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

  /**
   * Tour où la nuit se referme si le joueur n'a toujours pas l'objet.
   *
   * La scène venait autrefois à son secours à ce moment-là : les personnages
   * s'approchaient et lui tendaient ce qu'il cherchait. Elle se referme
   * désormais, et la ville reste fermée un cycle entier — le temps et les
   * tokens qu'une scène coûte ne sont pas illimités sur la fenêtre payante.
   */
  failureAtTurn: number

  /** Le joueur TEND un objet de son inventaire à quelqu'un. */
  offersItem: boolean
  /** Et cette personne attendait précisément celui-là. */
  offersWantedItem: boolean

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
  | { kind: 'local'; say: 'oracle' | 'nobody' | 'unused_lens' | 'exhausted' | 'game_over' }
  /** Un tour facturé. `mode` cadre le prompt côté serveur. */
  | { kind: 'model'; mode?: TurnMode }

/**
 * Ce qu'un moment change dans l'état, une fois joué.
 *
 * Il y en avait trois : le dénouement automatique en posait deux de plus. Il a
 * disparu avec le tour 10, qui ne sauve plus le joueur mais referme la nuit.
 */
export type StoryletEffect = 'offer_key_item' | 'consume_given_item'

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
/**
 * Le détenteur cède-t-il MAINTENANT ?
 *
 * Nommé parce que deux moments s'en servent : celui qui remet l'objet, et la
 * fermeture, qui doit s'effacer devant lui. Un joueur qui obtient enfin ce
 * qu'il cherchait au dernier tour ne se fait pas fermer la porte au nez.
 */
function remiseImminente(q: Qualities): boolean {
  return q.addressesHolder
    && q.sceneHasKeyItem
    && q.informed
    && !q.hasKeyItem
    && !q.pendingKeyItem
    && q.holderExchanges >= q.exchangesBeforeHandover
}

export const DECK: Storylet[] = [
  {
    id: 'commande',
    note: "le canal '#' court-circuite tout, y compris la porte",
    when: q => q.isCommand,
    play: { kind: 'command' },
  },
  {
    id: 'fermeture',
    note: 'la nuit se referme : toute la scène passée sans obtenir ce qu\'il fallait',
    // Juste après le canal '#', et avant tout le reste : au tour de la
    // fermeture, plus rien d'autre ne peut arriver — ni relance vers la porte,
    // ni réponse d'oracle. La seule exception est la remise, qui la précède
    // dans la logique sinon dans l'ordre : voir `remiseImminente`.
    when: q => q.sceneHasKeyItem
      && !q.hasKeyItem
      && !q.pendingKeyItem
      && q.failureAtTurn > 0
      // +1 : le tour qu'on s'apprête à jouer est celui de trop.
      && q.turn + 1 >= q.failureAtTurn
      && !remiseImminente(q),
    play: { kind: 'local', say: 'game_over' },
  },
  {
    id: 'sortie_bloquee',
    note: "il veut sortir mais l'objet lui manque : on le renvoie vers son détenteur",
    when: q => q.mentionsExit && q.sceneHasKeyItem && !q.hasKeyItem,
    play: { kind: 'model', mode: 'blocked_exit' },
  },
  {
    id: 'sortie_sans_analyse',
    note: "il tient l'outil sans s'en être servi : la porte attend qu'il ait lu quelque chose",
    // AVANT `sortie`, et c'est tout le mécanisme : récupérer l'augmentation ne
    // suffit pas à quitter l'auberge, il faut avoir compris ce qu'elle permet.
    // Ça se comprend en analysant un objet du récit, pas en l'empochant.
    when: q => q.mentionsExit && q.hasKeyItem && q.exitNeedsAnalysis && !q.hasAnalysed,
    play: { kind: 'local', say: 'unused_lens' },
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
    when: remiseImminente,
    play: { kind: 'model', mode: 'handover' },
    after: ['offer_key_item'],
  },
  {
    id: 'don',
    note: "il tend l'objet qu'on attendait de lui : la langue se délie",
    // AVANT l'oracle, pour la même raison que la remise : c'est un dénouement,
    // et une réponse déjà écrite ne doit pas le coiffer. Après la remise, qui
    // reste prioritaire — on ne fait pas patienter la scène qui se noue.
    when: q => q.offersWantedItem,
    play: { kind: 'model', mode: 'give' },
    after: ['consume_given_item'],
  },
  {
    id: 'don_refuse',
    note: "il tend quelque chose dont personne ne veut : on le lui rend",
    // Aucun effet : l'objet reste dans l'inventaire, c'est tout le propos.
    when: q => q.offersItem,
    play: { kind: 'model', mode: 'give_refused' },
  },
  {
    id: 'deja_ecrit',
    note: 'la scène générée contient déjà la réponse : la repayer serait payer deux fois',
    // JAMAIS pendant une conversation. L'oracle sert à interroger le monde, pas
    // les gens : tant qu'on parlait à quelqu'un, un « tu peux m'aider ? » ou un
    // « je vois » se faisait coiffer par un récapitulatif de quête, et le
    // personnage en face restait muet — ce qu'un joueur lit comme un PNJ qui ne
    // répond pas à ce qu'il dit.
    when: q => q.localAnswer !== null && !q.talksToNpc,
    play: { kind: 'local', say: 'oracle' },
  },
  {
    id: 'autonomie',
    note: 'plafond de tours ou budget atteint : la scène finit sans le modèle',
    when: q => !q.canCallModel,
    play: { kind: 'local', say: 'exhausted' },
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
