/**
 * La visée au gyroscope, réduite à des fonctions pures.
 *
 * Isolée du composable pour être vérifiable : cette géométrie est la source des
 * sauts qu'on a longtemps mis sur le compte du lissage ou du capteur, et elle
 * se prouve à froid, sans appareil.
 */

export type Up = [number, number, number]

/**
 * La verticale, exprimée dans le repère de l'appareil.
 *
 * On ne compare pas des angles d'Euler bruts : ils sont DISCONTINUS. Quand le
 * tangage traverse 90° — le téléphone tenu droit devant soi, c'est-à-dire la
 * posture assise — la spécification bascule gamma de +g à -g et bêta de 180-b
 * pour décrire la MÊME orientation. La différence d'angles faisait alors sauter
 * l'oeil de près d'un quart d'écran d'un coup.
 *
 * Ce vecteur est la troisième ligne de Rx(bêta)·Ry(gamma). Il ne dépend pas
 * d'alpha — donc ni de la boussole ni de sa dérive, seconde source de sauts —
 * et il est continu partout, y compris à la singularité.
 */
export function upVector(beta: number, gamma: number): Up {
  const b = (beta * Math.PI) / 180
  const g = (gamma * Math.PI) / 180
  return [-Math.cos(b) * Math.sin(g), Math.sin(b), Math.cos(b) * Math.cos(g)]
}

/**
 * Plancher de la compensation d'assiette.
 *
 * La gravité vue par l'appareil se déplace en cos(bêta) pour un même geste, sur
 * les DEUX axes : à plat, incliner de 11° déplace l'oeil d'un quart d'écran ;
 * tenu droit, de quelques millièmes. C'est ce qui faisait que les postures ne
 * répondaient pas pareil, et que l'axe vertical devenait quasi mort en position
 * assise. On rattrape ce facteur d'après l'inclinaison de calibrage — mais pas
 * au-delà, sinon on amplifierait surtout le bruit du capteur. Un téléphone tenu
 * parfaitement vertical reste un cas dégénéré : la gravité n'y répond presque
 * plus, aucun calcul ne peut inventer le signal manquant.
 */
const TILT_FLOOR = 0.35

export interface Neutral {
  up: Up
  /**
   * Rattrapage de sensibilité, selon l'inclinaison de départ. Il vaut pour les
   * deux axes : c'est la même géométrie qui les affaiblit.
   */
  tiltGain: number
}

/** L'origine, moyennée sur une série de mesures plutôt que sur une seule. */
export function calibrationFrom(samples: Up[]): Neutral | null {
  if (!samples.length) return null
  const n = samples.length
  const up: Up = [
    samples.reduce((a, v) => a + v[0], 0) / n,
    samples.reduce((a, v) => a + v[1], 0) / n,
    samples.reduce((a, v) => a + v[2], 0) / n,
  ]
  // cos(bêta) au repos = la part de la gravité restée dans le plan de l'écran,
  // soit la longueur de la projection sur (x, z).
  const cosBeta = Math.hypot(up[0], up[2])
  return { up, tiltGain: 1 / Math.max(cosBeta, TILT_FLOOR) }
}

/**
 * Où viser, en fraction d'écran.
 *
 * Rouler vers la droite fait pencher la gravité vers la gauche dans le repère
 * de l'appareil, d'où l'inversion sur x. Relever l'appareil vers soi augmente
 * y, et l'oeil descend dans le texte — le geste naturel pour parcourir une page.
 */
export function aimFrom(
  up: Up,
  neutral: Neutral,
  rangeDeg: number,
  neutralY: number,
): { x: number; y: number } {
  const span = Math.sin((rangeDeg * Math.PI) / 180)
  const g = neutral.tiltGain
  const dx = -((up[0] - neutral.up[0]) * g) / span
  const dy = ((up[1] - neutral.up[1]) * g) / span
  return {
    x: Math.min(1, Math.max(0, 0.5 + dx / 2)),
    y: Math.min(1, Math.max(0, neutralY + dy / 2)),
  }
}
