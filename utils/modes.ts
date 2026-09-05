/**
 * Chaque posture du syllabaire mène à un mode.
 *
 * C'est le SEUL appariement, et il est volontairement universel : une liste de
 * métiers — barman, receleuse, cartographe — n'aurait valu que pour la première
 * scène. Les postures, elles, décrivent une position face à la tension du
 * joueur, et cette position existera dans toutes les scènes à venir.
 */
const BY_POSTURE: Record<string, keyof typeof MODES> = {
  ru: 'dorien',      // qui garde, qui ne cède pas
  me: 'dorien',      // qui a payé le prix et tient debout
  mi: 'lydien',      // qui voit et se tait
  ki: 'lydien',      // qui cherche encore
  no: 'eolien',      // qui a perdu
  na: 'eolien',      // qui attend sans agir
  shi: 'locrien',    // qui a rompu et n'est pas revenu
  to: 'mixolydien',  // qui parle, qui met sur la piste
  ra: 'mixolydien',  // qui montre, qui éclaire
  ka: 'phrygien',    // qui échange, qui monnaye
  zu: 'phrygien',    // qui nie, qui détourne le regard
  va: 'ionien',      // qui sert, qui reste derrière
}

/**
 * Modes grecs et leurs connotations symboliques.
 *
 * Chaque personnage sonne selon ce qu'il est. Le rapprochement mode/affect est
 * celui de la tradition occidentale — il n'a rien de scientifique, mais il est
 * assez partagé pour qu'une oreille non musicienne le ressente.
 */

export interface Mode {
  name: string
  /** Les degrés de l'accord, en demi-tons depuis la tonique. */
  steps: number[]
  /**
   * La gamme complète, sept degrés.
   *
   * Indispensable aux sujets de fugue : un sujet se déplace par degrés
   * conjoints, il lui faut une échelle, pas seulement un accord.
   */
  scale: number[]
  /**
   * Décalage de registre, en demi-tons.
   *
   * La hauteur caractérise autant que la couleur : celui qui rêve flotte
   * au-dessus, celui qui a rompu s'enfonce. Borné à une quinte de part et
   * d'autre pour que les familles de voix restent distinguables entre elles.
   */
  register: number
  /** Ce que le mode évoque, et donc quel personnage il désigne. */
  connotation: string
}

export const MODES: Record<string, Mode> = {
  ionien: { name: 'ionien', steps: [0, 4, 7, 11], scale: [0, 2, 4, 5, 7, 9, 11], register: 3, connotation: 'clarté, franchise, ce qui est à sa place' },
  dorien: { name: 'dorien', steps: [0, 3, 7, 9], scale: [0, 2, 3, 5, 7, 9, 10], register: -2, connotation: 'noblesse mélancolique, dignité dans la peine' },
  phrygien: { name: 'phrygien', steps: [0, 1, 7, 8], scale: [0, 1, 3, 5, 7, 8, 10], register: -4, connotation: 'tension, menace sourde, étrangeté' },
  lydien: { name: 'lydien', steps: [0, 4, 6, 11], scale: [0, 2, 4, 6, 7, 9, 11], register: 7, connotation: 'rêve, élévation, ce qui flotte hors du réel' },
  mixolydien: { name: 'mixolydien', steps: [0, 4, 7, 10], scale: [0, 2, 4, 5, 7, 9, 10], register: 0, connotation: 'chaleur, mouvement, la rue qui parle' },
  eolien: { name: 'eolien', steps: [0, 3, 7, 8], scale: [0, 2, 3, 5, 7, 8, 10], register: -5, connotation: 'deuil, perte, résignation' },
  locrien: { name: 'locrien', steps: [0, 3, 6, 10], scale: [0, 1, 3, 5, 6, 8, 10], register: -7, connotation: 'instabilité, vertige, ce qui a rompu' },
}

/**
 * Mots-clés qui rattachent un personnage à un mode.
 *
 * Ils sont cherchés dans l'archétype ET dans le nom composé : le syllabaire
 * encode déjà la posture du personnage dans sa dernière syllabe, on s'en sert.
 */
const KEYWORDS: Array<{ mode: keyof typeof MODES; words: string[]; suffix: string }> = [
  // Radicaux plutôt que mots entiers : « Gardienne », « Régulatrice » et
  // « Gardien » doivent tomber ensemble, or une liste de formes exactes en
  // rate toujours une — et le personnage bascule alors sur le hasard.
  { mode: 'dorien', suffix: 'ru', words: ['gard', 'tien', 'regul', 'ferr', 'ancien', 'veille', 'sentin', 'compt', 'dett'] },
  { mode: 'lydien', suffix: 'mi', words: ['voi', 'oeil', 'œil', 'vision', 'rev', 'cartograph', 'lect', 'guett', 'observ'] },
  { mode: 'eolien', suffix: 'no', words: ['perd', 'manqu', 'dechu', 'dernier', 'dernier', 'veuv', 'orphel', 'cendre', 'restant'] },
  { mode: 'locrien', suffix: 'shi', words: ['romp', 'bris', 'coupur', 'fuit', 'exil', 'fugi', 'desert', 'transfug'] },
  { mode: 'mixolydien', suffix: 'to', words: ['voix', 'parl', 'chant', 'crieur', 'colport', 'rumeur', 'passeu', 'messag', 'file'] },
  { mode: 'phrygien', suffix: 'zu', words: ['nie', 'cach', 'recel', 'ombre', 'contreband', 'faussaire', 'masqu', 'silenc'] },
  { mode: 'ionien', suffix: 'va', words: ['barman', 'barmaid', 'comptoir', 'sert', 'patron', 'tenanci', 'hote', 'verse'] },
]

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Le mode d'un personnage, à partir de son rôle et de son nom.
 *
 * Toujours le même pour un même personnage : la reconnaissance passe par la
 * répétition, un mode tiré au hasard à chaque écoute ne dirait rien.
 */
export function modeFor(posture: string | undefined, name: string): Mode {
  // 1. La posture déclarée par la génération : la seule source fiable.
  const declared = BY_POSTURE[normalize(posture ?? '').replace(/^-/, '')]
  if (declared) return MODES[declared]

  // 2. À défaut, la syllabe finale du nom porte la même information.
  const id = normalize(name)
  for (const [syllable, mode] of Object.entries(BY_POSTURE)) {
    if (id.endsWith(syllable)) return MODES[mode]
  }

  // 3. Sinon, empreinte du nom : arbitraire mais stable.
  const keys = Object.keys(MODES)
  let sum = 0
  for (const ch of name) sum += ch.charCodeAt(0)
  return MODES[keys[sum % keys.length]]
}

/** La tonique du personnage, en numéro MIDI. Stable pour un même nom. */
export function rootMidiFor(name: string): number {
  // Do2 à Si2 : registre grave, les voix remontent ensuite selon leur octave.
  const ROOTS = [36, 38, 39, 41, 43, 44, 46]
  let sum = 0
  for (const ch of name) sum += ch.charCodeAt(0)
  return ROOTS[sum % ROOTS.length]
}

/** Nom de note à partir d'un numéro MIDI. */
export function midiToNote(midi: number): string {
  const SEMITONES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const safe = Math.max(12, Math.min(108, Math.round(midi)))
  return `${SEMITONES[safe % 12]}${Math.floor(safe / 12) - 1}`
}
