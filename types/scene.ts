// Ce que produit la fusion d'une scène de game/script.json avec un profil joueur.
// Le pipeline est découplé en deux phases :
//   1. POST /api/scene/text   -> texte + palette + décor + prompt image (~20 s)
//   2. POST /api/scene/image  -> illustration seule (~25 s)

export interface PaletteColor {
  hex: string
  name: string
  coverage_pct: number
  rationale: string
}

export interface ScenePalette {
  dominant: PaletteColor
  secondary: PaletteColor
  accent: PaletteColor
}

export interface DecorElement {
  slot_id: string
  name: string
  description: string
  /** Fragment anglais court, injecté tel quel dans le prompt image. */
  visual: string
}

export interface SceneNPC {
  id: string
  name: string
  archetype: string
  appearance: string
  personality: string
  knows: string
  opening_line: string
  /** Data URI, ajoutée après coup par /api/image/generate. */
  portraitUrl?: string
  /**
   * Syllabe de posture, sans tiret. Jamais affichée : elle dit la position du
   * personnage face à la tension du joueur, et détermine sa voix.
   */
  posture?: string
}

/**
 * L'augmentation remise par un PNJ.
 *
 * Ce n'est pas l'objet de la quête mais une CAPACITÉ : sans elle, les choses
 * du dehors n'ont pas de nom lisible, donc rien n'est manipulable. C'est le
 * laissez-passer vers la scène suivante.
 */
export interface SceneKeyItem {
  /** Id du PNJ qui le détient. Choisi par le modèle. */
  npc_id: string
  name: string
  description: string
  /** Ce qu'elle permet de percevoir dehors. */
  why: string
  /** Comment elle se porte : à l'oeil, sous la peau, au poignet. */
  worn?: string
  /** Ce que le détenteur attend du joueur avant de le céder. */
  handover_hint: string
  /** L'autre personnage, celui qui met sur la piste. Jamais le détenteur. */
  informant_npc_id: string
  /** Ce que l'informateur en dit : de quoi aller voir le détenteur. */
  informant_hint: string
  /** L'histoire qu'il raconte pour rendre l'objet désirable. */
  hook_story: string
  /** Nombre d'échanges avec le détenteur avant la remise. */
  exchanges_before_handover: number
}

/**
 * L'objet scellé de la scène.
 *
 * Reçu au fil d'une conversation, il reste dans l'historique du chat — qui
 * tient lieu d'inventaire. On y revient avec l'augmentation pour en déchiffrer
 * le nom, puis on l'observe : ce qu'il révèle ne débloque rien, il donne de la
 * profondeur à la quête.
 */
export interface SealedObject {
  id: string
  name: string
  /** Id du PNJ qui le donne, ou « trouve ». */
  given_by: string
  /** Révélé après l'analyse. Écrit à la génération, donc gratuit à l'affichage. */
  observation: string
}

export interface SceneQuest {
  title: string
  hook: string
  objective: string
  stakes: string
  artifact: string
  antagonist_hint: string
  why_leave: string
  /** L'équilibre rompu dans la ville, que l'objet-clé permet de rétablir. */
  restoration: string
}

export interface Interactable {
  id: string
  label: string
  verb: string
  triggers_paywall?: boolean
}

/** Le lieu de la scène : auberge, forêt, donjon... */
export interface ScenePlace {
  name: string
  sign: string
  reputation: string
}

/** Sortie brute de gpt-4o, avant tout enrichissement local. */
export interface GeneratedScene {
  place: ScenePlace
  palette: ScenePalette
  decor: DecorElement[]
  npcs: SceneNPC[]
  quest: SceneQuest
  interactables: Interactable[]
  scene_text: string
  /** Choisi par le modèle : qui détient l'objet, et lequel. */
  key_item: Omit<SceneKeyItem, 'exchanges_before_handover'>
  /** L'objet à analyser pour approfondir la quête. */
  sealed_object?: SealedObject
}

export interface ScenePaywallPitch {
  eyebrow: string
  points: Array<{ label: string; text: string }>
  closing: string
}

export interface ScenePaywall {
  gate_text: string
  cta: string
  sub_cta: string
  amount_cents: number
  currency: string
  exit_keywords: string[]
  min_turns_before_trigger: number
  pitch: ScenePaywallPitch
}

/** Réponse de la phase 1. Suffisante pour jouer, l'image est facultative. */
export interface SceneTextResponse extends GeneratedScene {
  scene_id: string
  scene_title: string
  script_version: string
  /** Prompt assemblé côté serveur. Renvoyé pour information/debug uniquement :
   *  /api/scene/image le reconstruit et n'accepte jamais un prompt du client. */
  image_prompt: string
  /** Chemin d'une illustration figée, ou null si la scène doit la générer. */
  static_image: string | null
  /** Seuils de relance et de blocage, portés par le script. */
  pacing: ScenePacing
  /** Thème intime du joueur. Les PNJ s'en nourrissent sans jamais le nommer. */
  theme: PlayerTheme | null
  /** Objet sans lequel le sas reste fermé. */
  key_item: SceneKeyItem | null
  paywall: ScenePaywall
  /** Trace de la correction d'accent appliquée côté serveur. */
  palette_audit: {
    adjusted: boolean
    original_dominant: string
    original_secondary: string
    original_accent: string
    contrast_vs_dominant: number
    contrast_vs_secondary: number
    base_contrast: number
  }
}

/** Requête de la phase 2. Volontairement pas de prompt libre. */
/** Le thème intime du joueur, résolu côté serveur depuis sa date et son nom. */
export interface PlayerTheme {
  /** Signe, ou null si la date de naissance manque. */
  sign: { key: string; name: string; element: string; tension: string; resolution: string } | null
  /** Nombres indiens et ce qu'ils portent. Chaque facette peut manquer. */
  numbers: {
    drive: string | null
    destiny: string | null
    reception: string | null
  }
}

export interface ScenePacing {
  /** Tour à partir duquel le narrateur oriente vers la sortie. */
  steer_after_turns: number
  /** Tour où les personnages viennent dénouer la scène. */
  resolution_after_turns: number
  /** Plafond dur de tours facturés, filet de sécurité du budget. */
  hard_turn_cap: number
  autonomous_notice: string
  /** Plafond de dépense de la scène, en dollars. */
  budget_usd: number
  /** Tarifs, pour convertir des tokens en dollars côté client. */
  price_input_per_1m_usd: number
  price_output_per_1m_usd: number
}

/** Consommation réelle d'un appel, telle que la rapporte OpenAI. */
export interface TurnUsage {
  prompt_tokens: number
  completion_tokens: number
}

export interface SceneImageRequest {
  scene_id: string
  place_name: string
  palette: ScenePalette
  decor: DecorElement[]
}

export interface SceneImageResponse {
  /** Data URI directement affichable : gpt-image-* ne renvoie que du base64. */
  image: string
  model: string
  format: string
  bytes: number
  elapsed_ms: number
}

// --- Tours de jeu -----------------------------------------------------------

/** Faits de la scène nécessaires pour narrer un tour. Envoyés par le client. */
export interface TurnContext {
  player_name: string
  place: ScenePlace
  quest: SceneQuest
  npcs: SceneNPC[]
  /** Reporté depuis la scène : ce que les PNJ doivent faire affleurer. */
  theme?: PlayerTheme | null
  /** Reporté depuis la scène : l'objet qui conditionne la sortie. */
  key_item?: SceneKeyItem | null
  /** Le joueur le détient-il déjà ? Décide vers quoi le narrateur oriente. */
  has_key_item?: boolean
  /** A-t-il parlé à l'informateur ? Le détenteur reste muet tant que non. */
  informed_about_item?: boolean
}

/** 'exit_nudge' : le joueur parle de sortir mais le paywall n'est pas atteint. */
export type TurnMode = 'ambient' | 'npc' | 'exit_nudge' | 'handover' | 'blocked_exit' | 'resolution'

export interface TurnRequest {
  sceneId?: string
  context: TurnContext
  input: string
  /** Nombre de tours déjà joués. Décide de l'orientation vers la sortie. */
  turnCount?: number
  mode?: TurnMode
  /** Si renseigné, c'est ce PNJ qui répond au lieu du narrateur. */
  npcId?: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}
