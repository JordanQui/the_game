import OpenAI from 'openai'
import type { GeneratedScene } from '~/types/scene'
import type { UserProfile } from '~/types/user'
import { ScriptRuntime, loadUserFixture, resolveTheme } from '~/utils/script-runtime'
import { requireSecret } from '~/server/utils/runtime-secrets'
import { consumeQuota } from '~/server/utils/session-quota'

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
  // Quota de session : arrête l'abus par rechargement avant tout appel payant.
  const limits = runtime.script.limits
  consumeQuota(event, 'scenes', limits.scenes_per_session, limits.window_hours, limits.messages.scenes)

  const scene = runtime.scene(body.sceneId)
  const user = body.user ?? await loadUserFixture()

  const openai = new OpenAI({ apiKey: requireSecret(config.openaiApiKey, 'OPENAI_API_KEY') })
  const gen = scene.generation

  let completion
  try {
    completion = await openai.chat.completions.create({
      model: gen.model,
      temperature: gen.temperature,
      max_tokens: gen.max_tokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: gen.system_prompt },
        { role: 'user', content: scene.buildGenerationPrompt(user) },
      ],
    })
  } catch (err) {
    throw createError({
      statusCode: 502,
      statusMessage: err instanceof Error ? err.message : `Appel à ${gen.model} échoué`,
    })
  }

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

  return scene.assembleText(generated, resolveTheme(user, runtime.script))
})
