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
  /** Les noms qui comptent s'écrivent en Majuscules de Titre. */
  naming_style: string
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
  /** Variante employée tant que le joueur ignore qui détient l'objet. */
  steer_instruction_missing_informant: string
  /** Tour où les personnages viennent au joueur et dénouent la scène. */
  resolution_after_turns: number
  /** Narration de ce dénouement. */
  resolution_prompt: string
  /** Plafond dur de tours facturés, si le comptage de tokens venait à manquer. */
  hard_turn_cap: number
  /** Ce que dit la scène quand elle passe en autonomie. */
  autonomous_notice: string

  /** Faits de l'objet-clé, ajoutés au prompt système dès qu'il existe. */
  key_item_context: string
  /** Répondre d'abord à ce que dit le joueur. Commune à tous les personnages. */
  reply_rule?: string
  /** Orienter vers l'objectif sans jamais le dicter. */
  steer_rule?: string
  /** Échanges avec un personnage avant qu'il livre ce qu'il sait. */
  exchanges_before_steer?: number
  /** Ce que dit l'informateur tant qu'il jauge encore le joueur. */
  informant_warmup_prompt: string
  /** Réplique de l'informateur : il révèle qui détient l'objet. */
  informant_prompt: string
  /** Réplique du détenteur tant que le joueur n'a pas été informé : il ne lâche rien. */
  holder_locked_prompt: string
  /** Réplique du détenteur une fois le joueur informé : il amorce, il relance. */
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
/**
 * Qui teint l'habillage de l'interface.
 *
 * `from_scene` reprend la palette que la scène a demandée au prompt image :
 * dominante -> fond, secondaire -> bords, accent -> néon. `fixed` garde le
 * magenta d'origine — c'est le cas de l'écran d'accueil et de l'auberge, dont
 * l'illustration est figée.
 */
export interface InterfacePalette {
  mode: 'from_scene' | 'fixed'
  /**
   * La palette du mode `fixed` : celle de l'image figée de l'auberge.
   *
   * Le rose de l'accueil et de la scène 1 est son `accent`. Il n'est donc plus
   * une couleur écrite en dur quelque part dans le CSS, mais la même donnée
   * que celle des scènes générées, lue par le même chemin.
   */
  palette?: {
    note?: string
    dominant: { hex: string; name?: string }
    secondary: { hex: string; name?: string }
    accent: { hex: string; name?: string }
  }
  note?: string
  why?: string
}

/** Comment une scène sait ce qui a précédé. Voir `utils/journal.ts`. */
export interface Continuity {
  note?: string
  /** Nombre de scènes retenues. Au-delà, les plus anciennes tombent. */
  max_entries: number
  entry_fields: string[]
  /** Interpole `{{journal}}`. */
  prompt: string
  /** Ce qu'on écrit à la place quand rien ne précède. */
  empty: string
}

export interface ScriptDefaults {
  continuity: Continuity
  /** Ce que le récit vise à restaurer, sous la quête apparente. */
  deep_theme: { note?: string; instruction: string }
  /** Le schéma des champs de quête, commun à toutes les scènes. */
  quest: { note?: string; structure: Record<string, string> }
  /** L'objet scellé, hérité par les scènes qui n'en déclarent pas. */
  sealed_object: { note?: string; instruction: string }
  /** Ce que le joueur porte en arrivant, et ce que la scène doit en faire. */
  inventory: {
    note?: string
    prompt: string
    empty: string
    unread: string
    /** Cadrage propre à l'épilogue : on relit, on ne résout plus. */
    ending_prompt: string
    ending_empty: string
  }
  /** Comment une scène distribue ses personnages face à la tension. */
  cast: { note?: string; instruction: string }
  /** Comment l'exigence d'une scène devient l'objectif de CE joueur. */
  objective_derivation: { note?: string; instruction: string }
  art_direction: ArtDirection
  palette_derivation: PaletteDerivation
  interface_palette: InterfacePalette
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

/**
 * Comment l'objet-clé d'une scène s'obtient.
 *
 * `informant_then_holder` : trois rôles — celui qui accueille, celui qui sait,
 * celui qui garde. C'est le motif de l'auberge, celui qui fait parler à tout
 * le monde. `holder` : un seul personnage l'a, sans intermédiaire. `found` :
 * personne ne l'a, il est dans le décor et il faut savoir le lire.
 */
export type KeyItemAcquisition = 'informant_then_holder' | 'holder' | 'found'

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
  /** Règle de conception de l'augmentation sans laquelle on ne peut pas sortir. */
  key_item: {
    instruction: string
    exchanges_before_handover: number
    /** Défaut : `informant_then_holder`, le motif de l'auberge. */
    acquisition?: KeyItemAcquisition
    /** La posture du personnage qui détient l'objet, s'il y en a un. */
    holder_stance?: string
    /** La posture de celui qui met sur la piste, dans un motif à trois rôles. */
    informant_stance?: string
  }
  /** L'acte auquel la scène appartient. Voir `acts` à la racine du script. */
  act?: string
  /** `ending` : l'épilogue, qui ne suit pas le schéma des autres scènes. */
  kind?: 'scene' | 'ending'
  /** Cadrage du thème propre à l'épilogue : le point d'arrivée, pas la construction. */
  theme_frame?: { note?: string; instruction: string }
  /** La lecture finale : le seul moment du jeu qui parle au joueur en clair. */
  counsel?: { note?: string; registers: string[]; instruction: string }
  is_final?: boolean
  /**
   * Ce qui gouverne la scène côté joueur.
   *
   * `facet` désigne l'un des trois nombres — manière d'agir, forme de
   * l'objectif, accueil du monde — et `axis` dit où en est le joueur entre sa
   * tension et sa résolution. Un acte entier partage sa facette.
   */
  theme_focus?: {
    facet: 'drive' | 'destiny' | 'reception'
    facet_label: string
    axis: string
    step: number
  }
  /** Les positions face à la tension, dans l'ordre des personnages. */
  cast_stances?: Array<{ posture: string; means: string }>
  /** Règle de conception de l'objet scellé, à analyser. */
  /**
   * Le second objet, à déchiffrer pour approfondir la quête.
   *
   * Propre à l'auberge pour l'instant : les scènes suivantes s'en passent, et
   * le bloc du prompt disparaît quand il n'est pas déclaré.
   */
  sealed_object?: { instruction: string }
  /** Ce qu'il faut accomplir pour passer à la scène suivante. */
  objective: {
    note?: string
    kind: string
    /** L'exigence mécanique de la scène. Invariable : c'est la structure de l'arc. */
    requirement?: string
    statement?: string
  }

  /** Surcharges optionnelles des defaults, scène par scène. */
  art_direction?: Partial<ArtDirection>
  palette_derivation?: Partial<PaletteDerivation>
  interface_palette?: Partial<InterfacePalette>
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
  /** Interrupteur global. À false, aucune requête n'est décomptée ni refusée. */
  enabled: boolean
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

/** Hypothèses de prévision. Seuls les prix de PricingConfig sont mesurés. */
export interface EconomicsConfig {
  note?: string
  eur_usd: number
  price_eur: number
  conversion_rate_pct: number
  payment: { note?: string; fee_pct: number; fee_fixed_eur: number }
  /** Forme du produit : combien de scènes, dont combien gratuites. */
  experience: { note?: string; scenes_total: number; free_scenes: number; turns_per_scene: number }
  free_visitor: { note?: string; scenes: number; turns: number; images: number }
  paying_customer: { note?: string; scenes: number; turns: number; images: number }
}

/** Syllabaire construit : chaque syllabe porte un sens, les noms se composent. */
export interface OnomasticsConfig {
  note?: string
  instruction: string
  /** Syllabe initiale : ce que le personnage porte. */
  matiere: Record<string, string>
  /** Syllabe finale : ce qu'il en fait. */
  posture: Record<string, string>
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
  onomastics: OnomasticsConfig
  economics: EconomicsConfig
}

/** Une scène dont les defaults ont été résolus : plus aucun champ optionnel. */
export interface ResolvedScene extends SceneScript {
  art_direction: ArtDirection
  palette_derivation: PaletteDerivation
  interface_palette: InterfacePalette
  narrative: NarrativeRules
  turn: TurnRules
  generation: GenerationConfig
  error_fallbacks: ErrorFallbacks
}
