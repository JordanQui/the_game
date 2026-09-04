// Contrat TypeScript de game/script.json.
//
// Le JSON reste la source de vérité du CONTENU : éditable à chaud, sans rebuild,
// générable, lisible par un non-développeur. Ces types en décrivent la forme,
// et utils/script-runtime.ts y ajoute le COMPORTEMENT (résolution des defaults,
// assemblage des prompts, détection des sorties).

export interface ScriptMeta {
  title: string
  language: string
  genre: string
  narrative_mode: string
  note?: string
}

export interface Progression {
  start_scene: string
  order: string[]
}

/**
 * Répartition tonale visée. Volontairement pas 60:30:10 : le Dark Deco peint
 * sur fond noir, l'ombre y prend mécaniquement plus de place. Seule la part
 * d'accent doit être tenue au chiffre près.
 */
export interface TonalRatio {
  dominant_pct: number
  secondary_pct: number
  accent_pct: number
  description: string
}

export interface ArtDirection {
  render: string
  tonal_ratio: TonalRatio
  constraints: string[]
  negative: string
  image_model: string
  image_fallback_model: string
  image_size: string
  image_quality: string
  image_format: string
  accent_reserved_for: string
  accent_note: string
  image_prompt_template: string
  portrait_prompt_template: string
}

export interface PaletteDerivation {
  instruction: string
  sources: { dominant: string[]; secondary: string[]; accent: string[] }
}

export interface NarrativeRules {
  style: string
  instruction: string
  structure: string[]
  max_words: number
  forbidden: string[]
}

export interface TurnRules {
  max_tokens: number
  max_words: number
  system_prompt_template: string
  ambient_prompt: string
  npc_dialogue_prompt: string
  exit_nudge_prompt: string
}

export interface GenerationConfig {
  model: string
  temperature: number
  max_tokens: number
  system_prompt: string
  output_schema: Record<string, unknown>
}

export interface ErrorFallbacks {
  narrative_error: string
  loading_message: string
  image_loading: string
  image_error: string
}

/** Bloc hérité par toutes les scènes. Chaque scène peut le surcharger partiellement. */
export interface ScriptDefaults {
  art_direction: ArtDirection
  palette_derivation: PaletteDerivation
  narrative: NarrativeRules
  turn: TurnRules
  generation: GenerationConfig
  error_fallbacks: ErrorFallbacks
}

export type VisualWeight = 'dominant' | 'secondary' | 'accent' | 'none'

export interface DecorSlot {
  id: string
  role: string
  /** Chemin pointant dans le profil joueur, ou "static". */
  source: string
  visual_weight: VisualWeight
  required?: boolean
}

export interface AlwaysIncludeInteractable {
  id: string
  label: string
  verb: string
  triggers_paywall?: boolean
}

export interface SceneExit {
  id: string
  label: string
  keywords: string[]
  min_turns_before_trigger: number
  /** Id d'une autre scène, ou "PAYWALL". */
  leads_to: string
}

export interface SceneScript {
  id: string
  title: string
  order: number
  is_free: boolean
  is_paywall_gate: boolean
  image_setting: string
  focal_element: string
  /** Illustration figée, servie depuis public/. Court-circuite la génération. */
  static_image?: string
  naming: { instruction: string; sources: string[] }
  decor_slots: DecorSlot[]
  npcs: { count: number; instruction: string; source: string }
  quest: { instruction: string; source: string; structure: Record<string, string> }
  interactables: { instruction: string; always_include: AlwaysIncludeInteractable[] }
  exits: SceneExit[]

  /** Surcharges optionnelles des defaults, scène par scène. */
  art_direction?: Partial<ArtDirection>
  palette_derivation?: Partial<PaletteDerivation>
  narrative?: Partial<NarrativeRules>
  turn?: Partial<TurnRules>
  generation?: Partial<GenerationConfig>
}

export interface PaywallConfig {
  gate_text: string
  cta: string
  sub_cta: string
  amount_cents: number
  currency: string
}

export interface Script {
  id: string
  version: string
  meta: ScriptMeta
  progression: Progression
  defaults: ScriptDefaults
  scenes: SceneScript[]
  paywall: PaywallConfig
}

/** Une scène dont les defaults ont été résolus : plus aucun champ optionnel. */
export interface ResolvedScene extends SceneScript {
  art_direction: ArtDirection
  palette_derivation: PaletteDerivation
  narrative: NarrativeRules
  turn: TurnRules
  generation: GenerationConfig
  error_fallbacks: ErrorFallbacks
}
