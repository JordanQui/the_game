// Forme normalisée du profil joueur. Produite par utils/admission.ts à partir
// du formulaire d'admission ; game/user.json en tient le dossier type.

export type PassionIntensity = 'high' | 'medium' | 'low'

export interface UserPassion {
  theme: string
  intensity: PassionIntensity
  evidence: string[]
}

export interface UserPlace {
  name: string
  /**
   * Enrichissement local : le formulaire ne demande qu'un nom de ville.
   * Seul le dossier type de game/user.json en porte encore.
   */
  traits?: string[]
}

/**
 * Accord grammatical du joueur.
 *
 * Le jeu narre à la deuxième personne, en français : sans cette information le
 * modèle tranche tout seul, et il tranche au masculin. « Tu es entré » pour
 * une joueuse, c'est le monde qui cesse d'être le sien.
 */
export type UserAgreement = 'masculin' | 'feminin' | 'neutre'

/**
 * Quatre traces personnelles, qui n'existent que pour être remises en décor.
 *
 * Ce ne sont pas des données d'état civil : c'est ce à quoi la nuit va
 * s'accrocher — un objet qui traîne sur une table, un lieu qui ressemble à un
 * refuge, un nom qui revient dans la bouche d'un inconnu, une chose qui hérisse
 * le joueur et que la scène va lui mettre sous le nez.
 */
export interface UserImprints {
  /** Un objet auquel il tient. */
  keepsake?: string
  /** L'endroit où il va quand ça ne va pas. */
  refuge?: string
  /** Quelqu'un qui compte. Prénom seul. */
  ally?: string
  /** Ce qu'il ne supporte pas. */
  aversion?: string
}

/**
 * Un morceau qui compte pour le joueur.
 *
 * Élément SECONDAIRE, et qui doit le rester : le récit ne se bâtit jamais
 * dessus. Il sert de REGISTRE — une musique derrière une porte, ce qu'un
 * personnage fredonne, la façon dont un PNJ en parle comme d'un truc à lui.
 * Jamais les paroles : le prompt interdit déjà toute reprise littérale, et un
 * modèle sommé de restituer un texte protégé répond mal ou refuse. L'artiste
 * est facultatif — le titre seul porte déjà un genre et une époque, ce qui
 * suffit à choisir la musique d'un lieu.
 */
export interface UserAnthem {
  title: string
  artist?: string
}

/**
 * L'emploi de ses nuits.
 *
 * La seule partie du dossier qui ne consigne pas un fait mais un imaginaire :
 * aucun profil publicitaire ne l'a jamais su, et le joueur ne l'a jamais écrit
 * nulle part.
 *
 * La question est CONDITIONNELLE, et ça change tout : on ne demande pas quel
 * dormeur il est — un état, dont beaucoup n'ont rien à dire — mais ce qu'il
 * fait les nuits où il ne dort pas. Tout le monde en a, y compris ceux qui
 * dorment bien, et la réponse est un GESTE, pris DEHORS : le jeu est une nuit
 * dans une ville, un quai ou un dernier bar lui donnent un décor, une heure et
 * une raison d'être là ; le plafond d'une chambre ne lui donne rien. Le rêve, lui, est le seul élément du dossier
 * qui a le droit de reparaître aux dix scènes sans lasser : puisqu'il REVIENT,
 * c'est un motif et pas une anecdote.
 */
export interface UserNights {
  /** Ce qu'il fait les nuits où il ne dort pas. Deux touches au plus. */
  awake_habits?: string[]
  /** Et plus précisément, dans ses mots. */
  awake_note?: string
  /** Les formes du rêve qui revient. Deux touches au plus. */
  dream_motifs?: string[]
  /** Le rêve dans ses mots, s'il a pris la peine. */
  dream_note?: string
}

export interface UserProfile {
  identity: {
    id?: string
    /** Prénom et nom réunis. C'est le nom du dossier, et celui qu'on affiche. */
    name: string
    /**
     * Le prénom seul.
     *
     * C'est LUI que les personnages emploient, et lui qui porte le namank : la
     * numérologie indienne pèse le nom par lequel on est appelé, pas l'état
     * civil complet.
     */
    first_name?: string
    last_name?: string
    picture_url?: string
    birthday?: string
    age?: number
    /** Comment accorder ce qu'on lui adresse. */
    agreement?: UserAgreement
  }
  origin: {
    hometown?: UserPlace
    current_location?: UserPlace
  }
  /**
   * Ce qui a fait bifurquer le joueur.
   *
   * Il y avait ici une formation et un parcours professionnel : le formulaire
   * ne les demande plus. Un intitulé de poste et un nom d'école ne survivaient
   * pas à la transposition — le prompt interdit toute reprise littérale, et il
   * n'en restait qu'une enseigne. Les empreintes ont pris leur place partout
   * où elles servaient de source, y compris pour la couleur secondaire.
   */
  trajectory: {
    turning_points: string[]
  }
  passions: UserPassion[]
  /** Un morceau, tenu en registre. Voir UserAnthem : jamais de paroles. */
  anthem?: UserAnthem
  imprints?: UserImprints
  /** Ce qu'il fait de ses nuits, et le rêve qui revient. */
  nights?: UserNights
  misc_facts?: string[]
}
