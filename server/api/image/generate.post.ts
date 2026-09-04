import OpenAI from 'openai'
import type { ScenePalette, SceneImageResponse } from '~/types/scene'
import { ScriptRuntime } from '~/utils/script-runtime'
import { generateImage } from '~/server/utils/image-gen'

/**
 * Portrait de PNJ, généré dans la palette de la scène en cours.
 *
 * Comme /api/scene/image, cette route n'accepte pas de prompt libre : elle
 * réassemble le gabarit du script à partir de l'apparence et de la palette.
 */
export default defineEventHandler(async (event): Promise<SceneImageResponse> => {
  const config = useRuntimeConfig()
  const body = await readBody<{
    sceneId?: string
    appearance: string
    palette: ScenePalette
  }>(event)

  if (!body?.appearance || !body?.palette) {
    throw createError({ statusCode: 400, statusMessage: 'Champs requis : appearance, palette' })
  }

  const runtime = await ScriptRuntime.load()
  const scene = runtime.scene(body.sceneId)

  const prompt = scene.buildPortraitPrompt({
    appearance: body.appearance,
    palette: body.palette,
  })

  const openai = new OpenAI({ apiKey: config.openaiApiKey })

  try {
    return await generateImage(openai, scene.artDirection, prompt)
  } catch (err) {
    throw createError({
      statusCode: 502,
      statusMessage: err instanceof Error ? err.message : scene.fallbacks.image_error,
    })
  }
})
