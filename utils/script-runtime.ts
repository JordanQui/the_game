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
import { enforceNameCaps, fold } from '~/utils/naming'
import { sanitizeHtml } from '~/utils/sanitize-html'
import { renderJournal, type JournalEntry, type CarriedItem } from '~/utils/journal'
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

/** `npc_id` d'un objet qui n'est sur personne : il est dans le décor. */
export const FOUND_ITEM_ID = 'trouve'

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
  /** `ending` : cette scène clôt la partie et ne suit pas le schéma des autres. */
  get kind() { return this.scene.kind ?? 'scene' }
  /** Seuils de relance et de blocage, envoyés au client avec la scène. */
  get pacing() {
    return {
      steer_after_turns: this.scene.turn.steer_after_turns,
      // Échanges avec un personnage avant qu'il livre ce qu'il sait.
      exchanges_before_steer: this.scene.turn.exchanges_before_steer ?? 2,
      resolution_after_turns: this.scene.turn.resolution_after_turns,
      hard_turn_cap: this.scene.turn.hard_turn_cap,
      autonomous_notice: this.scene.turn.autonomous_notice,
      budget_usd: this.script.pricing.scene_budget_usd,
      price_input_per_1m_usd: this.script.pricing.input_per_1m_usd,
      price_output_per_1m_usd: this.script.pricing.output_per_1m_usd,
    }
  }

  /** Message utilisateur envoyé à gpt-4o pour produire la scène. */
  /**
   * Le schéma demandé au modèle, ajusté à la scène.
   *
   * Une scène sans objet scellé ne doit pas s'en voir réclamer un : sans son
   * bloc d'instructions, le modèle en inventerait un au hasard, et on paierait
   * la sortie d'un champ que personne ne lit.
   */
  private get outputSchema(): Record<string, unknown> {
    const schema = this.scene.generation.output_schema as Record<string, unknown>
    if (this.scene.sealed_object) return schema
    const { sealed_object: _omit, ...rest } = schema
    return rest
  }

  /**
   * Le prompt de l'épilogue.
   *
   * Il ne demande ni personnages, ni quête, ni objet-clé : la partie est finie.
   * Il demande un texte, la palette d'un couchant, et de quoi peupler l'image
   * de ce que CE joueur a traversé. Le journal y passe en ENTIER — c'est le
   * seul moment où toute la nuit compte, on ne le tronque donc pas.
   */
  buildEndingPrompt(
    user: UserProfile,
    journal: JournalEntry[] = [],
    carried: CarriedItem[] = [],
  ): string {
    const s = this.scene
    const theme = resolveTheme(user, this.script)
    const slots = s.decor_slots
      .map(slot => `  - ${slot.id} (poids visuel : ${slot.visual_weight}) : ${slot.role}`)
      .join('\n')

    return `PROFIL DU JOUEUR
${describeUser(user)}
${this.describeResolution(theme)}

TOUTE SA NUIT, DANS L'ORDRE
${journal.length ? renderJournal(journal, journal.length) : "Il n'a traversé aucune scène : reste sur ce que dit son profil."}

${this.describeCarried(carried, true)}

${this.script.defaults.deep_theme.instruction}

${this.describeCounsel()}

DIRECTION ARTISTIQUE
${s.art_direction.render}
${s.art_direction.accent_note}
${s.palette_derivation.instruction}

ÉLÉMENTS DE L'IMAGE À REMPLIR
${slots}
Pour chaque élément, "visual" doit être un fragment ANGLAIS court (max 12 mots) décrivant la forme visible, sans mentionner de couleur et sans aucun texte lisible.

SORTIE ATTENDUE
Un unique objet JSON respectant ce schéma, sans markdown :
${JSON.stringify(s.generation.output_schema, null, 2)}`
  }

  /**
   * L'instruction de l'épilogue, avec sa lecture finale.
   *
   * Le quatrième mouvement est le SEUL endroit du jeu où l'on s'adresse au
   * joueur en clair plutôt que par la fiction. Il a donc ses propres registres,
   * tenus par le script : sans eux le modèle glisse vers l'horoscope ou vers le
   * développement personnel, deux registres que tout le reste refuse.
   */
  private describeCounsel(): string {
    const s = this.scene
    const counsel = s.counsel
    if (!counsel) return s.generation.instruction

    const registers = counsel.registers.map(r => `  - ${r}`).join('\n')
    return interpolate(s.generation.instruction, {
      counsel: interpolate(counsel.instruction, { registers }),
    })
  }

  /**
   * Le thème, cadré pour une fin.
   *
   * Les blocs SIGNE et NOMBRES ordinaires disent comment BÂTIR une scène — la
   * quête à écrire, les personnages à distribuer. Ici il n'y a plus rien à
   * bâtir : ce qui reste, c'est le point d'arrivée. On rappelle donc d'où le
   * joueur est parti, où toute la partie le menait, et quelle facette chaque
   * acte mettait à l'épreuve.
   */
  private describeResolution(theme: PlayerTheme | null): string {
    const frame = this.scene.theme_frame
    if (!frame || !theme?.sign) return theme ? this.describeTheme(theme) : ''

    const labels: Record<string, string> = {
      drive: "sa manière d'agir",
      destiny: "la forme de son objectif",
      reception: "la façon dont le monde le reçoit",
    }
    const numbers = theme.numbers as Record<string, string | null>

    const acts = this.script.acts
      .filter(a => a.id !== this.scene.act)
      .map((a) => {
        // La facette d'un acte est celle de ses scènes : on la lit sur la
        // première d'entre elles plutôt que de la redéclarer ailleurs.
        const first = this.script.scenes.find(sc => sc.id === a.scenes[0])
        const facet = first?.theme_focus?.facet
        const value = facet ? numbers[facet] : null
        return `  - ${a.title} — ${facet ? labels[facet] : 'son parcours'}`
          + (value ? ` : ${value}` : '')
      })
      .join('\n')

    return interpolate(frame.instruction, {
      tension: theme.sign.tension,
      resolution: theme.sign.resolution,
      acts,
    })
  }

  /**
   * Valide et assemble l'épilogue.
   *
   * Le HTML vient du modèle et sera affiché tel quel : il est réduit ici, côté
   * serveur, aux quatre balises autorisées. Le filtrer côté client laisserait
   * passer la fenêtre où il n'a pas encore été filtré.
   */
  assembleEnding(generated: GeneratedEnding, placeName: string) {
    if (!generated.ending_html) throw new Error('Fin invalide : ending_html manquant')
    for (const key of ['dominant', 'secondary', 'accent'] as const) {
      const color = generated.palette?.[key]
      if (!color?.hex || !HEX_RE.test(color.hex)) {
        throw new Error(`Fin invalide : palette.${key}.hex absent ou mal formé`)
      }
    }

    const audit = enforceAccentVisibility(generated.palette)
    const palette = audit.palette
    const html = sanitizeHtml(generated.ending_html)
    if (!html) throw new Error('Fin invalide : le HTML ne contient aucune balise autorisée')

    return {
      kind: 'ending' as const,
      scene_id: this.scene.id,
      scene_title: generated.title || this.scene.title,
      ending_html: html,
      palette,
      decor: generated.decor ?? [],
      interface_palette: 'from_scene' as const,
      image_prompt: this.buildImagePrompt({
        place_name: placeName || this.scene.title,
        palette,
        decor: generated.decor ?? [],
      }),
      static_image: null,
      script_version: this.script.version,
    }
  }

  buildGenerationPrompt(
    user: UserProfile,
    journal: JournalEntry[] = [],
    carried: CarriedItem[] = [],
  ): string {
    const s = this.scene
    // L'épilogue n'a ni quête ni personnages : le passer ici échouait sur un
    // « Cannot read properties of undefined » qui ne disait pas où chercher.
    if (this.kind === 'ending') {
      throw new Error(
        `La scène "${s.id}" est un épilogue : utilise buildEndingPrompt, pas buildGenerationPrompt`)
    }

    const slots = s.decor_slots
      .map(slot => `  - ${slot.id} (poids visuel : ${slot.visual_weight}) : ${slot.role} — source : ${slot.source}`)
      .join('\n')

    const questFields = Object.entries(s.quest.structure)
      .map(([k, v]) => `  - ${k} : ${v}`)
      .join('\n')

    const theme = resolveTheme(user, this.script)
    const themeBlock = theme ? this.describeTheme(theme) : ''
    const tension = theme?.sign?.tension ?? ''

    const c = this.script.defaults.continuity
    const story = journal.length
      ? interpolate(c.prompt, { journal: renderJournal(journal, c.max_entries) })
      : c.empty

    return `PROFIL DU JOUEUR
${describeUser(user)}
${themeBlock}
${story}

${this.describeCarried(carried)}

NOM DU LIEU
${s.naming.instruction}

PALETTE
${s.palette_derivation.instruction}
Contrainte de rendu : ${s.art_direction.render}, règle 60/30/10 stricte.
${s.art_direction.accent_note}

ÉLÉMENTS DE DÉCOR À REMPLIR
${slots}
Pour chaque élément, "visual" doit être un fragment ANGLAIS court (max 12 mots) décrivant la forme visible, sans mentionner de couleur.

SYLLABAIRE
${this.describeSyllabary(tension)}

${this.describeObjective(theme)}
PERSONNAGES
${s.npcs.instruction} Exactement ${s.npcs.count} personnages.
${this.describeCast()}

${this.script.defaults.deep_theme.instruction}

QUÊTE
${s.quest.instruction}
${questFields}

OBJET-CLÉ
${s.key_item.instruction}

${this.script.defaults.locks.instruction}

${s.sealed_object
  ? `OBJET SCELLÉ\n${interpolate(s.sealed_object.instruction, { quest_title: 'la quête' })}\n`
  : ''}
TEXTE DE SCÈNE
${s.narrative.instruction}
${s.narrative.vocabulary}
${s.narrative.naming_style}
La sortie de ce lieu se nomme exactement : ${s.exits[0]?.label ?? 'le sas'}.
${s.narrative.opening}
${s.narrative.stakes_rule ?? ''}
Structure imposée :
${s.narrative.structure.map((x, i) => `  ${i + 1}. ${x}`).join('\n')}
Maximum ${s.narrative.max_words} mots. Interdit : ${s.narrative.forbidden.join(', ')}.
Le champ "interactables" doit lister exactement les objets nommés dans le texte, et inclure impérativement la sortie.

SORTIE ATTENDUE
Un unique objet JSON respectant ce schéma, sans markdown :
${JSON.stringify(this.outputSchema, null, 2)}`
  }

  /** La table de composition des noms. Jointe à la génération, jamais aux tours. */
  private describeSyllabary(tension: string): string {
    const o = this.script.onomastics
    const list = (table: Record<string, string>) =>
      Object.entries(table).map(([syl, sens]) => `  ${syl} = ${sens}`).join('\n')

    // La tension est rappelée ici, à l'endroit exact où le modèle compose :
    // renvoyer à une section plus haut suffit rarement.
    const anchor = tension ? `\nTension à encoder dans les noms : ${tension}\n` : ''

    return `${o.instruction}
${anchor}

MATIÈRE — première syllabe
${list(o.matiere)}

POSTURE — syllabe finale
${list(o.posture)}`
  }

  /** Les sections SIGNE et NOMBRES du prompt de génération. */
  /**
   * L'objectif de la scène, tel que ce joueur-là le rencontre.
   *
   * L'exigence mécanique — obtenir la carte, lire la fréquence — ne bouge
   * jamais : c'est la structure de l'arc. Ce qui change, c'est ce qu'elle
   * DEMANDE à ce joueur, et ça se déduit de la facette qui gouverne l'acte.
   */
  /**
   * Ce que le joueur transporte en arrivant.
   *
   * Sans ce bloc, chaque scène était un vase clos : le modèle ne pouvait pas
   * bâtir un puzzle sur un objet ramassé deux scènes plus tôt, puisqu'il en
   * ignorait l'existence. Un objet dont le nom n'a pas encore été déchiffré
   * est décrit par sa forme, jamais nommé — le joueur ne le connaît pas.
   */
  private describeCarried(carried: CarriedItem[], ending = false): string {
    const inv = this.script.defaults.inventory
    if (!carried.length) return ending ? inv.ending_empty : inv.empty

    // La nature de l'objet est dite au modèle : une carte se présente, un
    // souvenir se comprend. Sans elle, il traitait les deux pareil.
    const label = (o: CarriedItem) => o.decrypted ? o.label : `un objet ${inv.unread}`
    const items = carried
      .map(o => `  - [${o.kind === 'key' ? 'OUVRE' : 'ÉCLAIRE'}] ${label(o)}`
        + (o.color ? ` — couleur : ${o.color}` : '')
        + (o.from ? ` — récupéré : ${o.from}` : ''))
      .join('\n')

    return interpolate(ending ? inv.ending_prompt : inv.prompt, { items })
  }

  private describeObjective(theme: PlayerTheme | null): string {
    const focus = this.scene.theme_focus
    const objective = this.scene.objective
    if (!focus || !objective?.requirement) return ''

    // La valeur de la facette vient du profil ; sans elle, on garde le libellé
    // plutôt que d'écrire « undefined » dans le prompt.
    const value = (theme?.numbers as Record<string, string | null> | undefined)?.[focus.facet]

    return '\n' + interpolate(this.script.defaults.objective_derivation.instruction, {
      requirement: objective.requirement,
      axis: focus.axis,
      step: String(focus.step),
      act: this.scene.act ?? '',
      facet: focus.facet_label,
      facet_value: value ?? 'non renseignée — appuie-toi alors sur la seule tension du SIGNE',
    }) + '\n'
  }

  /**
   * Les positions imposées aux personnages de la scène.
   *
   * Elles viennent du syllabaire : une syllabe de posture n'est pas une
   * étiquette, c'est ce que le personnage a fait de la même tension que le
   * joueur. Elle décide donc à la fois de son nom, de sa voix et de ce qu'il
   * veut — les trois tiennent ensemble ou aucun ne tient.
   */
  private describeCast(): string {
    const stances = this.scene.cast_stances
    if (!stances?.length) return ''

    const { holder_stance: holder, informant_stance: informant } = this.scene.key_item
    const lines = stances.map((st, i) => {
      const marks = [
        i === 0 ? 'c\'est lui qui accueille le joueur' : '',
        holder && st.posture === holder ? 'c\'est LUI qui DÉTIENT l\'objet-clé' : '',
        informant && st.posture === informant ? 'c\'est lui qui SAIT où il est, sans l\'avoir' : '',
      ].filter(Boolean)
      return `  ${i + 1}. ${st.posture} : ${st.means}${marks.length ? ' — ' + marks.join(' ; ') : ''}`
    }).join('\n')

    return `${this.script.defaults.cast.instruction}\nPositions imposées, dans cet ordre :\n${lines}`
  }

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

    // Le modèle recopie parfois la mécanique dans l'archétype affiché, ce qui
    // révèle au joueur qui détient quoi avant même qu'il ait parlé à personne.
    const LEAKS = /informat|d[ée]tent|porteur de|gardien de l|personnage.cl|t[ée]moin.cl|\bindice\b|\bcontact\b|\bpnj\b/i
    for (const npc of generated.npcs ?? []) {
      if (npc.archetype && LEAKS.test(npc.archetype)) {
        throw new Error(`Scène invalide : l'archétype de ${npc.name} révèle sa fonction ("${npc.archetype}")`)
      }
    }

    if (!Array.isArray(generated.npcs) || generated.npcs.length === 0) {
      throw new Error('Scène invalide : aucun PNJ')
    }

    // Un personnage que le TEXTE ne nomme pas est un personnage inatteignable.
    // Le panneau du haut n'affiche que des tirets tant qu'on ne lui a pas parlé,
    // et on ne peut lui parler qu'en tapant son nom : le récit est la seule
    // source. Une scène qui décrit « un homme en uniforme gris » sans le nommer
    // n'a rien à chiffrer, donc rien à chercher, et sa chaîne informateur puis
    // détenteur ne peut jamais s'ouvrir. Elle est injouable, pas imparfaite.
    const written = fold(generated.scene_text)
    const unnamed = generated.npcs.filter(n => n.name && !written.includes(fold(n.name)))
    if (unnamed.length) {
      throw new Error(
        `Scène invalide : ${unnamed.map(n => n.name).join(', ')} `
        + `${unnamed.length > 1 ? 'ne sont pas nommés' : "n'est pas nommé"} dans le texte `
        + '— le joueur ne pourrait s\'adresser à personne')
    }

    const item = generated.key_item
    if (!item?.name || !item?.npc_id) {
      throw new Error('Scène invalide : key_item.name ou key_item.npc_id manquant')
    }

    // Comment l'objet-clé s'obtient dépend de la scène, pas du moteur. L'auberge
    // a trois rôles distincts — celui qui expose, celui qui sait, celui qui
    // garde — mais une plate-forme d'antennes n'a pas de barman, et une console
    // ne se laisse pas convaincre : ce qu'elle affiche se lit, point.
    const acquisition = this.scene.key_item.acquisition ?? 'informant_then_holder'

    if (acquisition === 'found') {
      if (item.npc_id !== FOUND_ITEM_ID) {
        throw new Error(
          `Scène invalide : objet à trouver, key_item.npc_id doit valoir "${FOUND_ITEM_ID}" `
          + `(reçu "${item.npc_id}")`)
      }
      return
    }

    // Un détenteur inconnu rendrait la sortie impossible à débloquer.
    if (!generated.npcs.some(n => n.id === item.npc_id)) {
      throw new Error(`Scène invalide : key_item.npc_id "${item.npc_id}" ne désigne aucun PNJ`)
    }
    if (acquisition === 'holder') return

    if (!item.informant_npc_id || item.informant_npc_id === item.npc_id) {
      throw new Error('Scène invalide : key_item.informant_npc_id doit désigner un AUTRE PNJ')
    }
    if (!generated.npcs.some(n => n.id === item.informant_npc_id)) {
      throw new Error(`Scène invalide : informant_npc_id "${item.informant_npc_id}" ne désigne aucun PNJ`)
    }
    // Le premier de la liste ouvre la scène : il expose, il ne résout rien.
    const host = generated.npcs[0]?.id
    if (host && (item.npc_id === host || item.informant_npc_id === host)) {
      throw new Error('Scène invalide : celui qui accueille ne peut être ni détenteur ni informateur')
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

    // La Majuscule de Titre est le seul signal d'interaction du jeu. Le modèle
    // l'applique à la liste `interactables` et l'oublie dans la prose : le même
    // objet y est « un tourniquet de contrôle », donc invisible comme objet.
    // La règle est dans le prompt depuis toujours et n'a jamais suffi — on la
    // fait respecter ici, sans un token de plus.
    const naming = enforceNameCaps(scene.scene_text, [
      ...interactables.map(i => i.label),
      ...(scene.decor ?? []).map(d => d.name),
      scene.place.name,
      scene.key_item?.name,
      scene.sealed_object?.name,
    ].filter((n): n is string => Boolean(n)))

    if (naming.fixed.length) {
      console.warn(`[scene/${this.scene.id}] majuscules recalées : ${naming.fixed.join(' · ')}`)
    }
    // Un nom déclaré que le texte ne prononce pas est un objet que le joueur ne
    // rencontrera jamais : la liste `interactables` promet ce que la prose ne
    // montre pas.
    if (naming.missing.length) {
      console.warn(`[scene/${this.scene.id}] déclarés mais absents du texte : ${naming.missing.join(' · ')}`)
    }

    const vars = {
      quest_title: scene.quest.title,
      quest_artifact: scene.quest.artifact,
      place_name: scene.place.name,
    }

    return {
      ...scene,
      scene_text: naming.text,
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
      // Seule l'auberge remet l'augmentation ; ailleurs l'objet-clé est une
      // carte, une fréquence, un code — utile ici et nulle part ailleurs.
      grants_augmentation: this.scene.objective?.kind === 'acquire_augmentation',
      // Seule cette scène-là demande le paiement ; les suivantes s'enchaînent.
      is_paywall_gate: this.scene.is_paywall_gate === true,
      // Le client s'en sert pour teindre l'habillage. La scène 1 est en
      // `fixed` : son magenta est l'identité d'entrée du jeu.
      interface_palette: this.scene.interface_palette?.mode ?? 'from_scene',
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
          item_action: ctx.key_item.resolving_action || ctx.quest.restoration || ctx.quest.objective,
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

    /**
     * Les deux règles communes à toute réplique de personnage.
     *
     * Aucun prompt ne demandait de RÉPONDRE à ce que le joueur venait de dire :
     * ils passaient sa phrase puis donnaient aussitôt un ordre du jour, et l'un
     * d'eux ordonnait même de parler d'autre chose. D'où des personnages qui
     * dévisagent et enchaînent. Répondre d'abord, orienter ensuite.
     */
    const rules = {
      reply_rule: t.reply_rule ?? '',
      steer_rule: interpolate(t.steer_rule ?? '', { quest_objective: ctx.quest.objective }),
    }

    if (mode === 'handover' && npc && ctx.key_item) {
      return interpolate(t.handover_prompt, {
        ...rules,
        npc_name: npc.name,
        npc_archetype: npc.archetype,
        npc_personality: npc.personality,
        player_input: input,
        item_name: ctx.key_item.name,
        item_description: ctx.key_item.description,
        item_why: ctx.key_item.why,
        item_action: ctx.key_item.resolving_action || ctx.quest.restoration || ctx.quest.objective,
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
        item_action: ctx.key_item.resolving_action || ctx.quest.restoration || ctx.quest.objective,
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

    // Deux ou trois échanges avant qu'il s'ouvre : un personnage qui livre ce
    // qu'il sait à la première réplique n'a aucune consistance. Avant ça il
    // parle vraiment, lâche au mieux un fragment, et jauge son interlocuteur.
    const warmedUp = (ctx.npc_exchanges ?? 0) >= (t.exchanges_before_steer ?? 2)

    if (item && !ctx.has_key_item && npc.id === item.informant_npc_id && !warmedUp) {
      return interpolate(t.informant_warmup_prompt, {
        ...rules,
        npc_name: npc.name,
        npc_archetype: npc.archetype,
        npc_personality: npc.personality,
        npc_knows: npc.knows,
        player_input: input,
        quest_title: ctx.quest.title,
      })
    }

    // L'informateur met sur la piste : c'est lui qui ouvre la chaîne.
    if (item && !ctx.has_key_item && npc.id === item.informant_npc_id) {
      return interpolate(t.informant_prompt, {
        ...rules,
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
        ...rules,
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
        ...rules,
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
      ...rules,
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
      // `structure` vient des defaults, `instruction` de la scène.
      quest: { ...d.quest, ...raw.quest },
      // Toutes les scènes en ont un ; l'auberge garde sa propre formulation.
      sealed_object: raw.sealed_object ?? d.sealed_object,
      narrative: { ...d.narrative, ...raw.narrative },
      turn: { ...d.turn, ...raw.turn },
      generation: { ...d.generation, ...raw.generation },
      interface_palette: { ...d.interface_palette, ...raw.interface_palette },
      error_fallbacks: d.error_fallbacks,
    }
  }
}
