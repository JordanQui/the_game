export type GameScreen =
  | 'init'
  | 'login'
  | 'facebook_loading'
  | 'scene_build_loading'
  | 'playing'
  | 'paywall'
  | 'payment_processing'
  | 'payment_success'
  /** L'épilogue : le couchant, et le texte de fin par-dessus. */
  | 'ending'
  /**
   * La ville est fermée : la nuit a patiné, ou l'histoire est allée au bout.
   * Plus aucune requête ne part d'ici.
   */
  | 'locked'

// L'image a son propre état dans le store : elle ne doit pas bloquer la saisie.
export type PlayingSubState =
  | 'narrative_streaming'
  | 'awaiting_input'
  | 'npc_dialogue'

export type NarrativeEntryType =
  | 'narration'
  | 'npc_speech'
  | 'system'
  | 'player_command'

export interface NarrativeEntry {
  id: string
  type: NarrativeEntryType
  text: string
  npcName?: string
  timestamp: number
}

/** Avancement du pipeline découplé, affiché pendant le chargement. */
export interface SceneBuildProgress {
  text: boolean
  image: boolean
}
