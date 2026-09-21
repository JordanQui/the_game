import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { useProgression } from '~/composables/useProgression'
import { translate } from '~/utils/languages'
import {
  clockAt, crossedHour, inNight, nightLength, timeLeft, type NightClockConfig,
} from '~/utils/night-clock'

/**
 * L'horloge de la nuit, côté partie.
 *
 * Tout le calcul est dans `utils/night-clock.ts` ; ici on le branche sur le
 * store et sur le récit : l'heure qui tombe s'écrit au fil, l'aube emporte la
 * partie vers l'épilogue. Aucun appel au modèle — l'horloge ne fait que
 * compter ce qui en a déjà coûté un.
 */
export function useNightClock() {
  const gameStore = useGameStore()
  const playerStore = usePlayerStore()
  const { scenes, goTo } = useProgression()

  const config = computed<NightClockConfig | null>(() => playerStore.scene?.pacing?.night_clock ?? null)

  /** L'horloge tourne dans ce lieu-ci. L'auberge et l'épilogue sont hors du temps. */
  const running = computed(() => {
    const cfg = config.value
    return Boolean(cfg && inNight(playerStore.scene?.scene_id, scenes(), cfg))
  })

  const clock = computed(() => config.value ? clockAt(config.value, gameStore.nightMinutes) : '')
  const left = computed(() => config.value
    ? timeLeft(config.value, gameStore.nightMinutes)
    : { h: 0, m: 0, total: 0 })
  const urgent = computed(() => Boolean(config.value) && left.value.total <= config.value!.urgent_minutes)

  const t = (key: string, vars?: Record<string, string | number>) =>
    translate(playerStore.language, key, vars)

  /** « 2 h 40 », « 35 min » : ce qu'il reste, dit comme on le dirait. */
  function duration(minutes: number): string {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (!h) return t('night.minutes', { m })
    return m ? t('night.hours_minutes', { h, m }) : t('night.hours', { h })
  }

  /**
   * L'aube se lève : la nuit du joueur s'arrête où il est.
   *
   * La saisie se ferme le temps qu'on lise la phrase, puis l'épilogue prend
   * le relais — il sait, par `dawnBroke`, que le dernier lieu n'a pas été
   * atteint.
   */
  function breakDawn() {
    gameStore.leaveConversation()
    gameStore.setPuzzleOpen(false)
    gameStore.addNarrativeEntry('system', t('night.dawn'))
    gameStore.setPlayingSubState('npc_dialogue')
    setTimeout(() => {
      const ending = scenes().find(s => s.kind === 'ending')
      if (ending) goTo(ending)
    }, 3200)
  }

  /**
   * La nuit avance du prix de ce geste.
   *
   * Vrai si l'aube vient de se lever : l'appelant s'arrête là, le reste de son
   * geste n'a plus lieu. Une heure pleine franchie s'écrit au fil.
   */
  function spend(kind: keyof NightClockConfig['minutes']): boolean {
    const cfg = config.value
    if (!cfg || !running.value) return false
    const r = gameStore.spendNight(cfg.minutes[kind] ?? 0, nightLength(cfg))
    if (r.dawn) {
      breakDawn()
      return true
    }
    const hour = crossedHour(cfg, r.before, r.after)
    if (hour) {
      gameStore.addNarrativeEntry('system', t('night.hour', {
        time: hour, left: duration(timeLeft(cfg, r.after).total),
      }))
    }
    return false
  }

  /** Le prix d'un geste, pour l'annoncer avant qu'on le paie. */
  function cost(kind: keyof NightClockConfig['minutes']): number {
    return running.value ? config.value?.minutes[kind] ?? 0 : 0
  }

  return { config, running, clock, left, urgent, duration, spend, cost, breakDawn }
}
