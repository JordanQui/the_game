/**
 * Met en gras, dans le texte narré, ce qui vient des données du joueur.
 *
 * Le lieu, les personnages, l'objet-clé, l'artefact : ce sont les noms que le
 * joueur doit pouvoir retenir et retaper. Dans un jeu à parser, un nom qu'on ne
 * distingue pas du décor est un nom qu'on ne pense pas à employer.
 *
 * Le texte vient d'un modèle : il est échappé AVANT toute mise en forme, et
 * seules les balises produites ici sont réinjectées. Rien de ce que le modèle
 * écrit ne peut devenir du HTML.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, ch => HTML_ESCAPES[ch] ?? ch)
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Prépare la liste des noms à distinguer.
 *
 * Les plus longs d'abord : sans ça « Le Comptoir » masquerait
 * « Le Comptoir des Marées », dont il est un préfixe.
 */
const LEADING_ARTICLE = /^(l['’]|le |la |les |un |une |du |des |de la |de l['’])/i

export function collectNames(sources: Array<string | undefined | null>): string[] {
  const seen = new Set<string>()
  const names: string[] = []

  const add = (value: string) => {
    const name = value.trim()
    // En dessous de trois lettres, on attraperait des articles.
    if (name.length < 3) return
    const lower = name.toLowerCase()
    if (seen.has(lower)) return
    seen.add(lower)
    names.push(name)
  }

  for (const raw of sources) {
    const name = raw?.trim()
    if (!name) continue
    add(name)

    // Le modèle nomme le lieu « Le Comptoir des Marées » mais écrit ensuite
    // « au Comptoir des Marées » : sans la variante sans article, le nom le
    // plus important de la scène ne serait jamais mis en gras.
    const bare = name.replace(LEADING_ARTICLE, '')
    if (bare !== name) add(bare)
  }

  return names.sort((a, b) => b.length - a.length)
}

/** Échappe le texte, puis entoure chaque nom connu d'une balise `<strong>`. */
export function highlightNames(text: string, names: string[]): string {
  const safe = escapeHtml(text)
  if (!names.length) return safe

  // Une seule passe, alternance de toutes les variantes : deux passes
  // successives remettraient en gras l'intérieur des balises déjà posées.
  const pattern = new RegExp(`(${names.map(n => escapeRegex(escapeHtml(n))).join('|')})`, 'gi')
  return safe.replace(pattern, '<strong class="text-neon-300 font-semibold">$1</strong>')
}
