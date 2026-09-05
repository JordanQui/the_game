/**
 * Le test psychotechnique qui garde les objets chiffrés.
 *
 * Trois symboles, une règle à deviner, quatre propositions pour le quatrième.
 * Ce n'est pas une énigme de culture : c'est une lecture de série, exactement
 * ce que l'augmentation est censée faire à la place du joueur — et qu'elle lui
 * demande de faire une fois, pour prouver qu'il sait voir.
 *
 * Tout est DÉTERMINISTE à partir d'une graine tirée du profil : deux joueurs
 * n'ont pas les mêmes suites, et un même joueur retrouve les siennes s'il
 * recharge. Rien n'est aléatoire, donc rien n'échappe au test.
 */

/**
 * La roue.
 *
 * Huit signes, une seule idée : LA ZONE PLEINE TOURNE, d'un cran à la fois. Le
 * haut, puis le coin haut-droite, puis la droite, et ainsi de suite. Rien à
 * mémoriser, rien à croiser : on regarde où est la partie pleine, on voit dans
 * quel sens elle se déplace, on continue. Il ne reste au joueur qu'une chose à
 * trancher — le sens.
 *
 * C'est la troisième version de cet alphabet, et la première qui veuille dire
 * quelque chose. La première rangeait les glyphes dans l'ordre de la table
 * Unicode : « avancer de trois » faisait passer d'un quart de carré à une
 * moitié puis à une diagonale, il fallait connaître la liste par coeur. La
 * deuxième croisait trois familles de formes et quatre orientations : c'était
 * lisible, mais il fallait suivre deux choses à la fois. Ici il n'y en a plus
 * qu'une, et c'est un mouvement.
 */
const WHEEL = [
  '⬒', // haut
  '⬔', // haut-droite
  '◨', // droite
  '◪', // bas-droite
  '⬓', // bas
  '⬕', // bas-gauche
  '◧', // gauche
  '◩', // haut-gauche
]

/** Crans de la roue. Un tour complet. */
const STEPS = WHEEL.length

/**
 * Les quarts de carré. Ils ne servent PAS aux énigmes — ils n'appartiennent à
 * aucune rotation lisible —, seulement à brouiller le nom des objets scellés.
 */
const QUARTERS = ['◰', '◳', '◲', '◱']

/**
 * Alphabet de brouillage.
 *
 * Volontairement autre que le bruit des noms de personnages : un objet ne se
 * lit pas comme une identité, et le joueur doit distinguer les deux d'un coup
 * d'oeil. Ici des formes géométriques, là-bas des caractères.
 */
export const GLYPHS = [...WHEEL, ...QUARTERS]

/** Le signe à un cran donné, la roue rebouclant dans les deux sens. */
function at(step: number): string {
  return WHEEL[((step % STEPS) + STEPS) % STEPS]!
}

/**
 * Le sens dans lequel la roue tourne. C'est la SEULE chose à trancher.
 *
 * Un cran à la fois, jamais deux. Une rotation d'un quart avait été essayée :
 * elle reste entre diagonales, ou entre moitiés, si bien que la bonne réponse
 * était la seule de son espèce parmi les quatre propositions — on la trouvait
 * en éliminant les intrus, sans jamais regarder dans quel sens ça tournait.
 */
export type RuleKind = 'horaire' | 'antihoraire'

const RULES: Array<{ kind: RuleKind; turn: number }> = [
  { kind: 'horaire', turn: 1 },
  { kind: 'antihoraire', turn: -1 },
]

export interface Puzzle {
  /** Les trois symboles montrés. */
  sequence: string[]
  /** Les quatre propositions, dans l'ordre d'affichage. */
  choices: string[]
  /** Index de la bonne réponse dans `choices`. */
  answer: number
  /** La règle employée, pour le diagnostic — jamais montrée au joueur. */
  rule: RuleKind
}

/** Générateur déterministe : même graine, même suite. */
function seeded(seed: number): () => number {
  let state = (seed || 1) >>> 0
  return () => {
    state ^= state << 13; state >>>= 0
    state ^= state >> 17
    state ^= state << 5; state >>>= 0
    return state / 0xffffffff
  }
}

export function seedFrom(text: string): number {
  let sum = 2166136261
  for (const ch of text) {
    sum ^= ch.charCodeAt(0)
    sum = Math.imul(sum, 16777619)
  }
  return sum >>> 0
}

/**
 * Les trois leurres : la roue arrêtée un cran trop loin, deux crans trop loin,
 * trois crans trop loin — les crans en deçà sont déjà dans la suite.
 *
 * Tous sont sur la MÊME roue que la réponse — c'est ce qui interdit de répondre
 * en éliminant les intrus. Aucun n'est défendable : la suite fixe la vitesse et
 * le sens, donc un seul cran convient.
 */
function pickDecoys(sequence: string[], target: number): string[] {
  const decoys: string[] = []
  for (const off of [1, -1, 2, -2, 3, -3, 4]) {
    if (decoys.length === 3) break
    const candidate = at(target + off)
    // Un signe déjà montré dans la suite n'est pas un leurre : c'est un indice.
    if (decoys.includes(candidate) || sequence.includes(candidate)) continue
    decoys.push(candidate)
  }
  return decoys
}

/** Construit une énigme à partir d'une graine. */
export function buildPuzzle(seed: number): Puzzle {
  const rand = seeded(seed)

  const rule = RULES[Math.floor(rand() * RULES.length) % RULES.length]!
  const start = Math.floor(rand() * STEPS)

  const sequence = [0, 1, 2].map(p => at(start + rule.turn * p))
  const target = start + rule.turn * 3
  const correct = at(target)

  const choices = [correct, ...pickDecoys(sequence, target)]
  // Mélange déterministe, pour que la bonne réponse ne soit pas toujours première.
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[choices[i], choices[j]] = [choices[j]!, choices[i]!]
  }

  return { sequence, choices, answer: choices.indexOf(correct), rule: rule.kind }
}

/** L'énigme d'un objet donné, pour un joueur donné. */
export function puzzleFor(objectId: string, playerSeed: string): Puzzle {
  return buildPuzzle(seedFrom(`${playerSeed}|${objectId}`))
}
