import OpenAI from 'openai'
import type { ArtDirection } from '~/types/script'

export interface ImageResult {
  /** Data URI prêt à poser dans un <img src>. */
  image: string
  model: string
  format: string
  bytes: number
  elapsed_ms: number
}

/**
 * Génère une image via la famille gpt-image-*.
 *
 * Deux différences majeures avec dall-e-3, qui n'est plus servi :
 *  - la réponse ne contient QUE du base64, jamais d'URL (donc rien n'expire) ;
 *  - le paramètre `style` n'existe plus et fait échouer la requête.
 *
 * Bascule sur le modèle de repli si le principal est indisponible.
 */
export async function generateImage(
  openai: OpenAI,
  artDirection: Pick<
    ArtDirection,
    'image_model' | 'image_fallback_model' | 'image_size' | 'image_quality' | 'image_format'
  >,
  prompt: string
): Promise<ImageResult> {
  const models = [artDirection.image_model, artDirection.image_fallback_model].filter(Boolean)
  let lastError: unknown

  for (const model of models) {
    const startedAt = Date.now()
    try {
      const response = await openai.images.generate({
        model,
        prompt,
        n: 1,
        size: artDirection.image_size as '1536x1024',
        quality: artDirection.image_quality as 'low',
        output_format: artDirection.image_format as 'webp',
      })

      const b64 = response.data?.[0]?.b64_json
      if (!b64) {
        lastError = new Error(`${model} n'a renvoyé aucune image`)
        continue
      }

      return {
        image: `data:image/${artDirection.image_format};base64,${b64}`,
        model,
        format: artDirection.image_format,
        bytes: Math.round(b64.length * 0.75),
        elapsed_ms: Date.now() - startedAt,
      }
    } catch (err) {
      lastError = err
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Génération d\'image impossible')
}
