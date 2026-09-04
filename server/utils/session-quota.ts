import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { requireSecret } from '~/server/utils/runtime-secrets'

/**
 * Quota par session, tenu dans un cookie signé.
 *
 * Le problème visé est précis : un visiteur qui recharge la page en boucle
 * relance une génération de scène à chaque fois. Le compteur ne peut pas vivre
 * côté client — il serait remis à zéro — ni en mémoire serveur : sur Vercel
 * chaque invocation peut tomber sur une lambda différente.
 *
 * D'où le cookie signé en HMAC : il survit au rechargement, il voyage avec le
 * visiteur, et il est infalsifiable sans la clé. Effacer ses cookies le
 * réinitialise — c'est la limite assumée de cette approche, qui arrête l'abus
 * ordinaire sans exiger de base de données.
 */

const COOKIE = 'tg_quota'

export interface SessionQuota {
  /** Identifiant de session, pour le diagnostic. */
  sid: string
  /** Générations de scène consommées. */
  scenes: number
  /** Tours de narration consommés. */
  turns: number
  /** Images générées. */
  images: number
  /** Date d'ouverture de la session, en millisecondes. */
  since: number
}

function freshQuota(): SessionQuota {
  return { sid: randomUUID(), scenes: 0, turns: 0, images: 0, since: Date.now() }
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

/** Comparaison à temps constant : une égalité naïve fuite la signature. */
function signatureMatches(expected: string, received: string): boolean {
  const a = Buffer.from(expected)
  const b = Buffer.from(received)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function readQuota(event: H3Event, windowHours: number): SessionQuota {
  const secret = requireSecret(useRuntimeConfig().nuxtSecret, 'NUXT_SECRET')
  const raw = getCookie(event, COOKIE)
  if (!raw) return freshQuota()

  const separator = raw.lastIndexOf('.')
  if (separator < 1) return freshQuota()

  const payload = raw.slice(0, separator)
  const signature = raw.slice(separator + 1)
  if (!signatureMatches(sign(payload, secret), signature)) return freshQuota()

  let quota: SessionQuota
  try {
    quota = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as SessionQuota
  } catch {
    return freshQuota()
  }

  // Fenêtre glissante : au-delà, la session repart à zéro.
  if (!quota.since || Date.now() - quota.since > windowHours * 3600_000) return freshQuota()
  return quota
}

export function writeQuota(event: H3Event, quota: SessionQuota): void {
  const secret = requireSecret(useRuntimeConfig().nuxtSecret, 'NUXT_SECRET')
  const payload = Buffer.from(JSON.stringify(quota), 'utf-8').toString('base64url')

  setCookie(event, COOKIE, `${payload}.${sign(payload, secret)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.dev,
    path: '/',
    maxAge: 60 * 60 * 24,
  })
}

/**
 * Consomme une unité du quota, ou refuse la requête.
 *
 * Le 429 porte un message lisible : c'est lui que verra le joueur, pas une
 * erreur technique.
 */
export function consumeQuota(
  event: H3Event,
  kind: 'scenes' | 'turns' | 'images',
  limit: number,
  windowHours: number,
  message: string
): SessionQuota {
  const quota = readQuota(event, windowHours)

  if (quota[kind] >= limit) {
    throw createError({ statusCode: 429, statusMessage: message })
  }

  quota[kind] += 1
  writeQuota(event, quota)
  return quota
}
