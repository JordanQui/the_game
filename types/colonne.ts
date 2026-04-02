export interface ColonneMeta {
  title: string
  language: string
  tone: string
}

export interface WorldBuilding {
  system_prompt: string
  world_prompt: string
  world_name_prompt: string
}

export interface PaywallTrigger {
  keywords: string[]
  min_turns_before_trigger: number
}

export interface SceneConfig {
  initial_image_prompt: string
  image_style: string
  image_negative_prompt: string
}

export interface NarrativePrompt {
  prompt: string
  max_tokens?: number
}

export interface NpcConfig {
  generation_prompt: string
  count: number
  portrait_prompt: string
}

export interface QuestConfig {
  generation_prompt: string
  reveal_turn: number
}

export interface DialogueConfig {
  system_prompt: string
}

export interface AmbientConfig {
  prompt: string
  max_tokens?: number
}

export interface Level {
  id: string
  name?: string
  is_free: boolean
  paywall_trigger: PaywallTrigger
  scene: SceneConfig
  opening_narrative: NarrativePrompt
  npcs: NpcConfig
  quest: QuestConfig
  npc_dialogue: DialogueConfig
  ambient_reactions: AmbientConfig
}

export interface PaywallConfig {
  message: string
  cta: string
  sub_cta?: string
  amount_cents: number
  currency: string
}

export interface ErrorFallbacks {
  narrative_error: string
  loading_message: string
}

export interface Colonne {
  id: string
  version?: string
  meta: ColonneMeta
  world_building: WorldBuilding
  levels: Level[]
  paywall: PaywallConfig
  error_fallbacks: ErrorFallbacks
}
