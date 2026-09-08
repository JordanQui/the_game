import { useGameStore } from '~/stores/game'
import { primeContext, unlockAudio } from '~/composables/useNameChime'
import { upVector, aimFrom } from '~/utils/gyro-aim'

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
 * EN HAUT, pas au centre : téléphone posé à plat, l'oeil se range tout en haut
 * de l'écran, et l'intégralité du débattement sert à le faire descendre dans le
 * texte. Ce n'est pas zéro tout rond parce que le réticule est centré sur sa
 * position : à 0 il serait coupé en deux par le bord. Mettre 0 pour l'y coller
 * franchement.
 */
const NEUTRAL_Y = 0.05

/**
 * L'attitude de repos de chaque posture, en degrés de tangage. C'EST L'ORIGINE.
 *
 * Elle est DÉCLARÉE, pas mesurée. Le calibrage qu'elle remplace prenait pour
 * zéro l'attitude de la main à l'instant du tap : deux activations de suite ne
 * donnaient pas la même visée, et le joueur n'avait aucun moyen de savoir
 * laquelle il venait d'obtenir.
 *
 * Assis, le repos est le téléphone POSÉ À PLAT, écran vers le ciel : 0°.
 * Allongé, c'est la même chose vue de l'autre côté — tenu à plat au-dessus du
 * visage, écran vers le bas : 180°.
 *
 * CES DEUX NOMBRES SONT DE LA GÉOMÉTRIE, pas un réglage. Ce qui fixe la hauteur
 * de l'oeil, c'est sin(bêta) : il vaut zéro à 0° comme à 180°, donc les deux
 * postures se reposent au même endroit — en haut — et le même geste fait
 * descendre l'oeil dans les deux. Ce sont aussi les deux seules attitudes où la
 * gravité se lit à plein (|cos bêta| = 1), ce qui rend inutile toute
 * compensation d'assiette. Le sens de l'inclinaison, lui, est porté par le
 * vecteur vertical, qui n'a pas besoin qu'on lui dise de quel côté on est.
 *
 * L'écart entre ce modèle et un vrai corps allongé — la tête sur un oreiller,
 * le poignet qui casse — ne se rattrape PAS ici : il se mesure en pixels, dans
 * `POSTURE_LIFT_PX`. Toucher à ces angles-là déplacerait aussi le sens du
 * geste ; la remontée, elle, ne déplace que l'origine.
 */
const REST_BETA_DEG: Record<string, number> = {
  assis: 0,
  allonge: 180,
}

/**
 * Ce que la posture remonte l'oeil, en pixels d'écran.
 *
 * Mesuré sur l'appareil, et c'est la bonne façon de le régler : la géométrie
 * donne le SENS de l'inclinaison et la forme du débattement, elle ne peut pas
 * deviner l'attitude réelle d'un bras replié au-dessus d'un visage. Allongé, le
 * repos n'est pas le téléphone strictement retourné à 180° — la tête est sur un
 * oreiller, le poignet casse un peu — et l'oeil se posait 400 px trop bas.
 *
 * Retranché après la géométrie, donc constant : la remontée ne mange pas de
 * débattement vers le bas, elle déplace l'origine. Une remontée de 400 px
 * revient à une quinzaine de degrés de tangage sur un écran de téléphone —
 * l'autre écriture du même réglage serait de baisser `REST_BETA_DEG.allonge`
 * d'autant, mais elle se règle moins bien : personne ne voit des degrés, tout
 * le monde voit un oeil trop bas.
 */
const POSTURE_LIFT_PX: Record<string, number> = {
  assis: 0,
  allonge: 400,
}

/**
 * Ce que la posture change d'autre : l'amplitude disponible.
 *
 * Allongé, le bras porte l'appareil au-dessus du visage et ne peut plus
 * l'incliner beaucoup : il faut donc que moins de degrés suffisent à traverser
 * l'écran. C'est de l'ergonomie, pas de la géométrie.
 */
const POSTURE_RANGE_SCALE: Record<string, number> = {
  assis: 1,
  allonge: 0.7,
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
   * Chaque mesure se lit seule.
   *
   * Rien à retenir d'une frame sur l'autre — ni origine échantillonnée, ni
   * mesure précédente pour rattraper un saut. L'origine est déclarée
   * (`REST_BETA_DEG`) et le vecteur vertical est continu partout, y compris à
   * la singularité de 90° qui faisait sauter l'oeil d'un quart d'écran quand on
   * comparait des angles bruts.
   */
  function onOrientation(event: DeviceOrientationEvent) {
    const { beta, gamma } = event
    if (beta === null || gamma === null) return

    const posture = gameStore.posture
    // En fraction d'écran, et relue à chaque mesure : la hauteur change avec la
    // rotation de l'appareil et avec le clavier, et `hitTest` vise en pixels de
    // ce même `innerHeight` — les deux doivent parler de la même page.
    const lift = (POSTURE_LIFT_PX[posture] ?? 0) / window.innerHeight
    target = aimFrom(
      upVector(beta, gamma),
      REST_BETA_DEG[posture] ?? 0,
      RANGE_DEG * (POSTURE_RANGE_SCALE[posture] ?? 1),
      NEUTRAL_Y,
      lift,
    )
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
    // Filet : la veille ne survit pas à une minute. Si un `blur` se perd —
    // clavier refermé par le système, champ démonté — l'oeil se rendort pour
    // toujours, et c'est indistinguable d'une panne de son.
    if (gameStore.typing && Date.now() - gameStore.typingSince > 60_000) {
      gameStore.setTyping(false)
    }
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

  async function enable(): Promise<boolean> {
    // Ce clic est le geste dont le contexte audio a besoin : on le saisit ici
    // plutôt que d'espérer qu'un survol suffise plus tard. L'ouverture est
    // SYNCHRONE — attendre le chargement de Tone consommerait le geste.
    primeContext()
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

  // La posture est relue à chaque mesure : en changer prend effet à la frame
  // suivante, sans rien à réarmer.

  onUnmounted(disable)

  return { supported, needsEye, enabled, denied, enable, disable }
}
