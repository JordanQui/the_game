import OpenAI from 'openai'
import type { SceneImageRequest, SceneImageResponse } from '~/types/scene'
import { ScriptRuntime } from '~/utils/script-runtime'
import { generateImage } from '~/server/utils/image-gen'
import { requireSecret } from '~/server/utils/runtime-secrets'

/**
 * Phase 2 du pipeline : l'illustration.
 *
 * Prend la palette et le décor produits par /api/scene/text, jamais un prompt
 * libre : le gabarit est réassemblé ici, à partir du script. Sans ça, la route
 * deviendrait un accès ouvert au compte OpenAI.
 */
export default defineEventHandler(async (event): Promise<SceneImageResponse> => {
  const config = useRuntimeConfig()
  const body = await readBody<SceneImageRequest>(event)

  if (!body?.palette || !body?.decor || !body?.place_name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Champs requis : scene_id, place_name, palette, decor',
    })
  }

  const runtime = await ScriptRuntime.load()
  const scene = runtime.scene(body.scene_id)

  const prompt = scene.buildImagePrompt({
    place_name: body.place_name,
    palette: body.palette,
    decor: body.decor,
  })

  const openai = new OpenAI({ apiKey: requireSecret(config.openaiApiKey, 'OPENAI_API_KEY') })

  try {
    return await generateImage(openai, scene.artDirection, prompt)
  } catch (err) {
    throw createError({
      statusCode: 502,
      statusMessage: err instanceof Error ? err.message : scene.fallbacks.image_error,
    })
  }
})
