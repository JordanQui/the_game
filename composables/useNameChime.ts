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
 * Tempo posé. À 132 en doubles-croches on avait sept notes par seconde : un
 * débit de machine. Ici, deux notes par seconde et des tenues longues — on
 * cherche l'ampleur d'un CS-80 dans une grande réverbération, pas la panique.
 */
const BPM = 64

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
  const reverb = new t.Reverb({ decay: r.decayReverb, wet: 0.62 }).connect(limiter)
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
    synth: synth as unknown as Rack['synth'],
    crusher,
    shaper,
    filter,
    dispose: () => {
      synth.dispose(); crusher.dispose(); shaper.dispose()
      filter.dispose(); chorus.dispose(); delay.dispose(); reverb.dispose(); limiter.dispose()
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
  return true
}

export function useNameChime() {
  function stop() {
    sequence?.stop()
    sequence?.dispose()
    sequence = null
    playing = null

    if (tone) tone.getTransport().stop()
    current?.synth.releaseAll?.()
    current = null
  }

  async function start(name: string, mode: Mode, voice: Voice) {
    // Déjà en train de jouer ce nom : ne pas relancer le motif au milieu.
    if (playing === name) return
    stop()
    playing = name

    if (!(await ensureAudio()) || !tone) return
    // Le survol a pu changer pendant le chargement de la bibliothèque.
    if (playing !== name) return

    let rack = racks.get(voice.key)
    if (!rack) {
      rack = buildRack(voice)
      racks.set(voice.key, rack)
    }
    current = rack

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
