/**
 * Le plan du site : une seule adresse.
 *
 * Le jeu tient dans une page — les écrans se succèdent dans le même document,
 * sans navigation. Il n'y a donc rien d'autre à déclarer, et surtout pas les
 * scènes : elles n'ont pas d'URL, et leur contenu appartient à un joueur.
 */
export default defineEventHandler((event) => {
  const { origin } = getRequestURL(event, { xForwardedHost: true })
  setHeader(event, 'content-type', 'application/xml; charset=utf-8')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${origin}/</loc>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`
})
