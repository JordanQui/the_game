import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type {
  Script,
  SceneScript,
  ResolvedScene,
  SceneExit,
} from '~/types/script'
import type {
  GeneratedScene,
  SceneTextResponse,
  ScenePalette,
  DecorElement,
  TurnContext,
  SceneNPC,
  TurnMode,
} from '~/types/scene'
import type { UserProfile } from '~/types/user'
import { interpolate } from '~/utils/prompt-builder'
import { matchesKeyword } from '~/utils/text-match'
import { enforceAccentVisibility } from '~/utils/palette'

const fileCache = new Map<string, unknown>()

async function loadJson<T>(fileName: string): Promise<T> {
  if (fileCache.has(fileName)) return fileCache.get(fileName) as T

  const filePath = resolve(process.cwd(), 'game', fileName)
  let raw: string
  try {
    raw = await readFile(filePath, 'utf-8')
  } catch {
    throw new Error(`Fichier introuvable : game/${fileName}`)
  }

  let parsed: T
  try {
    parsed = JSON.parse(raw) as T
  } catch {
    throw new Error(`JSON invalide : game/${fileName}`)
  }

  fileCache.set(fileName, parsed)
  return parsed
}

/** Profil joueur de développement. En prod, remplacé par le classifier Facebook. */
export function loadUserFixture(): Promise<UserProfile> {
  return loadJson<UserProfile>('user.json')
}

/** Aplatit le profil en un bloc lisible par le modèle. */
export function describeUser(user: UserProfile): string {
  const lines: string[] = []

  lines.push(`Nom : ${user.identity.name}`)
  if (user.identity.age) lines.push(`Âge : ${user.identity.age} ans`)
  if (user.identity.languages?.length) lines.push(`Langues : ${user.identity.languages.join(', ')}`)

  const { hometown, current_location } = user.origin
  if (hometown) {
    const traits = hometown.traits?.length ? ` — ${hometown.traits.join(', ')}` : ''
    lines.push(`Ville d'origine : ${hometown.name}${traits}`)
  }
  if (current_location) {
    const traits = current_location.traits?.length ? ` — ${current_location.traits.join(', ')}` : ''
    lines.push(`Ville actuelle : ${current_location.name}${traits}`)
  }

  if (user.trajectory.education.length) {
    lines.push(
      `Formation : ${user.trajectory.education
        .map(e => [e.degree, e.school, e.year].filter(Boolean).join(', '))
        .join(' | ')}`
    )
  }

  if (user.trajectory.work.length) {
    lines.push(
      `Parcours professionnel : ${user.trajectory.work
        .map(w => `${w.position ?? 'poste inconnu'} chez ${w.employer}${w.end_date === null ? ' (en cours)' : ''}`)
        .join(' | ')}`
    )
  }

  if (user.trajectory.turning_points.length) {
    lines.push(`Tournants de vie :\n${user.trajectory.turning_points.map(t => `  - ${t}`).join('\n')}`)
  }

  if (user.passions.length) {
    lines.push(
      `Passions (par intensité) :\n${user.passions
        .map(p => `  - [${p.intensity}] ${p.theme} (${p.evidence.join(', ')})`)
        .join('\n')}`
    )
  }

  if (user.misc_facts?.length) lines.push(`Divers : ${user.misc_facts.join(' ; ')}`)

  return lines.join('\n')
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

/**
 * Une scène du script, defaults résolus, augmentée de son comportement.
 * Le contenu reste dans le JSON ; cette classe ne fait que l'exploiter.
 */
export class SceneRuntime {
  constructor(
    readonly scene: ResolvedScene,
    private readonly script: Script
  ) {}

  get id() { return this.scene.id }
  get title() { return this.scene.title }
  get generation() { return this.scene.generation }
  get artDirection() { return this.scene.art_direction }
  get turn() { return this.scene.turn }
  get fallbacks() { return this.scene.error_fallbacks }

  /** Message utilisateur envoyé à gpt-4o pour produire la scène. */
  buildGenerationPrompt(user: UserProfile): string {
    const s = this.scene

    const slots = s.decor_slots
      .map(slot => `  - ${slot.id} (poids visuel : ${slot.visual_weight}) : ${slot.role} — source : ${slot.source}`)
      .join('\n')

    const questFields = Object.entries(s.quest.structure)
      .map(([k, v]) => `  - ${k} : ${v}`)
      .join('\n')

    return `PROFIL DU JOUEUR
${describeUser(user)}

NOM DU LIEU
${s.naming.instruction}

PALETTE
${s.palette_derivation.instruction}
Contrainte de rendu : ${s.art_direction.render}, règle 60/30/10 stricte.
${s.art_direction.accent_note}

ÉLÉMENTS DE DÉCOR À REMPLIR
${slots}
Pour chaque élément, "visual" doit être un fragment ANGLAIS court (max 12 mots) décrivant la forme visible, sans mentionner de couleur.

PERSONNAGES
${s.npcs.instruction} Exactement ${s.npcs.count} personnages.

QUÊTE
${s.quest.instruction}
${questFields}

TEXTE DE SCÈNE
${s.narrative.instruction}
Structure imposée :
${s.narrative.structure.map((x, i) => `  ${i + 1}. ${x}`).join('\n')}
Maximum ${s.narrative.max_words} mots. Interdit : ${s.narrative.forbidden.join(', ')}.
Le champ "interactables" doit lister exactement les objets nommés dans le texte, et inclure impérativement la sortie.

SORTIE ATTENDUE
Un unique objet JSON respectant ce schéma, sans markdown :
${JSON.stringify(s.generation.output_schema, null, 2)}`
  }

  /**
   * Assemble le prompt image depuis le gabarit statique.
   * Toujours reconstruit côté serveur : le client ne fournit jamais de prompt libre.
   */
  buildImagePrompt(input: { place_name: string; palette: ScenePalette; decor: DecorElement[] }): string {
    const ad = this.scene.art_direction

    const decorLine = input.decor
      .filter(d => d.visual && d.slot_id !== 'ambiance_sonore')
      .map(d => d.visual)
      .join('; ')

    return interpolate(ad.image_prompt_template, {
      setting: this.scene.image_setting,
      scene_name: input.place_name,
      focal_element: this.scene.focal_element,
      dominant_hex: input.palette.dominant.hex,
      dominant_name: input.palette.dominant.name,
      secondary_hex: input.palette.secondary.hex,
      secondary_name: input.palette.secondary.name,
      accent_hex: input.palette.accent.hex,
      accent_name: input.palette.accent.name,
      decor_line: decorLine,
      constraints: ad.constraints.join(', '),
    })
  }

  /** Portrait de PNJ, dans la palette de la scène pour rester cohérent. */
  buildPortraitPrompt(input: { appearance: string; palette: ScenePalette }): string {
    const ad = this.scene.art_direction
    return interpolate(ad.portrait_prompt_template, {
      appearance: input.appearance,
      dominant_hex: input.palette.dominant.hex,
      dominant_name: input.palette.dominant.name,
      secondary_hex: input.palette.secondary.hex,
      secondary_name: input.palette.secondary.name,
      accent_hex: input.palette.accent.hex,
      accent_name: input.palette.accent.name,
      constraints: ad.constraints.join(', '),
    })
  }

  /** Garde-fou : le modèle oublie régulièrement un champ. */
  assertValid(generated: GeneratedScene): void {
    if (!generated.place?.name) throw new Error('Scène invalide : place.name manquant')
    if (!generated.scene_text) throw new Error('Scène invalide : scene_text manquant')

    for (const key of ['dominant', 'secondary', 'accent'] as const) {
      const color = generated.palette?.[key]
      if (!color?.hex) throw new Error(`Scène invalide : palette.${key}.hex manquant`)
      if (!HEX_RE.test(color.hex)) {
        throw new Error(`Scène invalide : palette.${key}.hex "${color.hex}" n'est pas un hex #RRGGBB`)
      }
    }

    const present = new Set(generated.decor?.map(d => d.slot_id) ?? [])
    for (const slot of this.scene.decor_slots) {
      if (slot.required && !present.has(slot.id)) {
        throw new Error(`Scène invalide : slot de décor requis "${slot.id}" absent`)
      }
    }

    if (!generated.quest?.title) throw new Error('Scène invalide : quest.title manquant')
    if (!Array.isArray(generated.npcs) || generated.npcs.length === 0) {
      throw new Error('Scène invalide : aucun PNJ')
    }
  }

  /** Fusionne la sortie du modèle avec les parties statiques du script. */
  assembleText(generated: GeneratedScene): SceneTextResponse {
    const exit = this.scene.exits[0]

    // Le modèle produit des couleurs qui ne tiennent pas la hiérarchie Dark Deco.
    // On les recale avant d'en dériver quoi que ce soit.
    const audit = enforceAccentVisibility(generated.palette)

    // Les parts affichées viennent du script, jamais du modèle : il renvoie
    // volontiers 60/30/10 par habitude, quel que soit le ratio demandé.
    const ratio = this.scene.art_direction.tonal_ratio
    const palette: ScenePalette = {
      dominant: { ...audit.palette.dominant, coverage_pct: ratio.dominant_pct },
      secondary: { ...audit.palette.secondary, coverage_pct: ratio.secondary_pct },
      accent: { ...audit.palette.accent, coverage_pct: ratio.accent_pct },
    }
    const scene = { ...generated, palette }

    // Les interactables obligatoires sont réinjectés même si le modèle les a oubliés.
    const interactables = [...(scene.interactables ?? [])]
    for (const forced of this.scene.interactables.always_include) {
      const existing = interactables.find(i => i.id === forced.id)
      if (existing) existing.triggers_paywall = forced.triggers_paywall
      else interactables.push(forced)
    }

    const vars = {
      quest_title: scene.quest.title,
      quest_artifact: scene.quest.artifact,
      place_name: scene.place.name,
    }

    return {
      ...scene,
      interactables,
      scene_id: this.scene.id,
      scene_title: this.scene.title,
      script_version: this.script.version,
      image_prompt: this.buildImagePrompt({
        place_name: scene.place.name,
        palette: scene.palette,
        decor: scene.decor,
      }),
      palette_audit: {
        adjusted: audit.adjusted,
        original_dominant: audit.original_dominant,
        original_secondary: audit.original_secondary,
        original_accent: audit.original_accent,
        contrast_vs_dominant: Number(audit.contrast_vs_dominant.toFixed(2)),
        contrast_vs_secondary: Number(audit.contrast_vs_secondary.toFixed(2)),
        base_contrast: Number(audit.base_contrast.toFixed(2)),
      },
      paywall: {
        gate_text: interpolate(this.script.paywall.gate_text, vars),
        cta: interpolate(this.script.paywall.cta, vars),
        sub_cta: interpolate(this.script.paywall.sub_cta, vars),
        amount_cents: this.script.paywall.amount_cents,
        currency: this.script.paywall.currency,
        exit_keywords: exit.keywords,
        min_turns_before_trigger: exit.min_turns_before_trigger,
      },
    }
  }

  /** Prompt système d'un tour de jeu : les faits de la scène, figés. */
  buildTurnSystemPrompt(ctx: TurnContext): string {
    const t = this.scene.turn
    const npcList = ctx.npcs.length
      ? ctx.npcs.map(n => `${n.name} (${n.archetype})`).join(', ')
      : 'personne'

    return interpolate(t.system_prompt_template, {
      scene_title: this.scene.title,
      player_name: ctx.player_name,
      place_name: ctx.place.name,
      place_reputation: ctx.place.reputation,
      quest_title: ctx.quest.title,
      quest_objective: ctx.quest.objective,
      quest_stakes: ctx.quest.stakes,
      quest_artifact: ctx.quest.artifact,
      npc_list: npcList,
      narrative_instruction: this.scene.narrative.instruction,
      max_words: String(t.max_words),
      exit_label: this.scene.exits[0]?.label ?? 'la sortie',
    })
  }

  /** Prompt utilisateur : ambiance, relance vers la sortie, ou réplique d'un PNJ. */
  buildTurnUserPrompt(ctx: TurnContext, input: string, npc?: SceneNPC, mode?: TurnMode): string {
    const t = this.scene.turn

    if (mode === 'exit_nudge') {
      return interpolate(t.exit_nudge_prompt, {
        player_input: input,
        exit_label: this.scene.exits[0]?.label ?? 'la porte',
        quest_artifact: ctx.quest.artifact,
        quest_title: ctx.quest.title,
      })
    }

    if (!npc) return interpolate(t.ambient_prompt, { player_input: input })

    return interpolate(t.npc_dialogue_prompt, {
      npc_name: npc.name,
      npc_archetype: npc.archetype,
      npc_personality: npc.personality,
      npc_knows: npc.knows,
      player_input: input,
      quest_title: ctx.quest.title,
    })
  }

  /** Le joueur parle-t-il de sortir, quel que soit le nombre de tours joués ? */
  mentionsExit(input: string): boolean {
    return this.scene.exits.some(exit => matchesKeyword(input, exit.keywords))
  }

  /** La commande du joueur déclenche-t-elle une sortie ? */
  matchExit(input: string, turnCount: number): SceneExit | null {
    for (const exit of this.scene.exits) {
      if (turnCount < exit.min_turns_before_trigger) continue
      if (matchesKeyword(input, exit.keywords)) return exit
    }
    return null
  }
}

/** Le script global. Porte les scènes et résout leurs defaults. */
export class ScriptRuntime {
  private readonly resolved = new Map<string, SceneRuntime>()

  constructor(readonly script: Script) {}

  static async load(): Promise<ScriptRuntime> {
    const script = await loadJson<Script>('script.json')
    if (!script.scenes?.length) throw new Error('script.json ne contient aucune scène')
    return new ScriptRuntime(script)
  }

  get version() { return this.script.version }
  get sceneIds() { return this.script.scenes.map(s => s.id) }
  get paywall() { return this.script.paywall }

  /** Une scène par id. Sans argument, la scène de départ. */
  scene(id?: string): SceneRuntime {
    const sceneId = id ?? this.script.progression.start_scene
    const cached = this.resolved.get(sceneId)
    if (cached) return cached

    const raw = this.script.scenes.find(s => s.id === sceneId)
    if (!raw) {
      throw new Error(`Scène inconnue : "${sceneId}" (disponibles : ${this.sceneIds.join(', ')})`)
    }

    const runtime = new SceneRuntime(this.resolveDefaults(raw), this.script)
    this.resolved.set(sceneId, runtime)
    return runtime
  }

  /** Applique `defaults`, que la scène peut surcharger bloc par bloc. */
  private resolveDefaults(raw: SceneScript): ResolvedScene {
    const d = this.script.defaults
    return {
      ...raw,
      art_direction: { ...d.art_direction, ...raw.art_direction },
      palette_derivation: { ...d.palette_derivation, ...raw.palette_derivation },
      narrative: { ...d.narrative, ...raw.narrative },
      turn: { ...d.turn, ...raw.turn },
      generation: { ...d.generation, ...raw.generation },
      error_fallbacks: d.error_fallbacks,
    }
  }
}
