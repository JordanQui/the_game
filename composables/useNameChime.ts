import type { Mode } from '~/utils/modes'
import { buildPattern, type Voice } from '~/utils/voices'

/**
 * La voix d'un personnage, jouée tant qu'on lit son nom.
 *
 * Le mode donne les hauteurs, la voix donne la matière : basse synthétique,
 * sinus dégradé, drone, acide 303, stabs. Deux personnages du même mode
 * sonneront donc différemment — c'est ce qui les rend reconnaissables.
 *
 * Toujours un flux continu de doubles-croches, sans respiration. Chaque note
 * traverse un traitement différent, ce qui donne la texture d'un signal qui se
 * dégrade plutôt que d'une mélodie.
 *
 * Rien ne sonne sans un geste : pas de note au chargement de la page. Tone.js
 * est chargé à la demande, au premier survol.
 */

type ToneModule = typeof import('tone')

interface Rack {
  /**
   * Sortie du rack, juste avant le limiteur.
   *
   * Relâcher les voix ne suffit pas à faire taire un rack : le drone relâche
   * en 5,5 s et traîne 12 s de réverbération derrière lui. En passant d'un
   * personnage à l'autre, l'ancien continuait donc de sonner sous le nouveau —
   * on croyait entendre plusieurs synthés à la fois. Ce gain les coupe net.
   */
  out: InstanceType<ToneModule['Gain']>
  /** Durée d'extinction propre à cette voix, tirée de sa réverbération. */
  tail: number
  synth: { triggerAttackRelease: (...args: never[]) => unknown; releaseAll?: () => void; dispose: () => void }
  crusher: InstanceType<ToneModule['BitCrusher']>
  shaper: InstanceType<ToneModule['Chebyshev']>
  filter: InstanceType<ToneModule['Filter']>
  dispose: () => void
}

let tone: ToneModule | null = null
let started = false

/** Un rack par voix, construit à la première écoute puis réutilisé. */
const racks = new Map<string, Rack>()

let sequence: InstanceType<ToneModule['Sequence']> | null = null
let current: Rack | null = null
let playing: string | null = null

/**
 * Jeton de génération.
 *
 * `start` traverse un `await` — le chargement de Tone, puis un microtask même
 * quand il est déjà chargé. Pendant ce battement, un autre nom peut prendre la
 * main. Comparer un nom ne suffit pas : deux composants réagissent au MÊME
 * changement d'état, dans un ordre que Vue ne garantit pas, et l'arrêt de
 * l'ancien annulait le démarrage du nouveau. Le jeton tranche sans ambiguïté :
 * seul le dernier appel émis a le droit de créer une séquence.
 */
let token = 0

/**
 * Tempo posé. À 132 en doubles-croches on avait sept notes par seconde : un
 * débit de machine. Ici, deux notes par seconde et des tenues longues — on
 * cherche l'ampleur d'un CS-80 dans une grande réverbération, pas la panique.
 */
const BPM = 64

/**
 * Extinction d'un rack : la queue, et ce qui la rend tenable.
 *
 * Les réverbérations durent de 7 à 12 secondes et c'est tout l'intérêt — c'est
 * elles qui donnent l'air autour du son. Les couper en 80 ms, comme je l'avais
 * fait pour régler les synthés qui se superposaient, supprimait le problème et
 * la qualité avec.
 *
 * On garde donc la queue, mais on la RANGE : le rack qu'on quitte descend
 * d'abord vite à un niveau d'arrière-plan, ce qui laisse toute la place au
 * nouveau, puis s'éteint lentement. On entend deux choses à la fois — l'une
 * devant, l'autre qui s'éloigne — au lieu de deux synthés qui se battent.
 */
const DUCK_LEVEL = 0.3
const DUCK_S = 0.25
/** Bornes de la queue. En deçà on entend une coupure, au-delà ça traîne. */
const TAIL_MIN_S = 1.9
const TAIL_MAX_S = 3.6

/** La queue d'une voix suit sa propre réverbération : le drone respire plus long. */
function tailFor(decayReverb: number): number {
  return Math.min(TAIL_MAX_S, Math.max(TAIL_MIN_S, decayReverb * 0.3))
}

/** Réglages de synthèse propres à chaque famille de voix. */
const RECIPES = {
  drumbass: {
    volume: -12,
    oscillator: { type: 'triangle' } as const,
    envelope: { attack: 0.06, decay: 0.9, sustain: 0.45, release: 2.6 },
    filter: { frequency: 420, Q: 1.4 },
    crush: 14, shape: 2, wetDelay: 0.18, decayReverb: 7, chorus: 0.2,
  },
  sinus: {
    volume: -15,
    oscillator: { type: 'sine' } as const,
    envelope: { attack: 0.35, decay: 1.2, sustain: 0.6, release: 3.4 },
    filter: { frequency: 3200, Q: 0.9 },
    crush: 13, shape: 1, wetDelay: 0.3, decayReverb: 10, chorus: 0.35,
  },
  drone: {
    volume: -17,
    oscillator: { type: 'fatsawtooth', count: 3, spread: 26 } as const,
    envelope: { attack: 0.9, decay: 2.5, sustain: 0.9, release: 5.5 },
    filter: { frequency: 900, Q: 1.1 },
    crush: 15, shape: 1, wetDelay: 0.35, decayReverb: 12, chorus: 0.5,
  },
  acid: {
    volume: -15,
    oscillator: { type: 'sawtooth' } as const,
    envelope: { attack: 0.12, decay: 1.1, sustain: 0.35, release: 2.8 },
    filter: { frequency: 780, Q: 4.5 },
    crush: 12, shape: 2, wetDelay: 0.32, decayReverb: 9, chorus: 0.3,
  },
  stabs: {
    volume: -16,
    oscillator: { type: 'fatsquare', count: 2, spread: 16 } as const,
    envelope: { attack: 0.05, decay: 0.8, sustain: 0.28, release: 2.2 },
    filter: { frequency: 1900, Q: 1.6 },
    crush: 14, shape: 3, wetDelay: 0.26, decayReverb: 8, chorus: 0.4,
  },
} as const

/**
 * Les traitements, appliqués à tour de rôle sur les notes.
 *
 * Les valeurs sont RELATIVES au réglage de la voix : un drone reste un drone
 * même sur son pas le plus dégradé. Elles sont posées en JS plutôt
 * qu'automatisées — à cette vitesse, la rupture nette fait le grain.
 */
const TREATMENTS: Array<{ bits: number; order: number; cutoff: number; detune: number; hold: number }> = [
  { bits: 0, order: 1, cutoff: 1, detune: 0, hold: 1 },
  { bits: -1, order: 1, cutoff: 0.78, detune: -5, hold: 1.15 },
  { bits: 1, order: 2, cutoff: 1.25, detune: 0, hold: 0.9 },
  { bits: 0, order: 1, cutoff: 0.62, detune: 4, hold: 1.3 },
  { bits: -2, order: 1, cutoff: 1.05, detune: -2, hold: 1 },
  { bits: 0, order: 3, cutoff: 0.85, detune: 7, hold: 1.2 },
]

function buildRack(voice: Voice): Rack {
  const t = tone!
  const r = RECIPES[voice.key]

  const limiter = new t.Limiter(-6).toDestination()
  const out = new t.Gain(0).connect(limiter)
  const reverb = new t.Reverb({ decay: r.decayReverb, wet: 0.62 }).connect(out)
  const delay = new t.FeedbackDelay({ delayTime: '4n.', feedback: 0.42, wet: r.wetDelay }).connect(reverb)
  // Le chorus donne la largeur analogique : sans lui, les nappes restent
  // plates et l'on entend un synthé logiciel plutôt qu'un instrument.
  const chorus = new t.Chorus({ frequency: 0.4, delayTime: 6, depth: 0.7, wet: r.chorus }).connect(delay).start()
  const filter = new t.Filter({ type: 'lowpass', frequency: r.filter.frequency, Q: r.filter.Q }).connect(chorus)
  const shaper = new t.Chebyshev({ order: r.shape, wet: 0.12 }).connect(filter)
  const crusher = new t.BitCrusher({ bits: r.crush }).connect(shaper)

  const synth = new t.PolySynth(t.Synth, {
    oscillator: r.oscillator,
    envelope: r.envelope,
    volume: r.volume,
  }).connect(crusher)

  return {
    out,
    tail: tailFor(r.decayReverb),
    synth: synth as unknown as Rack['synth'],
    crusher,
    shaper,
    filter,
    dispose: () => {
      synth.dispose(); crusher.dispose(); shaper.dispose()
      filter.dispose(); chorus.dispose(); delay.dispose()
      reverb.dispose(); out.dispose(); limiter.dispose()
    },
  }
}

/**
 * Débloque le contexte audio.
 *
 * iOS n'autorise le son que si `AudioContext.resume()` est appelé PENDANT un
 * geste utilisateur — pas une frame plus tard. Or nos déclenchements viennent
 * d'un survol ou de la boucle du gyroscope, jamais du geste lui-même. D'où
 * cette fonction, appelée depuis le premier tap de la page.
 *
 * Elle est sans effet si le contexte est déjà ouvert.
 */
export async function unlockAudio(): Promise<void> {
  if (!import.meta.client || started) return
  try {
    if (!tone) tone = await import('tone')
    await tone.start()
    tone.getTransport().bpm.value = BPM
    started = true
  } catch {
    // Le prochain geste réessaiera.
  }
}

async function ensureAudio(): Promise<boolean> {
  if (!import.meta.client) return false

  if (!tone) {
    tone = await import('tone')
    tone.getTransport().bpm.value = BPM
  }

  // Un contexte audio ne démarre qu'après un geste. Le survol en est un.
  if (!started) {
    try {
      await tone.start()
      started = true
    } catch {
      return false
    }
  }

  // Un contexte débloqué peut être RESUSPENDU — passage en arrière-plan, appel
  // entrant, verrouillage de l'écran. C'est fréquent sur mobile, et sans cette
  // reprise plus une note ne sort jusqu'au rechargement de la page.
  try {
    if (tone.getContext().state !== 'running') await tone.getContext().resume()
  } catch {
    return false
  }

  return true
}

export function useNameChime() {
  /**
   * Coupe le son.
   *
   * Avec un nom, l'arrêt n'a lieu que si c'est bien ce nom qui joue : quand le
   * pointeur passe d'un personnage à l'autre, l'ancien ne doit pas faire taire
   * le nouveau qui vient de démarrer.
   */
  function stop(name?: string) {
    if (name && playing !== name) return

    token++
    sequence?.stop()
    sequence?.dispose()
    sequence = null
    playing = null

    if (tone) tone.getTransport().stop()
    silence()
    current = null
  }

  /**
   * Laisse le rack en cours s'éteindre, queue comprise.
   *
   * @param makeRoom vrai quand un autre nom prend la main : le rack sortant
   * s'efface d'abord d'un coup au second plan. Sur un arrêt franc — le pointeur
   * quitte le texte — rien ne lui succède, la queue peut donc se déployer
   * entièrement.
   */
  function silence(makeRoom = false) {
    if (!current || !tone) return
    // Les voix relâchent : plus aucune note nouvelle, mais leur propre release
    // (jusqu'à 5,5 s sur le drone) continue de nourrir la réverbération.
    current.synth.releaseAll?.()

    // On annule ce qui était programmé avant de descendre : deux rampes
    // concurrentes sur le même paramètre laissaient le gain dans un état
    // imprévisible, parfois bloqué à zéro.
    const gain = current.out.gain
    const at = tone.now()
    gain.cancelScheduledValues(at)
    gain.setValueAtTime(gain.value, at)
    if (makeRoom) gain.linearRampToValueAtTime(DUCK_LEVEL, at + DUCK_S)
    gain.linearRampToValueAtTime(0, at + current.tail)
  }

  /** Arrêt inconditionnel, pour un démarrage qui prend la main. */
  function takeOver(): number {
    token++
    sequence?.stop()
    sequence?.dispose()
    sequence = null
    if (tone) tone.getTransport().stop()
    // Un autre nom arrive : le sortant recule au lieu de disparaître.
    silence(true)
    return token
  }

  async function start(name: string, mode: Mode, voice: Voice) {
    // Déjà en train de jouer ce nom : ne pas relancer le motif au milieu.
    if (playing === name) return

    const mine = takeOver()
    playing = name

    if (!(await ensureAudio()) || !tone) return
    // Un démarrage plus récent a pris la main pendant l'attente : on renonce.
    if (mine !== token) return

    let rack = racks.get(voice.key)
    if (!rack) {
      rack = buildRack(voice)
      racks.set(voice.key, rack)
    }
    current = rack

    // Réouverture de la sortie. On ANNULE d'abord l'extinction éventuellement
    // en cours : une rampe montante lancée par-dessus une rampe descendante ne
    // remontait pas toujours, et le rack restait muet.
    const openAt = tone.now()
    rack.out.gain.cancelScheduledValues(openAt)
    rack.out.gain.setValueAtTime(1, openAt)

    const recipe = RECIPES[voice.key]
    const pattern = buildPattern(name, mode, voice)
    let step = 0

    sequence = new tone.Sequence((time, note) => {
      const t = TREATMENTS[step % TREATMENTS.length]
      step++

      // Le rack est réglé AVANT le déclenchement : posé après, l'effet
      // n'aurait porté que sur la note suivante.
      rack!.crusher.bits.value = Math.max(1, Math.min(16, recipe.crush + t.bits))
      rack!.shaper.order = Math.max(1, Math.round(recipe.shape * t.order))
      rack!.filter.frequency.value = recipe.filter.frequency * t.cutoff
      ;(rack!.synth as unknown as { set: (o: object) => void }).set({ detune: t.detune })

      // La durée suit la densité : un drone répète le même degré quatre fois,
      // ses notes doivent donc se recouvrir pour former une tenue au lieu de
      // pulser. Une voix à densité 1 garde des notes détachées.
      const dur = (60 / BPM / 2) * t.hold * voice.density
      ;(rack!.synth.triggerAttackRelease as unknown as
        (n: string, d: number, at: number, v: number) => void)(note, dur, time, 0.9)
    }, pattern, '8n')

    sequence.loop = true
    sequence.start(0)
    tone.getTransport().start()
  }

  return { start, stop }
}
