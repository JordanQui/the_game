export type GameScreen =
  | 'init'
  | 'login'
  | 'facebook_loading'
  | 'world_build_loading'
  | 'playing'
  | 'paywall'
  | 'payment_processing'
  | 'payment_success'

export type PlayingSubState =
  | 'narrative_streaming'
  | 'image_loading'
  | 'awaiting_input'
  | 'npc_dialogue'

export type NarrativeEntryType =
  | 'narration'
  | 'npc_speech'
  | 'system'
  | 'player_command'
  | 'quest_reveal'

export interface NarrativeEntry {
  id: string
  type: NarrativeEntryType
  text: string
  npcName?: string
  timestamp: number
}

export interface GeneratedNPC {
  id: string
  name: string
  archetype: string
  appearance: string
  personality: string
  backstory: string
  opening_line: string
  knows_about_quest: boolean
  portraitUrl?: string
}

export interface GeneratedQuest {
  title: string
  hook: string
  objective: string
  stakes: string
  artifact: string
  antagonist_hint: string
}

export interface GeneratedWorld {
  name: string
  description: string
}

export interface WorldBuildProgress {
  worldName: boolean
  worldDescription: boolean
  npcs: boolean
  quest: boolean
}
