import type { ScenePalette } from '~/types/scene'

/**
 * Garde-fou colorimétrique, calé sur la direction artistique Dark Deco
 * (série animée Batman des années 90) : une nuit profonde percée par une
 * seule lumière.
 *
 * Demander « 10 % d'accent » dans un prompt ne suffit pas. Si le modèle choisit
 * trois couleurs de luminosité voisine, ou un accent désaturé, la répartition
 * existe dans l'image mais ne se lit pas. On impose donc ici une hiérarchie
 * stricte — ombre / ton moyen / lumière — de façon déterministe, sans appel API.
 */

type Rgb = { r: number; g: number; b: number }
type Hsl = { h: number; s: number; l: number }

/** Dominante : l'ombre. Très sombre et sourde, proche d'un noir teinté. */
const DOMINANT_L = { min: 0.08, max: 0.24 }
const DOMINANT_MAX_SATURATION = 0.45

/** Secondaire : l'architecture en lumière indirecte. Ton moyen. */
const SECONDARY_L = { min: 0.34, max: 0.54 }
const SECONDARY_MAX_SATURATION = 0.6

/** Accent : la lumière. Vif, chromatique, jamais neutre. */
const ACCENT_L = { min: 0.52, max: 0.66 }
const ACCENT_MIN_SATURATION = 0.85

/** En dessous, la teinte d'origine est grise : elle ne porte aucun sens. */
const NEUTRAL_SATURATION = 0.18

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace('#', '')
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase()
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return { h, s, l }
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number) => {
    let tn = t
    if (tn < 0) tn += 1
    if (tn > 1) tn -= 1
    if (tn < 1 / 6) return p + (q - p) * 6 * tn
    if (tn < 1 / 2) return q
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6
    return p
  }
  return { r: channel(h + 1 / 3) * 255, g: channel(h) * 255, b: channel(h - 1 / 3) * 255 }
}

/** Luminance relative WCAG. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(hexToRgb(a))
  const lb = relativeLuminance(hexToRgb(b))
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Distance de teinte sur la roue, de 0 (identique) à 0,5 (opposée). */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 1
  return Math.min(d, 1 - d)
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

/** Ramène une couleur dans une bande de luminosité et de saturation, teinte conservée. */
function fit(hex: string, band: { min: number; max: number }, satMin: number, satMax: number): string {
  const { h, s, l } = rgbToHsl(hexToRgb(hex))
  return rgbToHex(hslToRgb({
    h,
    s: clamp(s, satMin, satMax),
    l: clamp(l, band.min, band.max),
  }))
}

/**
 * Teinte de l'accent. Conservée quand elle porte du sens — elle vient de la
 * passion du joueur. Remplacée seulement si la couleur d'origine est grise,
 * auquel cas on prend la teinte la plus éloignée des deux autres.
 */
function accentHue(original: string, dominant: string, secondary: string): number {
  const { h, s } = rgbToHsl(hexToRgb(original))
  if (s >= NEUTRAL_SATURATION) return h

  const hDom = rgbToHsl(hexToRgb(dominant)).h
  const hSec = rgbToHsl(hexToRgb(secondary)).h
  let best = 0
  let bestGap = -1
  for (let i = 0; i < 24; i++) {
    const candidate = i / 24
    const gap = Math.min(hueDistance(candidate, hDom), hueDistance(candidate, hSec))
    if (gap > bestGap) { bestGap = gap; best = candidate }
  }
  return best
}

export interface PaletteAudit {
  palette: ScenePalette
  adjusted: boolean
  original_dominant: string
  original_secondary: string
  original_accent: string
  contrast_vs_dominant: number
  contrast_vs_secondary: number
  base_contrast: number
}

/**
 * Impose la hiérarchie Dark Deco : ombre, ton moyen, lumière.
 * Les teintes du modèle sont préservées — ce sont elles qui portent le lien au
 * joueur — seules luminosité et saturation sont recalées.
 */
export function enforceAccentVisibility(palette: ScenePalette): PaletteAudit {
  const originalDominant = palette.dominant.hex
  const originalSecondary = palette.secondary.hex
  const originalAccent = palette.accent.hex

  const dominant = fit(originalDominant, DOMINANT_L, 0, DOMINANT_MAX_SATURATION)
  const secondary = fit(originalSecondary, SECONDARY_L, 0, SECONDARY_MAX_SATURATION)

  const h = accentHue(originalAccent, dominant, secondary)
  const { s, l } = rgbToHsl(hexToRgb(originalAccent))
  const accent = rgbToHex(hslToRgb({
    h,
    s: clamp(s, ACCENT_MIN_SATURATION, 1),
    l: clamp(l, ACCENT_L.min, ACCENT_L.max),
  }))

  return {
    palette: {
      dominant: { ...palette.dominant, hex: dominant },
      secondary: { ...palette.secondary, hex: secondary },
      accent: { ...palette.accent, hex: accent },
    },
    adjusted:
      dominant !== originalDominant ||
      secondary !== originalSecondary ||
      accent !== originalAccent,
    original_dominant: originalDominant,
    original_secondary: originalSecondary,
    original_accent: originalAccent,
    contrast_vs_dominant: contrastRatio(accent, dominant),
    contrast_vs_secondary: contrastRatio(accent, secondary),
    base_contrast: contrastRatio(dominant, secondary),
  }
}
