/**
 * Comparaison de commandes joueur. Partagé client/serveur : aucune dépendance
 * Node, pour rester importable dans les composables.
 */

/** Minuscules, sans accents, apostrophes normalisées. */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Vrai si l'un des mots-clés apparaît comme mot entier.
 * `includes` brut faisait matcher « pars » dans « parsemé » et ratait
 * « Sortir ! » à cause de la ponctuation.
 */
export function matchesKeyword(input: string, keywords: string[]): boolean {
  const haystack = ` ${normalize(input)} `
  return keywords.some((keyword) => {
    const needle = normalize(keyword)
    if (!needle) return false
    return haystack.includes(` ${needle} `)
      || haystack.includes(` ${needle},`)
      || haystack.includes(` ${needle}.`)
      || haystack.includes(` ${needle}!`)
      || haystack.includes(` ${needle}?`)
  })
}
