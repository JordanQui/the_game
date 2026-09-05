import type { Mode } from '~/utils/modes'

/**
 * Sujets de fugue, à la manière de Bach.
 *
 * Ce ne sont PAS des citations : reproduire un sujet du Clavier bien tempéré
 * de mémoire produirait un à-peu-près qui sonnerait faux. Ce sont des sujets
 * écrits selon la même grammaire — une tête caractéristique, une marche
 * séquentielle, une cadence — chacun taillé pour un caractère.
 *
 * Les degrés sont exprimés en positions dans la GAMME du mode, pas en
 * demi-tons : un même sujet se colore donc différemment selon le mode du
 * personnage. Le degré 7 est la tonique à l'octave, les négatifs descendent.
 */

export interface Subject {
  /** Le nombre auquel ce sujet répond. */
  number: number
  /** Ce que sa forme raconte. */
  character: string
  /** Degrés de la gamme, dans l'ordre. */
  degrees: number[]
}

/**
 * Neuf sujets pour les neuf nombres de la numérologie du nom.
 *
 * La forme suit le sens du nombre : le 1 affirme et retombe sur sa tonique,
 * le 2 procède par paires alternées, le 7 s'éloigne sans revenir, le 9 attaque
 * par sauts. C'est la correspondance symbolique demandée — le nombre du
 * personnage choisit sa figure.
 */
export const SUBJECTS: Subject[] = [
  { number: 1, character: 'affirmation : monte franchement et retombe sur sa tonique',
    degrees: [0, 4, 2, 7, 4, 2, 1, 0] },
  { number: 2, character: 'duplicité : deux voix qui alternent sans se rejoindre',
    degrees: [0, 3, 1, 4, 2, 5, 3, 1] },
  { number: 3, character: 'transmission : une marche qui se répète un degré plus haut',
    degrees: [0, 1, 2, 1, 3, 4, 3, 2] },
  { number: 4, character: 'dérèglement : une tête stable rompue par un saut',
    degrees: [0, 2, 0, 2, 6, 3, 1, 0] },
  { number: 5, character: 'mouvement : conjoint, rapide, sans jamais s\'arrêter',
    degrees: [0, 1, 2, 3, 4, 5, 6, 7] },
  { number: 6, character: 'attachement : tourne autour de sa tierce et y revient',
    degrees: [0, 2, 1, 2, 4, 2, 1, 2] },
  { number: 7, character: 'retrait : s\'éloigne par intervalles larges et ne revient pas',
    degrees: [0, 3, 6, 2, 5, 8, 4, 7] },
  { number: 8, character: 'endurance : descend obstinément, remonte à peine',
    degrees: [7, 6, 5, 4, 5, 3, 2, 0] },
  { number: 9, character: 'conflit : attaque par sauts contraires',
    degrees: [0, 5, 1, 6, 2, 7, 3, 4] },
]

export function subjectFor(nameNumber: number): Subject {
  const index = ((nameNumber - 1) % SUBJECTS.length + SUBJECTS.length) % SUBJECTS.length
  return SUBJECTS[index]
}

/** Convertit un degré de gamme — éventuellement hors octave — en demi-tons. */
function semitones(mode: Mode, degree: number): number {
  const size = mode.scale.length
  const octave = Math.floor(degree / size)
  const index = ((degree % size) + size) % size
  return mode.scale[index] + octave * 12
}

/**
 * Le déroulé fugué : sujet, réponse, sujet renversé.
 *
 * C'est la charpente d'une exposition de fugue — l'énoncé, sa réponse à la
 * quinte, puis le renversement — réduite à ce qu'une seule voix peut porter.
 * Elle donne une ligne longue et variée là où un arpège tournait sur lui-même
 * au bout de quatre notes.
 */
export function fugueDegrees(subject: Subject): number[] {
  const statement = subject.degrees
  // La réponse traditionnelle se place à la quinte, soit quatre degrés.
  const answer = statement.map(d => d + 4)
  // Le renversement retourne chaque intervalle autour de la note de départ.
  const inversion = statement.map(d => statement[0] - (d - statement[0]))

  return [...statement, ...answer, ...inversion]
}

/** Les hauteurs jouées, dans le mode et à partir de la tonique donnée. */
export function fugueLine(mode: Mode, subject: Subject, rootMidi: number): number[] {
  return fugueDegrees(subject).map(d => rootMidi + semitones(mode, d))
}
