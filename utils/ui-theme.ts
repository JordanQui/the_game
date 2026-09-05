import { hexToRgb, rgbToHsl, hslToRgb } from '~/utils/palette'

/**
 * La couleur de l'interface, accordée à celle de la scène.
 *
 * L'interface et l'illustration doivent tenir ensemble : une salle baignée de
 * vert sodium sous un habillage magenta, ce sont deux images côte à côte, pas
 * un lieu. Chaque scène demandant sa propre palette au prompt image, c'est
 * elle qui doit teindre l'habillage.
 *
 * LA CORRESPONDANCE SUIT LES TROIS BANDES DU 70:20:10, pas les noms :
 * - `palette.dominant`, l'ombre de l'image, donne le fond      -> `ink`
 * - `palette.secondary`, la lumière indirecte, donne les bords -> `steel`
 * - `palette.accent`, le néon, donne la couleur vive           -> `neon`
 *
 * Brancher l'habillage vif sur `dominant` aurait été littéral et illisible :
 * la dominante est bornée entre 8 et 24 % de luminosité, c'est un noir teinté.
 * Le rose qu'on voit aujourd'hui est l'accent, pas la dominante.
 */

/**
 * Les rampes d'origine, telles qu'elles sont dans le thème.
 *
 * Elles restent la référence de FORME : seule la teinte est transplantée. On
 * garde donc, pour chaque nuance, la saturation et la luminosité d'origine —
 * et avec elles tous les rapports de contraste de l'interface, vérifiés une
 * fois pour toutes. Une scène ne peut pas produire un habillage illisible.
 */
export const REFERENCE = {
  ink: {
    50: '#f3f5f9', 100: '#dce1ea', 200: '#b5bccb', 300: '#8791a8', 400: '#55617c',
    500: '#333f58', 600: '#212b3f', 700: '#161d2c', 800: '#0e131e', 900: '#080b12',
  },
  steel: { 400: '#6b7794', 500: '#46536e', 600: '#333d53', 700: '#232b3d' },
  neon: {
    200: '#ffd9ec', 300: '#ff7ab5', 400: '#ff4f9b',
    500: '#ff2e88', 600: '#e01470', 700: '#a50e52',
  },
} as const

export type RampName = keyof typeof REFERENCE

/**
 * La nuance qui porte la teinte de la rampe.
 *
 * Une rampe n'a pas UNE teinte : le néon se réchauffe en s'éclaircissant, et
 * c'est voulu. On transplante donc l'ÉCART de chaque nuance à son ancre, pas
 * une teinte absolue — sans quoi la dérive interne serait écrasée et la rampe
 * d'origine ne se reproduirait plus exactement à partir de sa propre couleur.
 */
const ANCHOR: Record<RampName, number> = { ink: 900, steel: 500, neon: 500 }

/** En dessous, la couleur est un gris : sa teinte ne veut rien dire. */
const NEUTRAL_SATURATION = 0.12

/**
 * Transplante la teinte d'une couleur sur une rampe de référence.
 *
 * Rien d'autre ne bouge. Recalculer aussi la saturation donnerait des néons
 * ternes quand le modèle renvoie une couleur sourde, et des fonds criards
 * quand il en renvoie une vive — dans les deux cas un habillage qu'on ne peut
 * plus relire avant qu'il ne s'affiche chez le joueur.
 */
export function rampFrom(sourceHex: string, name: RampName): Record<string, string> {
  const ramp: Record<string, string> = REFERENCE[name]
  const source = rgbToHsl(hexToRgb(sourceHex))
  const anchor = rgbToHsl(hexToRgb(ramp[ANCHOR[name]]))
  const out: Record<string, string> = {}

  for (const [shade, hex] of Object.entries(ramp)) {
    const ref = rgbToHsl(hexToRgb(hex))
    // Une source grise n'a pas de teinte à donner : on garde celle d'origine.
    const h = source.s < NEUTRAL_SATURATION
      ? ref.h
      : (source.h + (ref.h - anchor.h) + 1) % 1
    const { r, g, b } = hslToRgb({ h, s: ref.s, l: ref.l })
    out[shade] = `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`
  }
  return out
}

/** Les trois couleurs dont une palette a besoin pour teindre l'interface. */
export interface InterfaceSource {
  dominant: { hex: string }
  secondary: { hex: string }
  accent: { hex: string }
}

/**
 * Les variables CSS à poser sur la racine, pour une palette donnée.
 *
 * Le rose des premiers écrans n'est pas un cas particulier : il sort d'ici
 * comme les autres, depuis l'`accent` de la palette déclarée pour l'auberge.
 * Changer cet accent dans `script.json` repeint tout, accueil compris.
 */
export function interfaceVariables(palette: InterfaceSource): Record<string, string> {
  const vars: Record<string, string> = {}
  const pairs: Array<[RampName, string]> = [
    ['ink', palette.dominant.hex],
    ['steel', palette.secondary.hex],
    ['neon', palette.accent.hex],
  ]

  for (const [name, hex] of pairs) {
    for (const [shade, value] of Object.entries(rampFrom(hex, name))) {
      vars[`--${name}-${shade}`] = value
    }
  }
  return vars
}
