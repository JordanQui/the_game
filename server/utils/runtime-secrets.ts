/**
 * Résout un secret serveur.
 *
 * nuxt.config lit `process.env` au BUILD : sur Vercel, la valeur est figée dans
 * le bundle au moment du déploiement. Une variable ajoutée ou changée ensuite
 * dans le dashboard reste invisible tant qu'on ne redéploie pas — et le seul
 * symptôme est une 500 sans cause apparente. On relit donc `process.env` à
 * l'exécution, où Vercel injecte les valeurs à jour.
 *
 * Ne vaut que côté serveur : les clés de `runtimeConfig.public` partent dans le
 * bundle client et doivent rester bakées au build.
 */
export function requireSecret(configValue: string | undefined, envName: string): string {
  const value = configValue || process.env[envName] || ''
  if (!value) {
    throw createError({
      statusCode: 500,
      statusMessage: `${envName} absente de l'environnement`,
    })
  }
  return value
}
