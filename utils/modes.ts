/**
 * Modes grecs et leurs connotations symboliques.
 *
 * Chaque personnage sonne selon ce qu'il est. Le rapprochement mode/affect est
 * celui de la tradition occidentale — il n'a rien de scientifique, mais il est
 * assez partagé pour qu'une oreille non musicienne le ressente.
 */

export interface Mode {
  name: string
  /** Intervalles en demi-tons depuis la tonique. */
  steps: number[]
  /** Ce que le mode évoque, et donc quel personnage il désigne. */
  connotation: string
}

export const MODES: Record<string, Mode> = {
  ionien: { name: 'ionien', steps: [0, 4, 7, 11], connotation: 'clarté, franchise, ce qui est à sa place' },
  dorien: { name: 'dorien', steps: [0, 3, 7, 9], connotation: 'noblesse mélancolique, dignité dans la peine' },
  phrygien: { name: 'phrygien', steps: [0, 1, 7, 8], connotation: 'tension, menace sourde, étrangeté' },
  lydien: { name: 'lydien', steps: [0, 4, 6, 11], connotation: 'rêve, élévation, ce qui flotte hors du réel' },
  mixolydien: { name: 'mixolydien', steps: [0, 4, 7, 10], connotation: 'chaleur, mouvement, la rue qui parle' },
  eolien: { name: 'eolien', steps: [0, 3, 7, 8], connotation: 'deuil, perte, résignation' },
  locrien: { name: 'locrien', steps: [0, 3, 6, 10], connotation: 'instabilité, vertige, ce qui a rompu' },
}

/**
 * Mots-clés qui rattachent un personnage à un mode.
 *
 * Ils sont cherchés dans l'archétype ET dans le nom composé : le syllabaire
 * encode déjà la posture du personnage dans sa dernière syllabe, on s'en sert.
 */
const KEYWORDS: Array<{ mode: keyof typeof MODES; words: string[]; suffix: string }> = [
  { mode: 'dorien', suffix: 'ru', words: ['garde', 'gardien', 'tient', 'fer', 'regulateur', 'régulateur', 'ancien', 'ancienne'] },
  { mode: 'lydien', suffix: 'mi', words: ['voit', 'oeil', 'œil', 'vision', 'reveur', 'rêveur', 'cartographe'] },
  { mode: 'eolien', suffix: 'no', words: ['perdu', 'perdue', 'manque', 'dechu', 'déchu', 'dernier', 'derniere', 'dernière'] },
  { mode: 'locrien', suffix: 'shi', words: ['rompu', 'brise', 'brisé', 'coupure', 'fuite', 'exile', 'exilé'] },
  { mode: 'mixolydien', suffix: 'to', words: ['voix', 'parle', 'chanteuse', 'chanteur', 'crieur', 'colporteur'] },
  { mode: 'phrygien', suffix: 'zu', words: ['nie', 'cache', 'receleur', 'receleuse', 'ombre', 'contrebande'] },
  { mode: 'ionien', suffix: 'va', words: ['barman', 'barmaid', 'comptoir', 'sert', 'patron', 'patronne'] },
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
export function modeFor(archetype: string, name: string): Mode {
  const role = normalize(archetype)
  const id = normalize(name)

  // La syllabe finale du nom porte la posture du personnage : c'est le signal
  // le plus fiable, on le regarde en premier. Elle n'est cherchée qu'EN FIN de
  // nom — « mi » ou « no » se retrouvent sinon au milieu de n'importe quel mot.
  for (const { mode, suffix } of KEYWORDS) {
    if (id.endsWith(suffix)) return MODES[mode]
  }

  for (const { mode, words } of KEYWORDS) {
    if (words.some(w => role.includes(normalize(w)))) return MODES[mode]
  }

  // Ni suffixe ni mot-clé : empreinte du nom, stable et arbitraire.
  const keys = Object.keys(MODES)
  let sum = 0
  for (const ch of name) sum += ch.charCodeAt(0)
  return MODES[keys[sum % keys.length]]
}

/** Les fréquences de l'arpège, en partant d'une tonique dérivée du nom. */
export function chimeNotes(mode: Mode, name: string): string[] {
  const ROOTS = ['C4', 'D4', 'Eb4', 'F4', 'G4', 'Ab4', 'Bb4']
  const SEMITONES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

  let sum = 0
  for (const ch of name) sum += ch.charCodeAt(0)
  const root = ROOTS[sum % ROOTS.length]

  const rootIndex = SEMITONES.indexOf(root.replace(/\d|b/g, '').toUpperCase())
  const octave = Number(root.slice(-1))

  return mode.steps.map((step) => {
    const total = (rootIndex < 0 ? 0 : rootIndex) + step
    return `${SEMITONES[total % 12]}${octave + Math.floor(total / 12)}`
  })
}
