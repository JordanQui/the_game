import { useGameStore } from '~/stores/game'
import { unlockAudio } from '~/composables/useNameChime'

/**
 * L'oeil qu'on déplace en inclinant le téléphone.
 *
 * Sur desktop, la souris est déjà un instrument de visée : le survol suffit et
 * il n'y a rien à activer. Sur tactile, il n'existe pas de curseur — d'où cet
 * oeil piloté au gyroscope, qu'on promène au-dessus du texte en inclinant
 * l'appareil. C'est la même geste dans les deux cas : viser, puis lire.
 *
 * iOS exige une permission explicite, demandée sur un geste utilisateur.
 */

/**
 * Roulis, axe horizontal.
 *
 * Référence ABSOLUE : à plat comme en main, un téléphone tenu droit a un
 * roulis nul. Zéro degré doit donc placer l'oeil au centre, sans calibrage.
 * Le calibrage relatif d'avant prenait la toute première mesure comme origine,
 * si bien qu'une inclinaison au moment du tap envoyait l'oeil dans un coin.
 */
const ROLL_RANGE_DEG = 28

/**
 * Tangage, axe vertical.
 *
 * Relatif, lui : on lit un téléphone à plat sur une table comme incliné à
 * quarante-cinq degrés dans la main. Il n'existe pas de tangage neutre
 * universel, seule la posture de départ fait référence.
 */
const PITCH_RANGE_DEG = 26

/**
 * Hauteur de l'oeil au repos, en fraction d'écran.
 *
 * Aux trois quarts de la hauteur en partant du bas, soit un quart depuis le
 * haut. On lit un téléphone à plat ou presque allongé : c'est cette posture-là
 * qui doit correspondre au repos. L'oeil descend ensuite dans le texte quand on
 * relève l'appareil vers soi — le geste naturel pour parcourir une page.
 */
const NEUTRAL_Y = 0.25
/** Lissage : le gyroscope est bruité, un oeil qui tremble est illisible. */
const SMOOTHING = 0.18

type OrientationEventCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

export function useGyroEye() {
  const gameStore = useGameStore()

  const supported = computed(() =>
    import.meta.client && typeof window.DeviceOrientationEvent !== 'undefined')

  /** Vrai sur un appareil sans survol : c'est là que l'oeil sert. */
  const needsEye = computed(() =>
    import.meta.client && !window.matchMedia('(hover: hover) and (pointer: fine)').matches)

  const enabled = ref(false)
  const denied = ref(false)

  let raf: number | null = null
  let target = { x: 0.5, y: NEUTRAL_Y }
  let neutralBeta: number | null = null
  let settleAt = 0

  function onOrientation(event: DeviceOrientationEvent) {
    const { beta, gamma } = event
    if (beta === null || gamma === null) return

    // On laisse l'appareil se stabiliser avant de figer l'origine du tangage :
    // les toutes premières mesures arrivent pendant que la main bouge encore.
    if (neutralBeta === null) {
      if (Date.now() < settleAt) return
      neutralBeta = beta
    }

    const dx = gamma / ROLL_RANGE_DEG
    const dy = (beta - neutralBeta) / PITCH_RANGE_DEG
    target = {
      x: Math.min(1, Math.max(0, 0.5 + dx / 2)),
      y: Math.min(1, Math.max(0, NEUTRAL_Y + dy / 2)),
    }
  }

  /** Le nom sous l'oeil, s'il y en a un. */
  function hitTest(x: number, y: number): { name: string; archetype: string } | null {
    const nodes = document.querySelectorAll<HTMLElement>('[data-glitch-name]')
    for (const node of nodes) {
      const r = node.getBoundingClientRect()
      if (r.width === 0) continue
      // Marge verticale : viser une ligne de texte au gyroscope est difficile.
      if (x >= r.left && x <= r.right && y >= r.top - 10 && y <= r.bottom + 10) {
        return { name: node.dataset.glitchName ?? '', archetype: node.dataset.archetype ?? '' }
      }
    }
    return null
  }

  function loop() {
    const pos = gameStore.eyePos
    const next = {
      x: pos.x + (target.x - pos.x) * SMOOTHING,
      y: pos.y + (target.y - pos.y) * SMOOTHING,
    }
    gameStore.setEyePos(next)

    const hit = hitTest(next.x * window.innerWidth, next.y * window.innerHeight)
    if (hit?.name !== gameStore.revealing) gameStore.setRevealing(hit?.name ?? null)

    raf = requestAnimationFrame(loop)
  }

  async function enable(): Promise<boolean> {
    // Ce clic est le geste dont le contexte audio a besoin : on le saisit ici
    // plutôt que d'espérer qu'un survol suffise plus tard.
    void unlockAudio()

    if (!supported.value) return false

    const ctor = window.DeviceOrientationEvent as OrientationEventCtor
    if (typeof ctor.requestPermission === 'function') {
      try {
        if ((await ctor.requestPermission()) !== 'granted') {
          denied.value = true
          return false
        }
      } catch {
        denied.value = true
        return false
      }
    }

    neutralBeta = null
    settleAt = Date.now() + 400
    window.addEventListener('deviceorientation', onOrientation, true)
    enabled.value = true
    gameStore.setEyeActive(true)
    raf = requestAnimationFrame(loop)
    return true
  }

  function disable() {
    if (import.meta.client) window.removeEventListener('deviceorientation', onOrientation, true)
    if (raf) { cancelAnimationFrame(raf); raf = null }
    enabled.value = false
    gameStore.setEyeActive(false)
    gameStore.setRevealing(null)
  }

  onUnmounted(disable)

  return { supported, needsEye, enabled, denied, enable, disable }
}
