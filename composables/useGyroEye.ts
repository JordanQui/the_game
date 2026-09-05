import { useGameStore } from '~/stores/game'
import { unlockAudio } from '~/composables/useNameChime'
import { upVector, calibrationFrom, aimFrom, type Up, type Neutral } from '~/utils/gyro-aim'

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
 * Débattement, en degrés, pour parcourir la moitié de l'écran.
 *
 * Une seule valeur pour les deux axes : c'est ce qui donne au geste sa
 * cohérence, un même quart de tour couvrant la même distance à l'horizontale
 * et à la verticale.
 */
const RANGE_DEG = 22



/**
 * Hauteur de l'oeil au repos, en fraction d'écran.
 *
 * Aux trois quarts de la hauteur en partant du bas, soit un quart depuis le
 * haut. On lit un téléphone à plat ou presque allongé : c'est cette posture-là
 * qui doit correspondre au repos. L'oeil descend ensuite dans le texte quand on
 * relève l'appareil vers soi — le geste naturel pour parcourir une page.
 */
const NEUTRAL_Y = 0.25

/**
 * Le réglage de posture, réduit à ce qu'il doit être : un appoint.
 *
 * Il a longtemps porté des corrections qui n'étaient pas les siennes — un
 * décalage de tangage, puis un rapport d'amplitude de 0,7 posé au jugé. Or
 * l'origine est déjà annulée par le calibrage, et l'écart de sensibilité entre
 * assis et allongé est maintenant calculé à partir de l'inclinaison réelle. Il
 * ne reste qu'une nuance de confort : allongé, le bras porte l'appareil et le
 * geste est plus court.
 */
const POSTURE_RANGE_SCALE: Record<string, number> = {
  assis: 1,
  allonge: 0.85,
}
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
  /**
   * L'attitude de départ : la verticale telle que l'appareil la voyait, et le
   * rattrapage de roulis qui va avec. C'est elle qui fait le zéro.
   */
  let neutral: Neutral | null = null
  let settleAt = 0
  /**
   * Mesures accumulées pour fixer l'origine.
   *
   * Prendre UN échantillon, c'est figer le zéro sur l'instant précis où la main
   * bougeait encore après le tap. On en moyenne une demi-seconde : le calibrage
   * cesse de dépendre d'un hasard.
   */
  let samples: Up[] = []
  let calibrateUntil = 0

  function onOrientation(event: DeviceOrientationEvent) {
    const { beta, gamma } = event
    if (beta === null || gamma === null) return

    const up = upVector(beta, gamma)

    // Calibrage : on laisse d'abord l'appareil se stabiliser — les premières
    // mesures arrivent pendant que la main bouge encore après le tap — puis on
    // moyenne une demi-seconde de mesures pour fixer l'origine.
    if (neutral === null) {
      const now = Date.now()
      if (now < settleAt) return
      samples.push(up)
      if (now < calibrateUntil) return

      neutral = calibrationFrom(samples)
      samples = []
      if (!neutral) return
    }

    const range = RANGE_DEG * (POSTURE_RANGE_SCALE[gameStore.posture] ?? 1)
    target = aimFrom(up, neutral, range, NEUTRAL_Y)
  }

  /**
   * Ce qui se trouve sous l'oeil, selon l'outil en main.
   *
   * L'outil décide de ce qu'on peut lire : l'oeil lit les identités, la loupe
   * analyse les objets. C'est déjà vrai au survol sur desktop, ça doit l'être
   * ici aussi — sinon la sélection d'outil ne veut rien dire sur mobile.
   */
  function hitTest(x: number, y: number): HTMLElement | null {
    const selector = gameStore.activeTool === 'lens' ? '[data-glitch-object]' : '[data-glitch-name]'
    for (const node of document.querySelectorAll<HTMLElement>(selector)) {
      const r = node.getBoundingClientRect()
      if (r.width === 0) continue
      // Marge verticale : viser une ligne de texte au gyroscope est difficile.
      if (x >= r.left && x <= r.right && y >= r.top - 10 && y <= r.bottom + 10) return node
    }
    return null
  }

  /**
   * Temps d'immobilité avant que l'épreuve s'ouvre.
   *
   * Plus long qu'à la souris : au gyroscope, la main tremble et l'oeil traverse
   * volontiers un mot sans qu'on l'ait voulu. Un nom qui se révèle au passage
   * est sans conséquence ; une épreuve qui s'ouvre, non.
   */
  const OBJECT_DWELL_MS = 800
  let dwellOn: string | null = null
  let dwellSince = 0
  /**
   * L'épreuve a déjà été demandée pour l'objet sous l'oeil.
   *
   * Sans ce verrou, refermer l'épreuve sans la résoudre la rouvrait à la frame
   * suivante — l'oeil étant toujours sur l'objet, la condition de pause restait
   * vraie. Il faut ressortir de l'objet pour pouvoir réessayer.
   */
  let dwellSpent = false

  function loop() {
    const pos = gameStore.eyePos
    const next = {
      x: pos.x + (target.x - pos.x) * SMOOTHING,
      y: pos.y + (target.y - pos.y) * SMOOTHING,
    }
    gameStore.setEyePos(next)

    // En veille pendant la saisie : la position continue de suivre l'appareil,
    // mais rien n'est visé — ni nom révélé, ni épreuve ouverte, ni note jouée.
    if (gameStore.typing) {
      if (gameStore.revealing) gameStore.setRevealing(null)
      dwellOn = null
      dwellSpent = false
      raf = requestAnimationFrame(loop)
      return
    }

    const node = hitTest(next.x * window.innerWidth, next.y * window.innerHeight)

    if (gameStore.activeTool === 'lens') {
      // Rien ne se révèle avec la loupe : on analyse, on ne lit pas.
      if (gameStore.revealing) gameStore.setRevealing(null)

      const id = node?.dataset.glitchObject ?? null
      if (id !== dwellOn) {
        dwellOn = id
        dwellSince = Date.now()
        dwellSpent = false
      } else if (id && node && !dwellSpent && Date.now() - dwellSince >= OBJECT_DWELL_MS) {
        dwellSpent = true
        // L'objet visé, pas « un objet » : plusieurs choses se déchiffrent dans
        // une même scène, et l'épreuve est celle de celle-ci.
        gameStore.requestChallenge(id, node.dataset.glitchLabel ?? id)
      }
    } else {
      dwellOn = null
      dwellSpent = false
      const name = node?.dataset.glitchName ?? null
      if (name !== gameStore.revealing) gameStore.setRevealing(name)
    }

    raf = requestAnimationFrame(loop)
  }

  /**
   * Reprend l'inclinaison courante comme origine.
   *
   * Appelé à l'activation, et à chaque changement de posture : c'est le seul
   * moment où l'on sait que le joueur vient de se réinstaller.
   */
  function recalibrate() {
    neutral = null
    samples = []
    settleAt = Date.now() + 400
    calibrateUntil = settleAt + 500
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

    recalibrate()
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

  // Passer d'assis à allongé, c'est bouger : l'origine d'avant ne vaut plus.
  watch(() => gameStore.posture, () => { if (enabled.value) recalibrate() })

  onUnmounted(disable)

  return { supported, needsEye, enabled, denied, enable, disable }
}
