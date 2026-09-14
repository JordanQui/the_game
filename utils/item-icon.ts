/**
 * Le pictogramme d'un objet, réduit à de la géométrie.
 *
 * Les objets sont générés : aucune bibliothèque d'icônes ne peut les couvrir.
 * Le modèle écrit donc, avec l'objet, un symbole de ce qu'il signifie — et ce
 * symbole finit dans le DOM. Comme pour `sanitizeHtml`, on ne filtre pas ce
 * qui est dangereux : on RECONSTRUIT le tracé à partir de ce qui est permis.
 * Une forme connue, des attributs connus, des valeurs purement numériques ;
 * tout le reste disparaît sans laisser de trace. Rien de ce que le modèle a
 * écrit ne passe tel quel.
 *
 * Le trait, sa couleur et son épaisseur ne viennent jamais d'ici : c'est
 * `ItemIcon` qui les pose, pour que le pictogramme suive la palette de la
 * scène comme le reste de l'interface.
 */

/** La grille sur laquelle le modèle dessine. */
export const ICON_GRID = 24

/** Au-delà, ce n'est plus un pictogramme, c'est une illustration. */
const MAX_SHAPES = 8
/** Une réponse plus longue que ça n'est pas un symbole : on n'essaie même pas. */
const MAX_INPUT = 1500

const NUMBER = /^-?\d{1,3}(?:\.\d{1,3})?$/
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]{1,400}$/
const POINT_LIST = /^[0-9.,\s-]{1,240}$/

type Check = (value: string) => boolean
const isNumber: Check = v => NUMBER.test(v)
const isPath: Check = v => PATH_DATA.test(v) && /^\s*[Mm]/.test(v)
const isPoints: Check = v => POINT_LIST.test(v)

/** Chaque forme, ses attributs obligatoires, et les optionnels. */
const SHAPES: Record<string, { required: Record<string, Check>; optional?: Record<string, Check> }> = {
  path: { required: { d: isPath } },
  circle: { required: { cx: isNumber, cy: isNumber, r: isNumber } },
  ellipse: { required: { cx: isNumber, cy: isNumber, rx: isNumber, ry: isNumber } },
  line: { required: { x1: isNumber, y1: isNumber, x2: isNumber, y2: isNumber } },
  polyline: { required: { points: isPoints } },
  polygon: { required: { points: isPoints } },
  rect: { required: { x: isNumber, y: isNumber, width: isNumber, height: isNumber }, optional: { rx: isNumber } },
}

/** Un point plein se permet ; une couleur, jamais. */
const FILLS = new Set(['currentColor', 'none'])

/**
 * @returns les formes reconstruites, prêtes à entrer dans un `<svg>` de 24×24,
 * ou `undefined` si rien d'utilisable n'en sort — l'objet prend alors le
 * symbole de sa nature.
 */
export function sanitizeItemIcon(input: unknown): string | undefined {
  if (typeof input !== 'string' || !input.trim() || input.length > MAX_INPUT) return undefined

  const shapes: string[] = []
  for (const [, rawName, rawAttrs] of input.matchAll(/<\s*([a-zA-Z]+)\b([^<>]*)>/g)) {
    const spec = SHAPES[rawName!.toLowerCase()]
    if (!spec) continue

    const attrs = new Map<string, string>()
    for (const [, key, dq, sq] of rawAttrs!.matchAll(/([a-zA-Z0-9-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attrs.set(key!, (dq ?? sq ?? '').trim())
    }

    const kept: string[] = []
    let complete = true
    for (const [key, ok] of Object.entries(spec.required)) {
      const value = attrs.get(key)
      if (value === undefined || !ok(value)) { complete = false; break }
      kept.push(`${key}="${value}"`)
    }
    // Une forme à qui il manque une coordonnée ne se devine pas : on la perd.
    if (!complete) continue

    for (const [key, ok] of Object.entries(spec.optional ?? {})) {
      const value = attrs.get(key)
      if (value !== undefined && ok(value)) kept.push(`${key}="${value}"`)
    }
    const fill = attrs.get('fill')
    if (fill && FILLS.has(fill)) kept.push(`fill="${fill}"`)

    shapes.push(`<${rawName!.toLowerCase()} ${kept.join(' ')}/>`)
    if (shapes.length === MAX_SHAPES) break
  }

  return shapes.length ? shapes.join('') : undefined
}

/**
 * Le symbole de chaque nature, dessiné à la main.
 *
 * Il sert quand le modèle n'a rien rendu d'utilisable, et pour tout ce qui a
 * été ramassé avant que les objets aient un pictogramme : un inventaire
 * rechargé d'une ancienne partie ne doit pas afficher de trou.
 */
export const KIND_ICONS: Record<'key' | 'lore' | 'trade', string> = {
  // Une carte : un rectangle et sa bande.
  key: '<rect x="4" y="6" width="16" height="12" rx="1"/><path d="M4 10 H20"/><path d="M7 14.5 H11"/>',
  // Ce qui éclaire : un losange, et le point qu'il entoure.
  lore: '<path d="M3 12 L12 5 L21 12 L12 19 Z"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/>',
  // Ce qui passe de main en main : deux sens opposés.
  trade: '<path d="M5 9 H18 L15 6"/><path d="M19 15 H6 L9 18"/>',
}

/**
 * Un objet dont le nom est encore chiffré.
 *
 * Le pictogramme dit ce que l'objet SIGNIFIE : l'afficher avant l'épreuve
 * reviendrait à révéler par l'image ce que le nom cache. On ne montre que les
 * coins d'un cadre vide — il y a quelque chose, on ne sait pas quoi.
 */
export const SEALED_ICON =
  '<path d="M5 9 V5 H9"/><path d="M15 5 H19 V9"/><path d="M19 15 V19 H15"/><path d="M9 19 H5 V15"/><path d="M10 12 H14"/>'
