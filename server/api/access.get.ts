import { ScriptRuntime } from '~/utils/script-runtime'
import { readAccess, readLock } from '~/server/utils/session-quota'

/**
 * Le droit d'accès en cours.
 *
 * Interrogé au chargement : c'est ce qui permet à un joueur qui a déjà payé de
 * reprendre l'aventure sans repasser par le paywall, sans compte ni base de
 * données. Aucune génération, donc aucun coût.
 */
export default defineEventHandler(async (event) => {
  // La fermeture voyage avec le droit d'accès : c'est le seul appel fait au
  // chargement, et l'écran d'adieu doit revenir tel quel après un rechargement,
  // dans un autre onglet, le lendemain. Le texte vient du cookie signé — rien
  // n'est régénéré, rien n'est facturé.
  const lock = readLock(event)
  const closed = lock
    ? { until: lock.until, reason: lock.reason, text: lock.farewell }
    : null

  const pass = readAccess(event)
  if (!pass) return { active: false as const, lock: closed }

  const runtime = await ScriptRuntime.load()
  return {
    active: true as const,
    expiresAt: pass.expires_at,
    windowDays: runtime.script.limits.paid.window_days,
    lock: closed,
  }
})
