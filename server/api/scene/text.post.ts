import OpenAI from 'openai'
import type { GeneratedScene, SceneTextResponse } from '~/types/scene'
import type { UserProfile } from '~/types/user'
import { ScriptRuntime, loadUserFixture, resolveTheme } from '~/utils/script-runtime'
import { requireSecret } from '~/server/utils/runtime-secrets'
import { consumeQuota } from '~/server/utils/session-quota'
import { mockKey, readMock, writeMock, wantsFresh, scriptFingerprint } from '~/server/utils/dev-mocks'

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
  consumeQuota(event, 'scenes', limits)

  const scene = runtime.scene(body.sceneId)
  const user = body.user ?? await loadUserFixture()

  // En développement, on rejoue la dernière scène enregistrée plutôt que de
  // repayer la même génération à chaque relance. `?fresh=1` la renouvelle.
  const key = mockKey(scene.id, `${user.identity.name}|${user.identity.birthday ?? ''}`, scriptFingerprint(runtime.script))
  if (import.meta.dev && !wantsFresh(event)) {
    const cached = await readMock<SceneTextResponse>('scene', key)
    if (cached) return cached
  }

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

  const assembled = scene.assembleText(generated, resolveTheme(user, runtime.script))
  await writeMock('scene', key, assembled)
  return assembled
})
