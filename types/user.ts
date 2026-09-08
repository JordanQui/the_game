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
  imprints?: UserImprints
  misc_facts?: string[]
}
