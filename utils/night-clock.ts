/**
 * L'horloge de la nuit.
 *
 * Le patron vient de Prince of Persia : une heure fixe au bout, et chaque
 * geste qui la rapproche. Ici ce n'est pas le temps réel qui s'écoule — le
 * joueur peut poser son téléphone —, c'est ce qu'il FAIT : une réplique
 * facturée, une énigme ratée, un endroit fouillé pour rien. Regarder, lire un
 * nom, ramasser ne coûtent rien.
 *
 * C'est la seule mécanique qui aligne la difficulté sur la marge : elle pousse
 * à observer plutôt qu'à parler, donc à consommer MOINS de tours facturés.
 *
 * Aucune dépendance : partagé client et serveur, testable seul.
 */

/** Ce que le script déclare, dans `defaults.night_clock`. */
export interface NightClockConfig {
  /** La première scène où l'horloge tourne. L'auberge est hors du temps. */
  starts_at_scene: string
  /** « 23:00 » : l'heure au sortir de l'auberge. */
  start: string
  /** « 06:00 » : l'aube. Plus tôt que `start`, elle est le lendemain. */
  dawn: string
  /** Ce que coûte chaque geste, en minutes de nuit. */
  minutes: {
    /** Arriver dans un lieu : le trajet depuis le précédent. */
    arrival: number
    /** Une réplique facturée au modèle. */
    turn: number
    /** Une énigme mal résolue. */
    wrong_answer: number
    /** Un endroit fouillé, qu'il y ait ou non quelque chose dedans. */
    search: number
  }
  /** Il reste si peu que l'horloge le montre. */
  urgent_minutes: number
}

/** « 23:40 » → 1420. Une valeur illisible vaut minuit. */
function parseClock(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return 0
  return (Number(m[1]) % 24) * 60 + Number(m[2]) % 60
}

/** La durée de la nuit, en minutes. L'aube avant le départ tombe le lendemain. */
export function nightLength(cfg: NightClockConfig): number {
  const start = parseClock(cfg.start)
  const dawn = parseClock(cfg.dawn)
  return ((dawn - start) + 1440) % 1440 || 1440
}

/** L'heure qu'il est, après `elapsed` minutes de nuit. */
export function clockAt(cfg: NightClockConfig, elapsed: number): string {
  const t = (parseClock(cfg.start) + Math.max(0, Math.floor(elapsed))) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/** Ce qu'il reste avant l'aube, découpé pour l'affichage. */
export function timeLeft(cfg: NightClockConfig, elapsed: number): { h: number; m: number; total: number } {
  const total = Math.max(0, nightLength(cfg) - elapsed)
  return { h: Math.floor(total / 60), m: total % 60, total }
}

/**
 * L'heure pleine franchie entre deux instants, s'il y en a une.
 *
 * Le joueur ne regarde pas l'horloge : il lit le récit. Chaque heure qui
 * tombe s'y inscrit donc, comme le « 45 MINUTES LEFT » de Prince of Persia —
 * et une seule, la dernière, si un geste en a franchi deux.
 */
export function crossedHour(cfg: NightClockConfig, before: number, after: number): string | null {
  if (after <= before) return null
  const start = parseClock(cfg.start)
  const hourOf = (elapsed: number) => Math.floor((start + elapsed) / 60)
  if (hourOf(after) === hourOf(before)) return null
  const t = (hourOf(after) * 60) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:00`
}

/**
 * Ce lieu est-il dans la nuit comptée ?
 *
 * À partir de `starts_at_scene` dans l'ordre du script, épilogue exclu : on ne
 * compte plus les minutes d'une nuit qui s'achève.
 */
export function inNight(
  sceneId: string | null | undefined,
  order: Array<{ id: string; kind?: string }>,
  cfg: NightClockConfig,
): boolean {
  if (!sceneId) return false
  const here = order.findIndex(s => s.id === sceneId)
  const from = order.findIndex(s => s.id === cfg.starts_at_scene)
  if (here < 0 || from < 0) return false
  return here >= from && order[here]!.kind !== 'ending'
}
