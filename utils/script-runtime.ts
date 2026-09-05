import scriptJson from '../game/script.json'
import userJson from '../game/user.json'
import type {
  Script,
  SceneScript,
  ResolvedScene,
  SceneExit,
} from '~/types/script'
import type { PlayerTheme, SceneKeyItem } from '~/types/scene'
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
import { zodiacKey } from '~/utils/zodiac'
import { numerologyOf } from '~/utils/numerology'

// Les JSON sont importés, pas lus sur le disque : en serverless (Vercel) le
// process ne voit que le bundle, jamais l'arborescence du repo. L'import les
// inline dans le build, donc ils sont toujours là.
const script = scriptJson as unknown as Script
const userFixture = userJson as unknown as UserProfile

/** Profil joueur de développement. En prod, remplacé par le classifier Facebook. */
export function loadUserFixture(): Promise<UserProfile> {
  return Promise.resolve(userFixture)
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

/**
 * Résout le thème intime du joueur : signe et nombres.
 *
 * Les calculs sont dans utils/zodiac.ts et utils/numerology.ts, les textes dans
 * script.json. Cette fonction ne fait que les apparier — et tolère qu'il manque
 * la date ou le nom : chaque facette retombe indépendamment sur null.
 */
export function resolveTheme(user: UserProfile, script: Script): PlayerTheme | null {
  const key = zodiacKey(user.identity.birthday)
  const entry = key ? script.zodiac?.signs?.[key] : undefined
  const numbers = numerologyOf(user.identity.birthday, user.identity.name)
  const table = script.numerology?.numbers ?? {}

  const facet = (n: number | null | undefined, field: 'drive' | 'destiny' | 'reception') =>
    n ? table[String(n)]?.[field] ?? null : null

  const sign = key && entry ? { key, ...entry } : null
  const resolved = {
    drive: facet(numbers?.moolank, 'drive'),
    destiny: facet(numbers?.bhagyank, 'destiny'),
    reception: facet(numbers?.namank, 'reception'),
  }

  const hasNumbers = Boolean(resolved.drive || resolved.destiny || resolved.reception)
  if (!sign && !hasNumbers) return null
  return { sign, numbers: resolved }
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
  /** Illustration figée de la scène, ou null si elle doit être générée. */
  get staticImage() { return this.scene.static_image ?? null }
  /** Seuils de relance et de blocage, envoyés au client avec la scène. */
  get pacing() {
    return {
      steer_after_turns: this.scene.turn.steer_after_turns,
      resolution_after_turns: this.scene.turn.resolution_after_turns,
      hard_turn_cap: this.scene.turn.hard_turn_cap,
      autonomous_notice: this.scene.turn.autonomous_notice,
      budget_usd: this.script.pricing.scene_budget_usd,
      price_input_per_1m_usd: this.script.pricing.input_per_1m_usd,
      price_output_per_1m_usd: this.script.pricing.output_per_1m_usd,
    }
  }

  /** Message utilisateur envoyé à gpt-4o pour produire la scène. */
  buildGenerationPrompt(user: UserProfile): string {
    const s = this.scene

    const slots = s.decor_slots
      .map(slot => `  - ${slot.id} (poids visuel : ${slot.visual_weight}) : ${slot.role} — source : ${slot.source}`)
      .join('\n')

    const questFields = Object.entries(s.quest.structure)
      .map(([k, v]) => `  - ${k} : ${v}`)
      .join('\n')

    const theme = resolveTheme(user, this.script)
    const themeBlock = theme ? this.describeTheme(theme) : ''

    return `PROFIL DU JOUEUR
${describeUser(user)}
${themeBlock}
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

OBJET-CLÉ
${s.key_item.instruction}

TEXTE DE SCÈNE
${s.narrative.instruction}
${s.narrative.vocabulary}
${s.narrative.naming_style}
La sortie de ce lieu se nomme exactement : ${s.exits[0]?.label ?? 'le sas'}.
${s.narrative.opening}
Structure imposée :
${s.narrative.structure.map((x, i) => `  ${i + 1}. ${x}`).join('\n')}
Maximum ${s.narrative.max_words} mots. Interdit : ${s.narrative.forbidden.join(', ')}.
Le champ "interactables" doit lister exactement les objets nommés dans le texte, et inclure impérativement la sortie.

SORTIE ATTENDUE
Un unique objet JSON respectant ce schéma, sans markdown :
${JSON.stringify(s.generation.output_schema, null, 2)}`
  }

  /** Les sections SIGNE et NOMBRES du prompt de génération. */
  private describeTheme(theme: PlayerTheme): string {
    const parts: string[] = []

    if (theme.sign) {
      parts.push(`
SIGNE
${this.script.zodiac.generation_instruction}
Tension : ${theme.sign.tension}
Résolution recherchée : ${theme.sign.resolution}`)
    }

    const n = theme.numbers
    if (n.drive || n.destiny || n.reception) {
      const lines = [
        n.drive ? `  - Manière d'agir : ${n.drive}` : '',
        n.destiny ? `  - Forme de l'objectif : ${n.destiny}` : '',
        n.reception ? `  - Accueil du monde : ${n.reception}` : '',
      ].filter(Boolean).join('\n')

      parts.push(`
NOMBRES
${this.script.numerology.generation_instruction}
${lines}`)
    }

    return parts.join('\n')
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

    const item = generated.key_item
    if (!item?.name || !item?.npc_id) {
      throw new Error('Scène invalide : key_item.name ou key_item.npc_id manquant')
    }
    // Un détenteur inconnu rendrait la sortie impossible à débloquer.
    if (!generated.npcs?.some(n => n.id === item.npc_id)) {
      throw new Error(`Scène invalide : key_item.npc_id "${item.npc_id}" ne désigne aucun PNJ`)
    }
    if (!item.informant_npc_id || item.informant_npc_id === item.npc_id) {
      throw new Error('Scène invalide : key_item.informant_npc_id doit désigner un AUTRE PNJ')
    }
    // Le barman ouvre la liste : il expose la situation, il ne résout rien.
    const barman = generated.npcs[0]?.id
    if (barman && (item.npc_id === barman || item.informant_npc_id === barman)) {
      throw new Error('Scène invalide : le barman ne peut être ni détenteur ni informateur')
    }
    if (!generated.npcs.some(n => n.id === item.informant_npc_id)) {
      throw new Error(`Scène invalide : informant_npc_id "${item.informant_npc_id}" ne désigne aucun PNJ`)
    }
    if (!Array.isArray(generated.npcs) || generated.npcs.length === 0) {
      throw new Error('Scène invalide : aucun PNJ')
    }
  }

  /** Fusionne la sortie du modèle avec les parties statiques du script. */
  assembleText(generated: GeneratedScene, theme: PlayerTheme | null = null): SceneTextResponse {
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
      static_image: this.staticImage,
      pacing: this.pacing,
      theme,
      key_item: {
        ...generated.key_item,
        exchanges_before_handover: this.scene.key_item.exchanges_before_handover,
      },
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
        // Les variables de quête sont interpolées ici : le client n'a jamais
        // à connaître la syntaxe des gabarits.
        pitch: {
          eyebrow: this.script.paywall.pitch.eyebrow,
          points: this.script.paywall.pitch.points.map(pt => ({
            label: pt.label,
            text: interpolate(pt.text, vars),
          })),
          closing: interpolate(this.script.paywall.pitch.closing, vars),
        },
      },
    }
  }

  /**
   * Prompt système d'un tour de jeu : les faits de la scène, figés.
   *
   * Passé `steer_after_turns`, une consigne d'orientation vers la sortie est
   * ajoutée. Elle vient du script, jamais du client : c'est la même règle que
   * pour le reste du prompt.
   */
  buildTurnSystemPrompt(ctx: TurnContext, turnCount = 0): string {
    const t = this.scene.turn
    const npcList = ctx.npcs.length
      ? ctx.npcs.map(n => `${n.name} (${n.archetype})`).join(', ')
      : 'personne'

    const base = interpolate(t.system_prompt_template, {
      scene_title: this.scene.title,
      player_name: ctx.player_name,
      place_name: ctx.place.name,
      place_reputation: ctx.place.reputation,
      quest_title: ctx.quest.title,
      quest_objective: ctx.quest.objective,
      quest_stakes: ctx.quest.stakes,
      quest_artifact: ctx.quest.artifact,
      npc_list: npcList,
      narrative_instruction: `${this.scene.narrative.instruction}\n${this.scene.narrative.vocabulary}\n${this.scene.narrative.naming_style}`,
      max_words: String(t.max_words),
      exit_label: this.scene.exits[0]?.label ?? 'la sortie',
    })

    const withItem = ctx.key_item
      ? `${base}\n\n${interpolate(t.key_item_context, {
          item_name: ctx.key_item.name,
          item_description: ctx.key_item.description,
          item_why: ctx.key_item.why,
          item_handover_hint: ctx.key_item.handover_hint || "qu'on l'écoute vraiment",
          item_holder: ctx.npcs.find(n => n.id === ctx.key_item?.npc_id)?.name ?? 'un habitué',
          exit_label: this.scene.exits[0]?.label ?? 'la sortie',
        })}`
      : base

    const themed = ctx.theme?.sign
      ? `${withItem}\n\n${interpolate(this.script.zodiac.turn_instruction, { tension: ctx.theme.sign.tension })}`
      : withItem

    if (turnCount < t.steer_after_turns) return themed

    // Tant que l'objet manque, pousser vers le sas enverrait le joueur sur une
    // issue fermée : on l'oriente d'abord vers celui qui le détient.
    const item = ctx.key_item
    const nameOf = (id?: string) => ctx.npcs.find(n => n.id === id)?.name ?? 'un habitué'

    // Trois orientations selon l'endroit où le joueur est bloqué. Pousser vers
    // le détenteur avant qu'il connaisse la piste l'envoyait sur un personnage
    // programmé pour ne rien dire.
    let steer = t.steer_instruction
    if (item && !ctx.has_key_item && !ctx.informed_about_item) {
      steer = interpolate(t.steer_instruction_missing_informant, {
        quest_title: ctx.quest.title,
        npc_name: nameOf(item.informant_npc_id),
      })
    } else if (item && !ctx.has_key_item) {
      steer = interpolate(t.steer_instruction_missing_item, {
        item_name: item.name,
        npc_name: nameOf(item.npc_id),
      })
    }

    return `${themed}\n\n${steer}`
  }

  /** Prompt utilisateur : ambiance, relance vers la sortie, ou réplique d'un PNJ. */
  buildTurnUserPrompt(ctx: TurnContext, input: string, npc?: SceneNPC, mode?: TurnMode): string {
    const t = this.scene.turn

    if (mode === 'handover' && npc && ctx.key_item) {
      return interpolate(t.handover_prompt, {
        npc_name: npc.name,
        npc_archetype: npc.archetype,
        npc_personality: npc.personality,
        player_input: input,
        item_name: ctx.key_item.name,
        item_description: ctx.key_item.description,
        item_why: ctx.key_item.why,
        exit_label: this.scene.exits[0]?.label ?? 'la sortie',
      })
    }

    if (mode === 'resolution' && ctx.key_item) {
      return interpolate(t.resolution_prompt, {
        player_input: input,
        quest_title: ctx.quest.title,
        informant_name: ctx.npcs.find(n => n.id === ctx.key_item?.informant_npc_id)?.name ?? 'un habitué',
        holder_name: ctx.npcs.find(n => n.id === ctx.key_item?.npc_id)?.name ?? 'un autre',
        item_name: ctx.key_item.name,
        item_why: ctx.key_item.why,
        exit_label: this.scene.exits[0]?.label ?? 'la sortie',
      })
    }

    if (mode === 'blocked_exit' && ctx.key_item) {
      return interpolate(t.blocked_exit_prompt, {
        player_input: input,
        exit_label: this.scene.exits[0]?.label ?? 'la sortie',
        item_name: ctx.key_item.name,
        npc_name: ctx.npcs.find(n => n.id === ctx.key_item?.npc_id)?.name ?? 'un habitué',
      })
    }

    if (mode === 'exit_nudge') {
      return interpolate(t.exit_nudge_prompt, {
        player_input: input,
        exit_label: this.scene.exits[0]?.label ?? 'la porte',
        quest_artifact: ctx.quest.artifact,
        quest_title: ctx.quest.title,
      })
    }

    if (!npc) return interpolate(t.ambient_prompt, { player_input: input })

    const item = ctx.key_item
    const holderName = () => ctx.npcs.find(n => n.id === item?.npc_id)?.name ?? 'un habitué'

    // L'informateur met sur la piste : c'est lui qui ouvre la chaîne.
    if (item && !ctx.has_key_item && npc.id === item.informant_npc_id) {
      return interpolate(t.informant_prompt, {
        npc_name: npc.name,
        npc_archetype: npc.archetype,
        npc_personality: npc.personality,
        npc_knows: npc.knows,
        player_input: input,
        item_informant_hint: item.informant_hint || ctx.quest.hook,
        item_holder: holderName(),
      })
    }

    // Le détenteur avant que le joueur ait été informé : il parle, mais jamais
    // de ce qu'il garde. On peut l'aborder, on ne peut rien en tirer.
    if (item && !ctx.has_key_item && !ctx.informed_about_item && npc.id === item.npc_id) {
      return interpolate(t.holder_locked_prompt, {
        npc_name: npc.name,
        npc_archetype: npc.archetype,
        npc_personality: npc.personality,
        npc_knows: npc.knows,
        player_input: input,
        quest_title: ctx.quest.title,
      })
    }

    // Le détenteur, une fois informé : il raconte, et il relance.
    if (item && !ctx.has_key_item && npc.id === item.npc_id) {
      return interpolate(t.holder_prompt, {
        npc_name: npc.name,
        npc_archetype: npc.archetype,
        npc_personality: npc.personality,
        npc_knows: npc.knows,
        player_input: input,
        item_name: ctx.key_item.name,
        item_handover_hint: ctx.key_item.handover_hint || "qu'on l'écoute vraiment",
        item_hook_story: ctx.key_item.hook_story || ctx.quest.hook,
      })
    }

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
