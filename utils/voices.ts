import { MODES, modeFor, type Mode } from '~/utils/modes'

/**
 * La voix d'un personnage : sa famille de synthèse.
 *
 * Le mode donne les hauteurs, la voix donne la matière. Deux personnages
 * peuvent partager un mode et sonner très différemment — c'est ce qui rend
 * chacun reconnaissable au premier pas de l'arpège.
 */

export type VoiceKey = 'drumbass' | 'sinus' | 'drone' | 'acid' | 'stabs'

export interface Voice {
  key: VoiceKey
  /** Ce que la matière raconte du personnage. */
  intention: string
  /** Octave de départ, relative à celle du mode. */
  octaveShift: number
  /** Densité rythmique : 1 = une note par double-croche. */
  density: 1 | 2 | 4
}

export const VOICES: Record<VoiceKey, Voice> = {
  drumbass: {
    key: 'drumbass',
    intention: 'lourd, buté, ce qui cogne et ne cède pas',
    octaveShift: -2,
    density: 2,
  },
  sinus: {
    key: 'sinus',
    intention: 'fragile, flottant, un signal qui se dégrade',
    octaveShift: 0,
    density: 1,
  },
  drone: {
    key: 'drone',
    intention: 'tenu, immobile, ce qui dure et pèse',
    octaveShift: -1,
    density: 4,
  },
  acid: {
    key: 'acid',
    intention: 'nerveux, fuyant, ce qui se dérobe',
    octaveShift: -1,
    density: 1,
  },
  stabs: {
    key: 'stabs',
    intention: 'net, ponctuel, ce qui tranche et rend la main',
    octaveShift: 0,
    density: 2,
  },
}

/**
 * Quelle voix pour quel mode.
 *
 * L'appariement suit la connotation : le mode dit l'affect, la voix lui donne
 * un corps. Sept modes pour cinq voix — certaines en servent deux, ce qui est
 * sans conséquence puisque les hauteurs, elles, restent distinctes.
 */
const BY_MODE: Record<string, VoiceKey> = {
  ionien: 'stabs',       // clarté, ce qui est à sa place — le barman
  mixolydien: 'stabs',   // la rue qui parle
  dorien: 'drone',       // noblesse mélancolique — celui qui garde
  eolien: 'drone',       // deuil, ce qui pèse
  phrygien: 'acid',      // menace sourde — celui qui nie
  lydien: 'sinus',       // rêve, ce qui flotte
  locrien: 'drumbass',   // vertige, ce qui a rompu
}

export function voiceFor(mode: Mode): Voice {
  return VOICES[BY_MODE[mode.name] ?? 'sinus']
}

/**
 * Le motif joué, selon la densité de la voix.
 *
 * Toujours un flux continu de doubles-croches : ce sont les répétitions qui
 * changent, pas les silences. Un drone tient chaque degré quatre pas, une
 * basse deux, un sinus un seul.
 */
export function buildPattern(notes: string[], voice: Voice): string[] {
  const shift = (note: string, by: number) =>
    note.replace(/-?\d+$/, m => String(Number(m) + by))

  const base = notes.map(n => shift(n, voice.octaveShift))
  const high = base.map(n => shift(n, 1))

  // Montée, redescente, sans répéter la note de jonction.
  const contour = [...base, ...high, ...[...high].reverse().slice(1), ...[...base].reverse().slice(1, -1)]

  return contour.flatMap(note => Array.from({ length: voice.density }, () => note))
}

/**
 * Attribue une voix DISTINCTE à chaque personnage d'une scène.
 *
 * L'appariement par mots-clés laisse forcément des personnages sans
 * correspondance, et le repli par empreinte les fait alors collisionner : sur
 * une scène de quatre habitués, trois pouvaient se retrouver avec le même
 * drone. Or c'est justement la différence entre les voix qui rend chacun
 * reconnaissable — sans elle, la mécanique ne dit plus rien.
 *
 * On garde donc le choix sémantique quand il existe, et on décale seulement
 * ceux qui entrent en conflit. Cinq voix pour au plus cinq personnages : la
 * distinction est toujours atteignable.
 */
export function assignVoices(
  npcs: Array<{ name: string; archetype?: string }>
): Map<string, { mode: Mode; voice: Voice }> {
  const order = Object.keys(MODES)
  const taken = new Set<VoiceKey>()
  const result = new Map<string, { mode: Mode; voice: Voice }>()

  for (const npc of npcs) {
    const preferred = modeFor(npc.archetype ?? '', npc.name)

    // On part du mode voulu et on avance dans la table jusqu'à trouver une
    // voix libre. L'ordre est fixe, donc le résultat reste reproductible.
    let mode = preferred
    let steps = 0
    while (taken.has(voiceFor(mode).key) && steps < order.length) {
      steps++
      const next = order[(order.indexOf(preferred.name) + steps) % order.length]
      mode = MODES[next]
    }

    const voice = voiceFor(mode)
    taken.add(voice.key)
    result.set(npc.name, { mode, voice })
  }

  return result
}
