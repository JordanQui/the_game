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
}

export interface SceneQuest {
  title: string
  hook: string
  objective: string
  stakes: string
  artifact: string
  antagonist_hint: string
  why_leave: string
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
}

export interface ScenePaywall {
  gate_text: string
  cta: string
  sub_cta: string
  amount_cents: number
  currency: string
  exit_keywords: string[]
  min_turns_before_trigger: number
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
}

/** 'exit_nudge' : le joueur parle de sortir mais le paywall n'est pas atteint. */
export type TurnMode = 'ambient' | 'npc' | 'exit_nudge'

export interface TurnRequest {
  sceneId?: string
  context: TurnContext
  input: string
  mode?: TurnMode
  /** Si renseigné, c'est ce PNJ qui répond au lieu du narrateur. */
  npcId?: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}
