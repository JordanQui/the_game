/**
 * Réduit du HTML à une poignée de balises sûres.
 *
 * Le texte de fin est écrit par le modèle et affiché tel quel : il ne peut donc
 * pas partir au navigateur sans être filtré. On ne « nettoie » pas les
 * attributs dangereux un par un — approche qui échoue toujours sur un cas
 * oublié — on RETIRE tout ce qui n'est pas explicitement autorisé : seules ces
 * balises passent, et jamais avec un attribut.
 */

const ALLOWED = new Set(['h2', 'p', 'em', 'strong'])

export function sanitizeHtml(input: string): string {
  return input
    // Un bloc <script>/<style> doit disparaître avec son contenu : ne retirer
    // que les balises laisserait le code s'afficher en clair.
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?([a-zA-Z0-9-]+)\b[^>]*>/g, (tag, name: string) => {
      const lower = name.toLowerCase()
      if (!ALLOWED.has(lower)) return ''
      return tag.startsWith('</') ? `</${lower}>` : `<${lower}>`
    })
    .trim()
}
