import OpenAI from 'openai'
import type { SceneImageRequest, SceneImageResponse } from '~/types/scene'
import { ScriptRuntime } from '~/utils/script-runtime'
import { generateImage } from '~/server/utils/image-gen'
import { requireSecret } from '~/server/utils/runtime-secrets'
import { consumeQuota } from '~/server/utils/session-quota'
import { mockKey, readMock, writeMock, wantsFresh } from '~/server/utils/dev-mocks'

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

  // Illustration figée : on sort AVANT le quota comme avant le client OpenAI.
  // Elle ne coûte rien, elle ne doit donc rien consommer — sinon un quota
  // d'images à zéro empêcherait d'afficher l'auberge, qui est pourtant gratuite.
  if (scene.staticImage) {
    return {
      image: scene.staticImage,
      model: 'static',
      format: 'png',
      bytes: 0,
      elapsed_ms: 0,
    }
  }

  // Même rejeu qu'en texte : une image coûte 6,5 centimes, la régénérer à
  // chaque relance du serveur est la dépense la plus inutile du projet.
  const key = mockKey(scene.id, `${body.place_name}|${body.palette.accent.hex}`)
  if (import.meta.dev && !wantsFresh(event)) {
    const cached = await readMock<SceneImageResponse>('image', key)
    if (cached) return cached
  }

  // Quota de session : seule une génération réelle est décomptée.
  consumeQuota(event, 'images', runtime.script.limits)

  const prompt = scene.buildImagePrompt({
    place_name: body.place_name,
    palette: body.palette,
    decor: body.decor,
  })

  const openai = new OpenAI({ apiKey: requireSecret(config.openaiApiKey, 'OPENAI_API_KEY') })

  try {
    const result = await generateImage(openai, scene.artDirection, prompt)
    await writeMock('image', key, result)
    return result
  } catch (err) {
    throw createError({
      statusCode: 502,
      statusMessage: err instanceof Error ? err.message : scene.fallbacks.image_error,
    })
  }
})
