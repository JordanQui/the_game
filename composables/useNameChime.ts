import { modeFor, chimeNotes } from '~/utils/modes'

/**
 * La petite mélodie qui accompagne la lecture d'un nom.
 *
 * Sinus nu dans une réverbération longue : un timbre de terminal, pas de
 * musique. La gamme employée dépend du personnage — un mode par posture —, si
 * bien qu'à force on reconnaît quelqu'un à son intervalle avant de lire son nom.
 *
 * Tone.js est chargé À LA DEMANDE, au premier survol. C'est une grosse
 * bibliothèque : la faire entrer dans le bundle initial retarderait l'affichage
 * de la scène pour un ornement.
 */

type ToneModule = typeof import('tone')

let tone: ToneModule | null = null
let synth: InstanceType<ToneModule['PolySynth']> | null = null
let started = false
let lastPlayed = 0

/** Deux notes trop rapprochées deviennent du bruit. */
const MIN_GAP_MS = 220

async function ensureAudio(): Promise<boolean> {
  if (!import.meta.client) return false

  if (!tone) {
    tone = await import('tone')
    const reverb = new tone.Reverb({ decay: 4.5, wet: 0.55 }).toDestination()
    synth = new tone.PolySynth(tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 0.28, sustain: 0.06, release: 1.6 },
      volume: -20,
    }).connect(reverb)
  }

  // Un contexte audio ne démarre qu'après un geste de l'utilisateur. Le survol
  // en est un ; sur mobile, c'est le bouton d'activation de l'oeil.
  if (!started) {
    try {
      await tone.start()
      started = true
    } catch {
      return false
    }
  }
  return Boolean(synth)
}

export function useNameChime() {
  async function play(name: string, archetype: string) {
    const now = Date.now()
    if (now - lastPlayed < MIN_GAP_MS) return
    lastPlayed = now

    if (!(await ensureAudio()) || !tone || !synth) return

    const mode = modeFor(archetype, name)
    const notes = chimeNotes(mode, name)
    const at = tone.now()

    // Arpège montant, très serré : on entend un signal, pas un motif.
    notes.forEach((note, i) => {
      synth!.triggerAttackRelease(note, 0.18, at + i * 0.055)
    })
  }

  return { play }
}
