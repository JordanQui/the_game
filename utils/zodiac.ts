/**
 * Signe astrologique à partir de la date de naissance.
 *
 * Ce fichier ne contient AUCUN texte de jeu : il ne fait que désigner un signe.
 * Tout ce que le signe raconte — sa tension avec la société, sa résolution —
 * vit dans game/script.json, comme le reste du contenu.
 */

export type ZodiacKey =
  | 'capricorne' | 'verseau' | 'poissons' | 'belier'
  | 'taureau' | 'gemeaux' | 'cancer' | 'lion'
  | 'vierge' | 'balance' | 'scorpion' | 'sagittaire'

/** Début de chaque signe, dans l'ordre de l'année civile. */
const CUSPS: Array<{ month: number; day: number; key: ZodiacKey }> = [
  { month: 1, day: 20, key: 'verseau' },
  { month: 2, day: 19, key: 'poissons' },
  { month: 3, day: 21, key: 'belier' },
  { month: 4, day: 20, key: 'taureau' },
  { month: 5, day: 21, key: 'gemeaux' },
  { month: 6, day: 21, key: 'cancer' },
  { month: 7, day: 23, key: 'lion' },
  { month: 8, day: 23, key: 'vierge' },
  { month: 9, day: 23, key: 'balance' },
  { month: 10, day: 23, key: 'scorpion' },
  { month: 11, day: 22, key: 'sagittaire' },
  { month: 12, day: 22, key: 'capricorne' },
]

/**
 * Extrait le mois et le jour, quel que soit le format reçu.
 *
 * Facebook renvoie `MM/DD/YYYY`, ou `MM/DD` quand l'utilisateur masque son
 * année ; la fixture de dev est en `YYYY-MM-DD`. Le signe ne dépendant que du
 * mois et du jour, une année masquée ne pose aucun problème.
 */
export function parseBirthday(birthday?: string): { month: number; day: number } | null {
  if (!birthday) return null
  const raw = birthday.trim()

  let month: number
  let day: number

  if (raw.includes('/')) {
    const [m, d] = raw.split('/')
    month = Number(m)
    day = Number(d)
  } else if (raw.includes('-')) {
    const parts = raw.split('-')
    // `YYYY-MM-DD` d'un côté, `MM-DD` de l'autre.
    const offset = parts.length === 3 ? 1 : 0
    month = Number(parts[offset])
    day = Number(parts[offset + 1])
  } else {
    return null
  }

  if (!Number.isInteger(month) || !Number.isInteger(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { month, day }
}

/** Le signe, ou null si la date est absente ou illisible. */
export function zodiacKey(birthday?: string): ZodiacKey | null {
  const date = parseBirthday(birthday)
  if (!date) return null

  // Le dernier seuil franchi donne le signe. Avant le 20 janvier, aucun seuil
  // n'est franchi dans l'année : on est encore dans le Capricorne de décembre.
  let current: ZodiacKey = 'capricorne'
  for (const cusp of CUSPS) {
    if (date.month > cusp.month || (date.month === cusp.month && date.day >= cusp.day)) {
      current = cusp.key
    }
  }
  return current
}
