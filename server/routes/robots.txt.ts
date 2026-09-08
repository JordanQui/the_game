/**
 * Servi plutôt que posé dans `public/` : le lien vers le plan du site doit
 * porter le domaine réellement servi, et il change entre une préproduction
 * Vercel et le domaine définitif.
 */
export default defineEventHandler((event) => {
  const { origin } = getRequestURL(event, { xForwardedHost: true })
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')

  // L'administration est protégée côté serveur ; elle n'a en plus rien à faire
  // dans un index.
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n')
})
