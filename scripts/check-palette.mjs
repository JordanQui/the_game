/**
 * Vérifie que la racine CSS et la palette déclarée disent la même chose.
 *
 * `main.css` porte les couleurs du premier rendu, avant que JavaScript ne
 * reprenne la main ; `script.json` porte la palette déclarée de l'auberge.
 * Les deux doivent coïncider, sinon l'interface change de teinte au moment de
 * l'hydratation — un clignotement qu'on ne verrait qu'en production.
 *
 * Aucun appel réseau, aucune dépendance : `node scripts/check-palette.mjs`.
 */
import { readFileSync } from 'node:fs'

const REFERENCE = {
  ink: { 50: '#f3f5f9', 100: '#dce1ea', 200: '#b5bccb', 300: '#8791a8', 400: '#55617c',
         500: '#333f58', 600: '#212b3f', 700: '#161d2c', 800: '#0e131e', 900: '#080b12' },
  steel: { 400: '#6b7794', 500: '#46536e', 600: '#333d53', 700: '#232b3d' },
  neon: { 200: '#ffd9ec', 300: '#ff7ab5', 400: '#ff4f9b', 500: '#ff2e88', 600: '#e01470', 700: '#a50e52' },
}
const ANCHOR = { ink: 900, steel: 500, neon: 500 }
const NEUTRAL_SATURATION = 0.12
/** L'arrondi 8 bits et les allers-retours RGB/HSL laissent une unité de jeu. */
const TOLERANCE = 1

const hexToRgb = h => {
  const c = h.replace('#', '')
  return { r: parseInt(c.slice(0, 2), 16), g: parseInt(c.slice(2, 4), 16), b: parseInt(c.slice(4, 6), 16) }
}
function rgbToHsl({ r, g, b }) {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === R ? ((G - B) / d + (G < B ? 6 : 0)) / 6
    : max === G ? ((B - R) / d + 2) / 6
    : ((R - G) / d + 4) / 6
  return { h, s, l }
}
function hslToRgb({ h, s, l }) {
  if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v } }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q
  const f = t => {
    t = (t + 1) % 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return { r: Math.round(f(h + 1 / 3) * 255), g: Math.round(f(h) * 255), b: Math.round(f(h - 1 / 3) * 255) }
}
function rampFrom(sourceHex, name) {
  const ramp = REFERENCE[name]
  const source = rgbToHsl(hexToRgb(sourceHex))
  const anchor = rgbToHsl(hexToRgb(ramp[ANCHOR[name]]))
  const out = {}
  for (const [shade, hex] of Object.entries(ramp)) {
    const ref = rgbToHsl(hexToRgb(hex))
    const h = source.s < NEUTRAL_SATURATION ? ref.h : (source.h + (ref.h - anchor.h) + 1) % 1
    const { r, g, b } = hslToRgb({ h, s: ref.s, l: ref.l })
    out[shade] = [r, g, b]
  }
  return out
}

const script = JSON.parse(readFileSync(new URL('../game/script.json', import.meta.url), 'utf-8'))
const palette = script.defaults.interface_palette.palette
const css = readFileSync(new URL('../assets/css/main.css', import.meta.url), 'utf-8')

const expected = {}
for (const [name, hex] of [['ink', palette.dominant.hex], ['steel', palette.secondary.hex], ['neon', palette.accent.hex]]) {
  for (const [shade, rgb] of Object.entries(rampFrom(hex, name))) expected[`--${name}-${shade}`] = rgb
}

let worst = 0
const drift = []
for (const [name, rgb] of Object.entries(expected)) {
  const found = css.match(new RegExp(`${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`))
  if (!found) { drift.push(`${name} absente de main.css`); continue }
  const got = [Number(found[1]), Number(found[2]), Number(found[3])]
  const delta = Math.max(...rgb.map((v, i) => Math.abs(v - got[i])))
  worst = Math.max(worst, delta)
  if (delta > TOLERANCE) drift.push(`${name} : CSS ${got.join(' ')} vs déclaré ${rgb.join(' ')} (écart ${delta})`)
}

if (drift.length) {
  console.error('Racine CSS et palette déclarée divergent :')
  for (const d of drift) console.error('  ' + d)
  process.exit(1)
}
console.log(`Racine CSS et palette déclarée concordent (${Object.keys(expected).length} nuances, écart max ${worst}/255).`)
