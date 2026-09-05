import { ScriptRuntime } from '~/utils/script-runtime'
import { lockOut, clearLock, readLock } from '~/server/utils/session-quota'

/**
 * Ferme la ville pour un cycle.
 *
 * Appelé par le client au moment où la nuit se referme, pour que l'écran et le
 * cookie basculent ensemble. Ce n'est PAS la seule barrière : `consumeQuota`
 * compte les tours de chaque scène côté serveur et ferme de lui-même au
 * dépassement. Un client qui n'appellerait pas cette route se ferait fermer au
 * tour suivant — celui-ci ne partirait simplement jamais.
 *
 * Aucune génération, donc aucun coût.
 *
 * En développement, `{ open: true }` lève le verrou : sans quoi une seule
 * séance de test condamnerait la journée.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ open?: boolean }>(event).catch(() => null)

  if (body?.open) {
    if (!import.meta.dev) throw createError({ statusCode: 403, statusMessage: 'Indisponible' })
    clearLock(event)
    return { open: true as const }
  }

  const runtime = await ScriptRuntime.load()
  // Déjà fermée : on ne repousse pas l'échéance à chaque rechargement, sinon
  // un joueur qui insiste s'enfermerait indéfiniment.
  const existing = readLock(event)
  if (existing) return existing

  return lockOut(event, runtime.script.limits.lock.hours, 'stalled')
})
