/**
 * Numérologie indienne, à partir de la date de naissance et du nom.
 *
 * Trois nombres, trois rôles distincts :
 *  - moolank (मूलांक), « nombre psychique » : réduction du JOUR de naissance.
 *    C'est la manière d'agir.
 *  - bhagyank (भाग्यांक), « nombre de destinée » : réduction de la date ENTIÈRE.
 *    C'est la forme que prend l'objectif.
 *  - namank, « nombre du nom » : valeur chaldéenne des lettres du nom.
 *    C'est la façon dont le monde reçoit le joueur.
 *
 * Comme utils/zodiac.ts, ce fichier ne contient AUCUN texte de jeu : il ne
 * produit que des nombres. Leur sens vit dans game/script.json.
 */

import { parseBirthday } from '~/utils/zodiac'

/**
 * Table chaldéenne, celle qu'emploie la numérologie indienne — et non la table
 * pythagoricienne. Le 9 n'y est jamais attribué à une lettre : il était tenu
 * pour sacré.
 */
const CHALDEAN: Record<string, number> = {
  A: 1, I: 1, J: 1, Q: 1, Y: 1,
  B: 2, K: 2, R: 2,
  C: 3, G: 3, L: 3, S: 3,
  D: 4, M: 4, T: 4,
  E: 5, H: 5, N: 5, X: 5,
  U: 6, V: 6, W: 6,
  O: 7, Z: 7,
  F: 8, P: 8,
}

export interface NumerologyProfile {
  /** Manière d'agir. Réduction du jour de naissance. */
  moolank: number
  /** Forme de l'objectif. Réduction de la date entière. */
  bhagyank: number | null
  /** Façon dont le monde reçoit le joueur. Valeur du nom. */
  namank: number | null
}

/** Réduit à un chiffre de 1 à 9. */
function reduce(n: number): number {
  let value = Math.abs(n)
  while (value > 9) {
    value = String(value).split('').reduce((sum, digit) => sum + Number(digit), 0)
  }
  return value === 0 ? 9 : value
}

/** Retire accents, espaces et ponctuation : la table ne connaît que A-Z. */
function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
}

export function namankOf(name?: string): number | null {
  if (!name) return null
  const letters = normalizeName(name)
  if (!letters) return null

  let total = 0
  for (const letter of letters) total += CHALDEAN[letter] ?? 0
  return total > 0 ? reduce(total) : null
}

/**
 * Le profil numérologique complet.
 *
 * `bhagyank` reste null quand Facebook masque l'année de naissance : il lui
 * faut la date entière, contrairement au moolank qui ne dépend que du jour.
 */
export function numerologyOf(birthday?: string, name?: string): NumerologyProfile | null {
  const date = parseBirthday(birthday)
  const namank = namankOf(name)
  if (!date && namank === null) return null

  if (!date) return { moolank: 0, bhagyank: null, namank }

  const year = extractYear(birthday)
  const digitsOf = (n: number) => String(n).split('').reduce((s, d) => s + Number(d), 0)

  return {
    moolank: reduce(date.day),
    bhagyank: year === null
      ? null
      : reduce(digitsOf(date.day) + digitsOf(date.month) + digitsOf(year)),
    namank,
  }
}

function extractYear(birthday?: string): number | null {
  if (!birthday) return null
  const raw = birthday.trim()

  const parts = raw.includes('/') ? raw.split('/') : raw.split('-')
  // `MM/DD/YYYY` met l'année en dernier, `YYYY-MM-DD` en premier.
  const candidate = raw.includes('/') ? parts[2] : parts[0]
  if (parts.length !== 3) return null

  const year = Number(candidate)
  return Number.isInteger(year) && year >= 1900 && year <= 2200 ? year : null
}
