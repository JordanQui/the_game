/**
 * Souris ou gyroscope : UNE décision, lue partout.
 *
 * Elle était refaite dans quatre composants, chacun avec sa requête média, et
 * aucun ne regardait ce que l'appareil faisait vraiment. Un portable à écran
 * tactile pouvait se déclarer « sans survol » et attendre un gyroscope qu'il
 * n'a pas ; un iPad avec trackpad, l'inverse.
 *
 * Trois étages, du plus faible au plus sûr :
 *
 * 1. Le POINTEUR PRINCIPAL déclaré par le navigateur donne le point de départ.
 * 2. Ce que la main FAIT le corrige : une souris qui bouge, c'est une souris ;
 *    un doigt qui touche, c'est du tactile. Tant que l'oeil est fermé, le
 *    dernier geste l'emporte.
 * 3. Le CAPTEUR tranche au moment d'ouvrir l'oeil : un gyroscope qui se tait
 *    rend la main à la souris s'il y en a une — voir `useGyroEye`.
 *
 * Une fois l'oeil ouvert, le mode est VERROUILLÉ : un réticule qui devient
 * curseur au milieu d'une lecture, parce qu'un pouce a frôlé l'écran, serait
 * pire qu'une mauvaise détection.
 */
export type InputMode = 'mouse' | 'touch'

const mode = ref<InputMode>('mouse')
let locked = false
let watching = false

function startWatching() {
  if (watching || !import.meta.client) return
  watching = true

  mode.value = window.matchMedia('(hover: hover) and (pointer: fine)').matches ? 'mouse' : 'touch'

  window.addEventListener('pointermove', (e) => {
    if (!locked && e.pointerType === 'mouse') mode.value = 'mouse'
  }, { passive: true })
  window.addEventListener('pointerdown', (e) => {
    if (!locked && e.pointerType === 'touch') mode.value = 'touch'
  }, { passive: true })
}

/** Une souris est branchée quelque part, même si elle n'est pas le pointeur principal. */
function hasMouse() {
  return import.meta.client && window.matchMedia('(any-hover: hover) and (any-pointer: fine)').matches
}

export function useInputMode() {
  startWatching()

  return {
    mode: readonly(mode),
    usesTouch: computed(() => mode.value === 'touch'),
    hasMouse,
    /** L'oeil s'ouvre avec cette technologie : plus de bascule jusqu'à sa fermeture. */
    lock() { locked = true },
    unlock() { locked = false },
    /** Le capteur s'est tu : on impose la souris, verrou compris. */
    force(next: InputMode) { mode.value = next },
  }
}
