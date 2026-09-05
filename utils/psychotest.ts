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
 * Alphabet de glyphes.
 *
 * Volontairement autre que le bruit des noms de personnages : un objet ne se
 * lit pas comme une identité, et le joueur doit distinguer les deux d'un coup
 * d'oeil. Ici des formes géométriques, là-bas des caractères.
 */
export const GLYPHS = ['◧', '◨', '◩', '◪', '⬒', '⬓', '⬔', '⬕', '◰', '◱', '◲', '◳']

export type RuleKind = 'rotation' | 'progression' | 'alternance' | 'miroir'

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

const RULES: RuleKind[] = ['rotation', 'progression', 'alternance', 'miroir']

/** Applique la règle pour obtenir l'indice du terme suivant. */
function nextIndex(rule: RuleKind, start: number, step: number, position: number): number {
  const n = GLYPHS.length
  switch (rule) {
    // Rotation : on avance d'un pas constant dans l'alphabet.
    case 'rotation':
      return (start + step * position) % n
    // Progression : le pas grandit à chaque terme.
    case 'progression':
      return (start + step * (position * (position + 1)) / 2) % n
    // Alternance : un pas en avant, un plus court en arrière.
    case 'alternance':
      return (start + (position % 2 === 0 ? step * position : step * position - 1) + n) % n
    // Miroir : on repart de la fin de l'alphabet.
    case 'miroir':
      return (n - 1 - ((start + step * position) % n) + n) % n
  }
}

/**
 * Construit une énigme à partir d'une graine.
 *
 * Les leurres sont voisins de la bonne réponse : assez proches pour qu'on ne
 * puisse pas répondre au hasard, assez distincts pour qu'il n'y ait jamais
 * deux réponses défendables.
 */
export function buildPuzzle(seed: number): Puzzle {
  const rand = seeded(seed)
  const n = GLYPHS.length

  const rule = RULES[Math.floor(rand() * RULES.length) % RULES.length]
  const start = Math.floor(rand() * n)
  const step = 1 + Math.floor(rand() * 3)

  const sequence = [0, 1, 2].map(i => GLYPHS[nextIndex(rule, start, step, i)])
  const correct = GLYPHS[nextIndex(rule, start, step, 3)]

  // Trois leurres distincts, pris autour de la bonne réponse.
  const decoys: string[] = []
  const offsets = [1, -1, 2, -2, 3, -3]
  for (const offset of offsets) {
    if (decoys.length === 3) break
    const candidate = GLYPHS[(GLYPHS.indexOf(correct) + offset + n) % n]
    if (candidate !== correct && !decoys.includes(candidate) && !sequence.includes(candidate)) {
      decoys.push(candidate)
    }
  }
  // Alphabet trop petit pour éviter la séquence : on relâche la contrainte.
  for (let offset = 1; decoys.length < 3; offset++) {
    const candidate = GLYPHS[(GLYPHS.indexOf(correct) + offset) % n]
    if (candidate !== correct && !decoys.includes(candidate)) decoys.push(candidate)
  }

  const choices = [correct, ...decoys]
  // Mélange déterministe, pour que la bonne réponse ne soit pas toujours première.
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[choices[i], choices[j]] = [choices[j], choices[i]]
  }

  return { sequence, choices, answer: choices.indexOf(correct), rule }
}

/** L'énigme d'un objet donné, pour un joueur donné. */
export function puzzleFor(objectId: string, playerSeed: string): Puzzle {
  return buildPuzzle(seedFrom(`${playerSeed}|${objectId}`))
}
