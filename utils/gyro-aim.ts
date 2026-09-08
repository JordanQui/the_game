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
 * tangage traverse 90° — le téléphone tenu droit devant soi — la spécification
 * bascule gamma de +g à -g et bêta de 180-b pour décrire la MÊME orientation.
 * La différence d'angles faisait alors sauter l'oeil de près d'un quart
 * d'écran d'un coup.
 *
 * Ce vecteur est la troisième ligne de Rx(bêta)·Ry(gamma). Il ne dépend pas
 * d'alpha — donc ni de la boussole ni de sa dérive, seconde source de sauts —
 * et il est continu partout, y compris à la singularité. C'est ce qui permet
 * aux deux postures de se décrire dans le même repère alors que l'une lit
 * l'écran par-dessus et l'autre par-dessous.
 */
export function upVector(beta: number, gamma: number): Up {
  const b = (beta * Math.PI) / 180
  const g = (gamma * Math.PI) / 180
  return [-Math.cos(b) * Math.sin(g), Math.sin(b), Math.cos(b) * Math.cos(g)]
}

function clamp(v: number): number {
  return Math.min(1, Math.max(0, v))
}

/**
 * Où viser, en fraction d'écran.
 *
 * LE ZÉRO EST ABSOLU : il ne se mesure pas au moment où le joueur appuie, il
 * est déclaré. `restBeta` est le tangage de la posture au repos — 0° pour un
 * téléphone posé à plat —, et c'est lui, et lui seul, qui décide de l'origine.
 * Le calibrage par échantillonnage qu'il remplace prenait pour zéro l'attitude
 * de la main à l'instant du tap : deux activations de suite ne donnaient pas la
 * même visée, et rien ne permettait au joueur de savoir laquelle il avait.
 *
 * La bille roule vers le bas de la pente : c'est le modèle, et il vaut dans les
 * deux postures sans changer un signe. Relever le bord opposé fait descendre
 * l'oeil dans le texte — le geste naturel pour parcourir une page —, rouler
 * vers la droite l'envoie à droite.
 *
 * `neutralY` n'est pas le centre : à plat, l'oeil se range EN HAUT de l'écran,
 * et tout le débattement sert à le faire descendre.
 */
export function aimFrom(
  up: Up,
  restBeta: number,
  rangeDeg: number,
  neutralY: number,
): { x: number; y: number } {
  const span = Math.sin((rangeDeg * Math.PI) / 180)
  const rest = upVector(restBeta, 0)
  const dx = -(up[0] - rest[0]) / span
  const dy = (up[1] - rest[1]) / span
  return { x: clamp(0.5 + dx / 2), y: clamp(neutralY + dy / 2) }
}
