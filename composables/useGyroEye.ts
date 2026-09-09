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
 * Hauteur de l'oeil au repos, par posture, en fraction d'écran.
 *
 * ASSIS, l'appareil est POSÉ À PLAT et l'oeil se range tout en haut : le geste
 * naturel est de relever le bord opposé pour le faire descendre dans le texte,
 * et tout le débattement sert à ça. Ce n'est pas zéro tout rond parce que le
 * réticule est centré sur sa position : à 0 il serait coupé en deux par le bord.
 *
 * ALLONGÉ, l'appareil est TENU AU-DESSUS DE SOI, et l'oeil se range AU MILIEU.
 * Le poignet d'un bras replié va dans les deux sens mais n'a pas de quoi
 * traverser un écran entier dans un seul : partir du haut lui demandait de
 * descendre une hauteur d'écran complète, ce qu'il ne peut pas faire. Du centre,
 * il a une demi-hauteur de chaque côté — pencher le haut de l'appareil loin de
 * soi descend, le ramener vers soi remonte.
 */
const POSTURE_NEUTRAL_Y: Record<string, number> = {
  assis: 0.05,
  allonge: 0.5,
}

/**
 * L'attitude de repos de chaque posture, en degrés de tangage. C'EST L'ORIGINE.
 *
 * Elle est DÉCLARÉE, pas mesurée. Le calibrage qu'elle remplace prenait pour
 * zéro l'attitude de la main à l'instant du tap : deux activations de suite ne
 * donnaient pas la même visée, et le joueur n'avait aucun moyen de savoir
 * laquelle il venait d'obtenir.
 *
 * Assis, le repos est le téléphone POSÉ À PLAT, écran vers le ciel : 0°.
 * Allongé, c'est le téléphone TENU DEBOUT au-dessus de soi : 90°. C'est
 * l'attitude où le bras se repose vraiment, et l'oeil doit alors être au milieu
 * de l'écran — voir `POSTURE_NEUTRAL_Y`.
 *
 * LE 180° D'AVANT ÉTAIT UNE ERREUR DE MODÈLE : il décrivait l'appareil tenu à
 * plat au-dessus du visage, écran vers le bas, attitude que personne ne tient.
 * Comme la hauteur de l'oeil suit sin(bêta), la moindre inclinaison depuis 180°
 * la faisait plonger — l'oeil traversait tout l'écran en trente degrés, et il
 * fallait le remonter de 400 pixels pour qu'il soit à peu près quelque part. À
 * 90°, l'origine est là où la main se trouve, et les 400 pixels de rattrapage
 * n'ont plus lieu d'être.
 *
 * Le sens de l'inclinaison, lui, est porté par le vecteur vertical, qui n'a pas
 * besoin qu'on lui dise de quel côté on est. Et 90° est la singularité d'Euler :
 * elle ne pose aucun problème ici parce qu'on ne compare jamais des angles, mais
 * seulement des vecteurs — voir `upVector`.
 */
const REST_BETA_DEG: Record<string, number> = {
  assis: 0,
  allonge: 90,
}

/**
 * Ce que la posture change d'autre : l'amplitude disponible.
 *
 * Allongé, le bras porte l'appareil au-dessus du visage et ne peut plus
 * l'incliner beaucoup : il faut donc que moins de degrés suffisent à traverser
 * l'écran. C'est de l'ergonomie, pas de la géométrie — et la même valeur sert
 * aux deux axes, parce que la verticale se lit pareil dans les deux.
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
  let target = { x: 0.5, y: POSTURE_NEUTRAL_Y[gameStore.posture] ?? 0.05 }

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
    target = aimFrom(
      upVector(beta, gamma),
      REST_BETA_DEG[posture] ?? 0,
      RANGE_DEG * (POSTURE_RANGE_SCALE[posture] ?? 1),
      POSTURE_NEUTRAL_Y[posture] ?? 0.05,
    )
  }

  /**
   * Le rectangle RÉELLEMENT visible d'un noeud, une fois rogné par ses ancêtres.
   *
   * Le récit défile dans un conteneur : un nom remonté hors champ garde un
   * rectangle parfaitement valide, simplement situé AU-DESSUS du conteneur —
   * c'est-à-dire dans l'image. L'oeil s'y verrouillait donc sur des noms
   * invisibles, en plein décor, et comme son repos est en haut de l'écran, ça
   * arrivait en permanence. Le navigateur ne fait pas cette erreur au survol :
   * il ne livre un événement que sur ce qu'il a dessiné. On refait ici le même
   * calcul, en intersectant avec tout ancêtre qui rogne.
   */
  function visibleRect(node: HTMLElement) {
    const r = node.getBoundingClientRect()
    let { top, bottom, left, right } = r

    for (let el = node.parentElement; el; el = el.parentElement) {
      const style = getComputedStyle(el)
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue

      const box = el.getBoundingClientRect()
      if (style.overflowY !== 'visible') {
        top = Math.max(top, box.top)
        bottom = Math.min(bottom, box.bottom)
      }
      if (style.overflowX !== 'visible') {
        left = Math.max(left, box.left)
        right = Math.min(right, box.right)
      }
    }

    // Et l'écran lui-même : ce qui en dépasse n'est pas visé non plus.
    top = Math.max(top, 0)
    left = Math.max(left, 0)
    bottom = Math.min(bottom, window.innerHeight)
    right = Math.min(right, window.innerWidth)

    if (right <= left || bottom <= top) return null
    return { top, bottom, left, right }
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
      const r = visibleRect(node)
      if (!r) continue
      // Marge verticale : viser une ligne de texte au gyroscope est difficile.
      // Bornée à la moitié de ce qui reste visible, sinon on rouvrirait le
      // problème en petit — une ligne à demi rognée par le bord du conteneur
      // redeviendrait visable quelques pixels au-dessus, dans l'image.
      const margin = Math.min(10, (r.bottom - r.top) / 2)
      if (x >= r.left && x <= r.right && y >= r.top - margin && y <= r.bottom + margin) return node
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
