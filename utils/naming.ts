/**
 * La Majuscule de Titre, rendue vraie.
 *
 * C'est le SEUL signal d'interaction du jeu : ce qui porte une majuscule se
 * touche, le reste est du décor. La règle est écrite en toutes lettres dans
 * `narrative.naming_style`, avec son exemple d'échec — et le modèle l'ignore
 * quand même. Il capitalise correctement la liste `interactables` puis écrit
 * « un tourniquet de contrôle » trois phrases plus haut : le joueur voit passer
 * l'objet sans savoir qu'il peut le manipuler.
 *
 * On ne le lui redemande donc plus. Les noms sont déjà déclarés dans la scène
 * générée : il suffit de les faire respecter dans le texte. Déterministe,
 * exécuté une fois à l'assemblage, et sans un token de plus — c'est le même
 * parti que la correction d'accent de `enforceAccentVisibility`.
 */

/**
 * En dessous, un nom est trop court pour être reconnu sans risque.
 * Trois lettres laissent passer « Sas », qui est une vraie sortie.
 */
const MIN_LENGTH = 3

/** L'article que traîne un nom déclaré. On le laisse en minuscules dans le texte. */
const LEADING_ARTICLE = /^(?:[ld]['’]\s*|(?:le|la|les|un|une|des|du|de|au|aux)\s+)/i

/** Voyelles et leurs variantes : le modèle accentue de façon inconstante. */
const ACCENTED: Record<string, string> = {
  a: 'aàáâäã', c: 'cç', e: 'eéèêë', i: 'iíìîï',
  n: 'nñ', o: 'oóòôöõ', u: 'uúùûü', y: 'yÿ',
}

/**
 * Le texte sans accents ni casse.
 *
 * Sert à comparer ce que le modèle a écrit à ce qu'il a déclaré : il accentue
 * de façon inconstante d'une phrase à l'autre.
 */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/** Le caractère dépouillé de son accent. */
function base(ch: string): string {
  return ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Le nom sans son article : « le Tourniquet » se cherche par « Tourniquet ». */
function stripArticle(name: string): string {
  return name.trim().replace(LEADING_ARTICLE, '').trim()
}

/**
 * Le motif qui retrouve un nom quelle que soit sa casse et son accentuation.
 *
 * Les espaces sont souples — le modèle en met parfois deux — et les bornes sont
 * des lettres, pas `\b` : celui-ci raisonne en ASCII et coupe « Contrôle » au
 * milieu.
 */
function pattern(name: string): RegExp {
  const body = name
    .split(/\s+/)
    .map(word => [...word].map((ch) => {
      if (ch === "'" || ch === '’') return "['’]"
      const set = ACCENTED[base(ch).toLowerCase()]
      return set ? `[${set}]` : escapeRe(ch)
    }).join(''))
    .join('\\s+')

  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'giu')
}

export interface NamingAudit {
  /** Le texte, noms recapitalisés. */
  text: string
  /** Les corrections effectuées, sous la forme « trouvé -> imposé ». */
  fixed: string[]
  /** Noms déclarés que le texte ne prononce jamais : le joueur ne les verra pas. */
  missing: string[]
}

/**
 * Impose à `text` la casse canonique de chaque nom déclaré.
 *
 * Les noms les plus longs passent d'abord : sans ça « Carte d'Accès » corrigée
 * la première laisserait « Ambre » en minuscules dans « Carte d'Accès Ambre ».
 */
export function enforceNameCaps(text: string, names: string[]): NamingAudit {
  const fixed: string[] = []
  const missing: string[] = []

  const canonical = [...new Set(names.map(stripArticle))]
    .filter(n => n.length >= MIN_LENGTH)
    .sort((a, b) => b.length - a.length)

  let out = text
  for (const name of canonical) {
    let seen = false
    out = out.replace(pattern(name), (match) => {
      seen = true
      if (match !== name) fixed.push(`${match} -> ${name}`)
      return name
    })
    if (!seen) missing.push(name)
  }

  return { text: out, fixed, missing }
}
