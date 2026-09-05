import { unlockAudio } from '~/composables/useNameChime'

/**
 * Ouvre le contexte audio au tout premier geste de la page.
 *
 * Les navigateurs — iOS en tête — n'autorisent le son que si la demande part
 * d'une interaction utilisateur. Nos sons, eux, se déclenchent au survol d'un
 * nom ou par la boucle du gyroscope : jamais depuis le geste. Sans ce
 * déblocage préalable, la première note est silencieusement refusée, et sur
 * mobile aucune ne passe jamais.
 *
 * `pointerdown` couvre souris et tactile, `keydown` couvre le clavier.
 */
export default defineNuxtPlugin(() => {
  const events = ['pointerdown', 'touchend', 'keydown'] as const

  const unlock = () => {
    void unlockAudio()
    for (const type of events) window.removeEventListener(type, unlock)
  }

  for (const type of events) {
    window.addEventListener(type, unlock, { passive: true })
  }
})
