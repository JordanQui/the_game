import { ScriptRuntime } from '~/utils/script-runtime'
import { readAccess } from '~/server/utils/session-quota'

/**
 * Le droit d'accès en cours.
 *
 * Interrogé au chargement : c'est ce qui permet à un joueur qui a déjà payé de
 * reprendre l'aventure sans repasser par le paywall, sans compte ni base de
 * données. Aucune génération, donc aucun coût.
 */
export default defineEventHandler(async (event) => {
  const pass = readAccess(event)
  if (!pass) return { active: false as const }

  const runtime = await ScriptRuntime.load()
  return {
    active: true as const,
    expiresAt: pass.expires_at,
    windowDays: runtime.script.limits.paid.window_days,
  }
})
