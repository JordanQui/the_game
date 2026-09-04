import OpenAI from 'openai'
import type { GeneratedScene } from '~/types/scene'
import type { UserProfile } from '~/types/user'
import { ScriptRuntime, loadUserFixture } from '~/utils/script-runtime'

/**
 * Phase 1 du pipeline : le texte.
 *
 * Renvoie une scène immédiatement jouable, sans attendre l'illustration.
 * Le client enchaîne ensuite sur /api/scene/image s'il en veut une.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody<{
    sceneId?: string
    /** Profil joueur. Omis en dev : on retombe sur game/user.json. */
    user?: UserProfile
  }>(event) ?? {}

  const runtime = await ScriptRuntime.load()
  const scene = runtime.scene(body.sceneId)
  const user = body.user ?? await loadUserFixture()

  const openai = new OpenAI({ apiKey: config.openaiApiKey })
  const gen = scene.generation

  const completion = await openai.chat.completions.create({
    model: gen.model,
    temperature: gen.temperature,
    max_tokens: gen.max_tokens,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: gen.system_prompt },
      { role: 'user', content: scene.buildGenerationPrompt(user) },
    ],
  })

  const raw = completion.choices[0]?.message?.content
  if (!raw) {
    throw createError({ statusCode: 502, statusMessage: `${gen.model} n'a rien renvoyé` })
  }

  let generated: GeneratedScene
  try {
    generated = JSON.parse(raw) as GeneratedScene
  } catch {
    throw createError({ statusCode: 502, statusMessage: `${gen.model} a renvoyé un JSON invalide` })
  }

  try {
    scene.assertValid(generated)
  } catch (err) {
    throw createError({
      statusCode: 502,
      statusMessage: err instanceof Error ? err.message : 'Scène invalide',
    })
  }

  return scene.assembleText(generated)
})
