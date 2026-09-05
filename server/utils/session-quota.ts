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
const LOCK_COOKIE = 'tg_lock'

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
  /**
   * Tours joués DANS LA SCÈNE EN COURS.
   *
   * Remis à zéro à chaque scène servie. C'est le seul compteur qui permette au
   * serveur de constater qu'un joueur tourne en rond sans que le client ait à
   * le lui dire — `turnCount` vient du navigateur, il se falsifie.
   */
  scene_turns?: number
}

/**
 * Fermeture de la ville. Signée, donc infalsifiable.
 *
 * Deux motifs, deux durées. `stalled` : le joueur a passé une scène entière
 * sans en sortir, la ville se recharge le temps d'un cycle. `completed` : il a
 * traversé toute l'histoire, et elle ne se rejoue pas — ce monde-là était le
 * sien, il n'y en aura pas d'autre.
 */
export interface LockPass {
  /** Fin de la fermeture, en millisecondes. */
  until: number
  reason: 'stalled' | 'completed'
  /**
   * L'adieu, écrit pour CE joueur à la génération de l'épilogue.
   *
   * Rangé dans le cookie et non côté client : c'est la seule façon qu'il
   * survive à un rechargement, à un autre onglet, à un autre jour. Court par
   * nécessité — un cookie plafonne autour de 4 ko.
   */
  farewell?: string
}

/** Droit d'accès ouvert par le paiement. Signé, donc infalsifiable. */
export interface AccessPass {
  /** Identifiant du paiement Square, pour le rapprochement comptable. */
  payment_id: string
  paid_at: number
  expires_at: number
}

function freshQuota(): SessionQuota {
  return { sid: randomUUID(), scenes: 0, turns: 0, images: 0, since: Date.now(), scene_turns: 0 }
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

/**
 * Ferme la ville pour un cycle.
 *
 * Le joueur qui a tourné en rond toute une scène ne peut plus rien générer
 * jusqu'à l'expiration. Ce n'est pas une punition gratuite : chaque scène et
 * chaque tour coûtent des tokens, et la fenêtre ouverte par le paiement dure
 * plusieurs jours — sans ce frein, une partie qui patine peut consommer autant
 * qu'une partie entière, plusieurs fois de suite.
 *
 * `httpOnly`, signé, même mécanique que le quota : le client ne peut ni le lire
 * ni l'écrire. Effacer ses cookies le lève, mais fait perdre le droit d'accès
 * payant en même temps — un payant n'a donc aucun intérêt à le faire.
 */
export function lockOut(
  event: H3Event,
  hours: number,
  reason: LockPass['reason'],
  farewell?: string,
): LockPass {
  const secret = requireSecret(useRuntimeConfig().nuxtSecret, 'NUXT_SECRET')
  const lock: LockPass = { until: Date.now() + hours * 3600_000, reason }
  // Tronqué : au-delà, le cookie devient trop lourd et le navigateur le jette
  // en silence — on perdrait le verrou avec l'adieu.
  if (farewell) lock.farewell = farewell.slice(0, 700)

  setCookie(event, LOCK_COOKIE, seal(lock, secret), {
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.dev,
    path: '/',
    maxAge: Math.ceil(hours * 3600),
  })
  return lock
}

/** Le verrou en cours, ou null s'il est absent, falsifié ou expiré. */
export function readLock(event: H3Event): LockPass | null {
  const secret = requireSecret(useRuntimeConfig().nuxtSecret, 'NUXT_SECRET')
  const lock = unseal<LockPass>(getCookie(event, LOCK_COOKIE), secret)
  if (!lock?.until || lock.until < Date.now()) return null
  return lock
}

/** Lève le verrou. Réservé au canal de développement. */
export function clearLock(event: H3Event): void {
  deleteCookie(event, LOCK_COOKIE, { path: '/' })
}

/**
 * Refuse toute requête coûteuse tant que le verrou tient.
 *
 * 423 et non 429 : ce n'est pas un quota atteint, c'est un accès suspendu. Le
 * client s'en sert pour montrer l'écran d'attente plutôt qu'une erreur.
 */
export function assertNotLocked(event: H3Event): void {
  const lock = readLock(event)
  if (!lock) return
  throw createError({
    statusCode: 423,
    statusMessage: 'La ville se recharge.',
    data: { lockedUntil: lock.until },
  })
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

/**
 * @param windowHours durée de vie du cookie, alignée sur la fenêtre en cours.
 *
 * Elle valait 24 h en dur. Pour un joueur ayant payé, dont la fenêtre dure
 * plusieurs jours, le cookie mourait donc chaque nuit et les compteurs
 * repartaient de zéro : le plafond payant ne bornait rien du tout.
 */
export function writeQuota(event: H3Event, quota: SessionQuota, windowHours: number): void {
  const secret = requireSecret(useRuntimeConfig().nuxtSecret, 'NUXT_SECRET')
  const payload = Buffer.from(JSON.stringify(quota), 'utf-8').toString('base64url')

  setCookie(event, COOKIE, `${payload}.${sign(payload, secret)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.dev,
    path: '/',
    maxAge: Math.ceil(windowHours * 3600),
  })
}

/**
 * Consomme une unité du quota, ou refuse la requête.
 *
 * Deux mécanismes distincts vivent ici, et ils ne répondent pas à la même
 * question.
 *
 * Le QUOTA borne la dépense : combien de scènes, de tours et d'images sur la
 * fenêtre. Il dépend du droit d'accès — un visiteur qui a payé dispose d'une
 * fenêtre bien plus large — et il se désactive en développement.
 *
 * Le VERROU borne le temps : un joueur qui a passé toute une scène sans en
 * sortir ne rejoue pas avant un cycle complet. C'est une règle de jeu, pas une
 * borne de dépense ; elle s'applique donc toujours, quotas éteints et
 * développement compris — sinon elle serait intestable. Et c'est elle qui rend
 * la fenêtre payante tenable : sans frein, une partie qui patine consomme
 * autant qu'une partie entière, plusieurs fois par jour.
 */
export function consumeQuota(
  event: H3Event,
  kind: 'scenes' | 'turns' | 'images',
  limits: LimitsConfig
): SessionQuota {
  const access = readAccess(event)
  const windowHours = access ? limits.paid.window_days * 24 : limits.window_hours
  const quota = readQuota(event, windowHours)

  const lock = limits.lock
  if (kind === 'scenes') {
    // Une scène neuve remet le compteur à zéro : c'est ce qui distingue
    // « il avance » de « il tourne en rond ».
    quota.scene_turns = 0
  } else if (kind === 'turns' && lock?.turns_per_scene) {
    const played = quota.scene_turns ?? 0
    if (played >= lock.turns_per_scene) {
      lockOut(event, lock.hours, 'stalled')
      throw createError({
        statusCode: 423,
        statusMessage: lock.message,
        data: { lockedUntil: Date.now() + lock.hours * 3600_000 },
      })
    }
    quota.scene_turns = played + 1
  }

  // Interrupteur global, et développement : dans les deux cas on ne décompte
  // rien. Le premier est temporaire — le laisser à false en production revient
  // à n'avoir aucune borne de dépense.
  if (limits.enabled && !import.meta.dev) {
    const limit = access
      ? limits.paid[`${kind}_per_window` as const]
      : limits[`${kind}_per_session` as const]

    if (quota[kind] >= limit) {
      throw createError({
        statusCode: 429,
        statusMessage: access ? limits.paid.messages[kind] : limits.messages[kind],
      })
    }
    quota[kind] += 1
  }

  writeQuota(event, quota, windowHours)
  return quota
}
