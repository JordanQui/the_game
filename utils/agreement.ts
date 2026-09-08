/**
 * L'accord grammatical, dit au modèle en clair.
 *
 * Le jeu narre à la deuxième personne en français : sans cette ligne, le
 * modèle tranche seul, et il tranche au masculin. Une étiquette (« féminin »)
 * ne suffit pas — l'exemple porte mieux que la règle.
 *
 * Ce fichier vit à part de `utils/script-runtime.ts` pour une seule raison :
 * le client en a besoin aussi (il reporte l'accord dans le contexte de tour),
 * et script-runtime embarque tout `game/script.json`. On ne fait pas voyager
 * le script entier pour trois phrases.
 */

import type { UserAgreement, UserProfile } from '~/types/user'

const AGREEMENT_LINES: Record<UserAgreement, string> = {
  masculin: 'masculin — « tu es entré », « tu es seul »',
  feminin: 'féminin — « tu es entrée », « tu es seule »',
  neutre: 'neutre — évite les participes et adjectifs genrés, tourne la phrase autrement',
}

/** La formulation d'accord d'un joueur, ou null s'il ne l'a pas déclaré. */
export function agreementLine(user: UserProfile | null | undefined): string | null {
  const key = user?.identity.agreement
  return key ? AGREEMENT_LINES[key] : null
}
