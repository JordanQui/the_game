import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { savePlaying } from '~/composables/useScene'

/**
 * Écrit la partie dans le navigateur à mesure qu'elle se joue.
 *
 * Elle ne l'était qu'à la naissance d'une scène : un rechargement en plein
 * milieu ramenait le texte d'ouverture, sans les échanges, sans l'objet-clé,
 * sans ce qui avait été ramassé. Le serveur, lui, avait compté les tours — le
 * joueur refaisait la scène avec moins de marge avant la fermeture de la ville.
 *
 * Différé d'un instant : un tour touche le store plusieurs fois de suite, et
 * c'est l'état d'arrivée qui compte. `pagehide` vide ce qui reste en attente.
 */
export default defineNuxtPlugin(() => {
  const gameStore = useGameStore()
  const playerStore = usePlayerStore()

  let timer: ReturnType<typeof setTimeout> | null = null

  function flush() {
    if (timer) clearTimeout(timer)
    timer = null
    savePlaying(gameStore, playerStore)
  }

  function schedule() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, 400)
  }

  gameStore.$subscribe(schedule, { detached: true })
  playerStore.$subscribe(schedule, { detached: true })
  window.addEventListener('pagehide', flush)
})
