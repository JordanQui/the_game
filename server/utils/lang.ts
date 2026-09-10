import type { H3Event } from 'h3'
import type { LangCode } from '~/types/i18n'
import type { UserProfile } from '~/types/user'
import { detectLang, resolveLang } from '~/utils/languages'

/**
 * La langue d'une requête, dans l'ordre où elle fait autorité.
 *
 * 1. LE DOSSIER. C'est le joueur qui a tranché, et son choix voyage avec le
 *    profil : une partie reprise depuis un autre appareil, où le cookie
 *    n'existe pas, garde quand même sa langue.
 * 2. LE COOKIE, posé par le sélecteur. Il couvre tout ce qui se passe avant
 *    qu'un dossier existe — l'accueil, le formulaire — et tous les appels qui
 *    n'envoient pas de profil : le quota, la fermeture, le droit d'accès.
 * 3. L'EN-TÊTE `Accept-Language`, pour un tout premier appel sans rien.
 * 4. Le français, langue d'écriture du jeu.
 *
 * Le cookie n'est PAS signé, et n'a pas à l'être : au pire un curieux se fait
 * servir un message d'erreur en néerlandais. Rien ici n'ouvre de droit — les
 * cookies qui en ouvrent sont signés en HMAC dans `session-quota.ts`.
 */
export function requestLang(event: H3Event, user?: UserProfile | null): LangCode {
  if (user?.language) return resolveLang(user.language)

  const cookie = getCookie(event, 'tg_lang')
  if (cookie) return resolveLang(cookie)

  return detectLang(getRequestHeader(event, 'accept-language'))
}
