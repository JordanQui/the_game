import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { LimitsConfig } from '~/types/script'
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
const ACCESS_COOKIE = 'tg_access'

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

/** Droit d'accès ouvert par le paiement. Signé, donc infalsifiable. */
export interface AccessPass {
  /** Identifiant du paiement Square, pour le rapprochement comptable. */
  payment_id: string
  paid_at: number
  expires_at: number
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

/** Encode et signe une charge utile quelconque. */
function seal(value: unknown, secret: string): string {
  const payload = Buffer.from(JSON.stringify(value), 'utf-8').toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

/** Vérifie la signature et décode. Null si absent, falsifié ou illisible. */
function unseal<T>(raw: string | undefined, secret: string): T | null {
  if (!raw) return null
  const separator = raw.lastIndexOf('.')
  if (separator < 1) return null

  const payload = raw.slice(0, separator)
  if (!signatureMatches(sign(payload, secret), raw.slice(separator + 1))) return null

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as T
  } catch {
    return null
  }
}

/**
 * Ouvre l'accès à la suite pour la durée prévue au script.
 *
 * Le cookie précédent était en clair, avec une valeur fixe : n'importe qui
 * pouvait l'envoyer et débloquer la suite sans payer. Celui-ci est signé.
 */
export function grantAccess(event: H3Event, paymentId: string, windowDays: number): AccessPass {
  const secret = requireSecret(useRuntimeConfig().nuxtSecret, 'NUXT_SECRET')
  const pass: AccessPass = {
    payment_id: paymentId,
    paid_at: Date.now(),
    expires_at: Date.now() + windowDays * 86_400_000,
  }

  setCookie(event, ACCESS_COOKIE, seal(pass, secret), {
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.dev,
    path: '/',
    maxAge: windowDays * 86_400,
  })
  return pass
}

/** Le droit d'accès en cours, ou null s'il est absent, falsifié ou expiré. */
export function readAccess(event: H3Event): AccessPass | null {
  const secret = requireSecret(useRuntimeConfig().nuxtSecret, 'NUXT_SECRET')
  const pass = unseal<AccessPass>(getCookie(event, ACCESS_COOKIE), secret)
  if (!pass?.expires_at || pass.expires_at < Date.now()) return null
  return pass
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
 * Le barème dépend du droit d'accès : un visiteur qui a payé dispose d'une
 * fenêtre bien plus large. Le plafond reste nécessaire même après paiement —
 * 10 € couvrent une centaine de parties en coût de génération, pas l'infini.
 */
export function consumeQuota(
  event: H3Event,
  kind: 'scenes' | 'turns' | 'images',
  limits: LimitsConfig
): SessionQuota {
  // Interrupteur global, et développement : dans les deux cas on ne décompte
  // rien. Le premier est temporaire — le laisser à false en production revient
  // à n'avoir aucune borne de dépense.
  if (!limits.enabled || import.meta.dev) return readQuota(event, limits.window_hours)

  const access = readAccess(event)

  const limit = access
    ? limits.paid[`${kind}_per_window` as const]
    : limits[`${kind}_per_session` as const]
  const windowHours = access ? limits.paid.window_days * 24 : limits.window_hours
  const message = access ? limits.paid.messages[kind] : limits.messages[kind]

  const quota = readQuota(event, windowHours)

  if (quota[kind] >= limit) {
    throw createError({ statusCode: 429, statusMessage: message })
  }

  quota[kind] += 1
  writeQuota(event, quota)
  return quota
}
