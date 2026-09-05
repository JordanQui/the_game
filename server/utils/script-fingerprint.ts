import { createHash } from 'node:crypto'

/**
 * Empreinte du script courant.
 *
 * Sert à invalider tout ce qui a été mis en cache à partir d'une version
 * antérieure : les mocks de développement, mais aussi la scène gardée dans
 * l'onglet du joueur. Sans elle, modifier un prompt en production ne changeait
 * rien pour qui avait déjà une scène en session — on croyait déployer sans
 * effet.
 *
 * Mémoïsée : le contenu ne bouge pas en cours de processus.
 */
let print: string | null = null

export function scriptFingerprint(script: unknown): string {
  if (!print) {
    print = createHash('sha256').update(JSON.stringify(script)).digest('hex').slice(0, 12)
  }
  return print
}
