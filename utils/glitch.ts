/**
 * Découpage d'un texte autour des noms à chiffrer.
 *
 * Les noms ne sont jamais lisibles dans le récit : ils sont recouverts d'une
 * animation de lettres qui bougent, et seul l'oeil bionique les révèle. Pour
 * les rendre autrement que le reste, il faut d'abord savoir où ils commencent
 * et où ils finissent.
 */

/** Une identité ne se brouille pas comme une chose : le rendu diffère. */
export type TermKind = 'name' | 'object'

export interface Term {
  value: string
  kind: TermKind
  /**
   * L'identité de la chose, pour un terme `object`.
   *
   * C'est elle qui décide de ce qui est déchiffré : sans elle, tous les objets
   * d'une scène partageaient l'id de l'objet scellé, et réussir une épreuve les
   * révélait tous d'un coup.
   */
  id?: string
}

export interface TextSegment {
  text: string
  /** Renseigné si ce fragment est un terme à chiffrer. */
  name?: string
  /** Nature du terme, pour choisir le composant de rendu. */
  kind?: TermKind
  /** L'identité de la chose, reportée depuis le terme. */
  id?: string
  /** Position du fragment dans le texte d'origine, pour la frappe progressive. */
  start: number
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Découpe le texte en fragments ordinaires et fragments-noms.
 *
 * Les noms les plus longs sont testés en premier : sinon « Seru » masquerait
 * « Serumito », dont il est un préfixe.
 */
export function splitByNames(text: string, terms: Array<string | Term>): TextSegment[] {
  const normalized: Term[] = terms.map(t => (typeof t === 'string' ? { value: t, kind: 'name' } : t))
  const usable = normalized
    .filter(t => t.value.trim().length > 1)
    .sort((a, b) => b.value.length - a.value.length)

  if (!usable.length) return [{ text, start: 0 }]

  // Insensible à la casse : le modèle écrit « la Carte Ambre » en début de
  // phrase et « la carte ambre » plus loin. Une correspondance exacte laissait
  // alors la moitié des occurrences en clair, sans qu'on comprenne pourquoi.
  const byValue = new Map(usable.map(t => [t.value.toLowerCase(), t]))
  const pattern = new RegExp(`(${usable.map(t => escapeRegex(t.value)).join('|')})`, 'gi')
  const segments: TextSegment[] = []
  let cursor = 0

  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0
    if (at > cursor) segments.push({ text: text.slice(cursor, at), start: cursor })
    const term = byValue.get(match[0].toLowerCase())
    segments.push({
      text: match[0],
      name: match[0],
      kind: term?.kind ?? 'name',
      id: term?.id,
      start: at,
    })
    cursor = at + match[0].length
  }

  if (cursor < text.length) segments.push({ text: text.slice(cursor), start: cursor })
  return segments
}

/**
 * Alphabet du brouillage.
 *
 * Volontairement latin : des runes ou des symboles mathématiques ont des
 * largeurs très différentes des lettres, et le nom changeait de taille à chaque
 * cycle — ce qui faisait danser tout le paragraphe.
 */
const NOISE = '#%@&$§?!*+=/\\|<>~^ABCDEFGHJKLMNPQRSTUVWXZ0123456789'

/** Une chaîne de bruit de la même longueur, pour que la mise en page ne bouge pas. */
export function scramble(source: string, seed: number): string {
  let out = ''
  for (let i = 0; i < source.length; i++) {
    // Les espaces restent des espaces : sinon deux noms n'en font plus qu'un.
    if (source[i] === ' ') { out += ' '; continue }
    out += NOISE[(seed * 31 + i * 17 + source.charCodeAt(i)) % NOISE.length]
  }
  return out
}
