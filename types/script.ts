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
  /** Lexique imposé du monde. Appliqué à la génération comme aux tours. */
  vocabulary: string
  /** Pourquoi le joueur est sorti ce soir. N'existe que pour le texte initial. */
  opening: string
}

export interface TurnRules {
  max_tokens: number
  max_words: number
  system_prompt_template: string
  ambient_prompt: string
  npc_dialogue_prompt: string
  exit_nudge_prompt: string

  /** Tour à partir duquel le narrateur oriente activement vers la sortie. */
  steer_after_turns: number
  /** Consigne ajoutée au prompt système une fois ce seuil franchi. */
  steer_instruction: string
  /** Variante employée tant que l'objet-clé n'est pas obtenu. */
  steer_instruction_missing_item: string
  /** Tour à partir duquel la partie se bloque faute d'être sortie. */
  lock_after_turns: number
  /** Plafond dur de tours facturés, si le comptage de tokens venait à manquer. */
  hard_turn_cap: number
  /** Ce que dit la scène quand elle passe en autonomie. */
  autonomous_notice: string
  /** Prompts du verdict de blocage. Le modèle répond en JSON. */
  lock_system_prompt: string
  lock_prompt_template: string

  /** Faits de l'objet-clé, ajoutés au prompt système dès qu'il existe. */
  key_item_context: string
  /** Réplique du détenteur tant qu'il garde l'objet : il amorce, il relance. */
  holder_prompt: string
  /** Réplique du détenteur au moment où il remet l'objet. */
  handover_prompt: string
  /** Narration quand le joueur veut sortir sans l'objet. */
  blocked_exit_prompt: string
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
  /** Règle de conception de l'objet sans lequel on ne peut pas sortir. */
  key_item: { instruction: string; exchanges_before_handover: number }

  /** Surcharges optionnelles des defaults, scène par scène. */
  art_direction?: Partial<ArtDirection>
  palette_derivation?: Partial<PaletteDerivation>
  narrative?: Partial<NarrativeRules>
  turn?: Partial<TurnRules>
  generation?: Partial<GenerationConfig>
}

export interface ZodiacSignScript {
  name: string
  element: string
  /** Le conflit intérieur que le signe inflige dans le rapport à la société. */
  tension: string
  /** À quoi ressemble sa résolution, en acte. */
  resolution: string
}

export interface ZodiacScript {
  note?: string
  generation_instruction: string
  turn_instruction: string
  signs: Record<string, ZodiacSignScript>
}

export interface NumerologyNumberScript {
  /** Manière d'agir — porté par le moolank. */
  drive: string
  /** Forme concrète de l'objectif — porté par le bhagyank. */
  destiny: string
  /** Façon dont le monde reçoit le joueur — porté par le namank. */
  reception: string
}

export interface NumerologyScript {
  note?: string
  generation_instruction: string
  numbers: Record<string, NumerologyNumberScript>
}

/** Tarifs et plafond de dépense. Le budget est arbitré, jamais facturé. */
export interface PricingConfig {
  note?: string
  input_per_1m_usd: number
  output_per_1m_usd: number
  image_per_call_usd: number
  scene_budget_usd: number
}

/** Quota par session, contre l'abus par rechargement. */
export interface LimitsConfig {
  note?: string
  window_hours: number
  scenes_per_session: number
  turns_per_session: number
  images_per_session: number
  messages: { scenes: string; turns: string; images: string }
  /** Quota ouvert par le paiement, sur une fenêtre bien plus large. */
  paid: {
    window_days: number
    scenes_per_window: number
    turns_per_window: number
    images_per_window: number
    messages: { scenes: string; turns: string; images: string }
  }
}

/** Argumentaire affiché à la sortie : ce que le jeu fait, et pourquoi continuer. */
export interface PaywallPitch {
  eyebrow: string
  points: Array<{ label: string; text: string }>
  closing: string
}

export interface PaywallConfig {
  gate_text: string
  cta: string
  sub_cta: string
  amount_cents: number
  currency: string
  pitch: PaywallPitch
}

export interface Script {
  id: string
  version: string
  meta: ScriptMeta
  progression: Progression
  defaults: ScriptDefaults
  scenes: SceneScript[]
  paywall: PaywallConfig
  zodiac: ZodiacScript
  numerology: NumerologyScript
  pricing: PricingConfig
  limits: LimitsConfig
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
