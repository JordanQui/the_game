import OpenAI from 'openai'
import type { LockRequest, LockResponse } from '~/types/scene'
import { ScriptRuntime } from '~/utils/script-runtime'
import { buildConversationHistory } from '~/utils/prompt-builder'
import { requireSecret } from '~/server/utils/runtime-secrets'
import { consumeQuota } from '~/server/utils/session-quota'

/**
 * Verdict de fin de partie : le joueur n'est jamais sorti.
 *
 * Non streamé, contrairement à un tour : c'est un écran, pas du récit, et on
 * a besoin du JSON complet avant d'afficher quoi que ce soit.
 */
export default defineEventHandler(async (event): Promise<LockResponse> => {
  const config = useRuntimeConfig()
  const body = await readBody<LockRequest & { turnCount?: number }>(event)

  if (!body?.context?.place || !body?.context?.quest) {
    throw createError({ statusCode: 400, statusMessage: 'Champs requis : context.place, context.quest' })
  }

  const runtime = await ScriptRuntime.load()
  // Quota de session : arrête l'abus par rechargement avant tout appel payant.
  const limits = runtime.script.limits
  consumeQuota(event, 'turns', limits.turns_per_session, limits.window_hours, limits.messages.turns)

  const scene = runtime.scene(body.sceneId)
  const turn = scene.turn

  const openai = new OpenAI({ apiKey: requireSecret(config.openaiApiKey, 'OPENAI_API_KEY') })

  let raw: string | undefined
  try {
    const completion = await openai.chat.completions.create({
      model: scene.generation.model,
      temperature: scene.generation.temperature,
      max_tokens: turn.max_tokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: turn.lock_system_prompt },
        ...buildConversationHistory(body.history ?? []),
        { role: 'user', content: scene.buildLockPrompt(body.context, body.turnCount ?? turn.lock_after_turns) },
      ],
    })
    raw = completion.choices[0]?.message?.content ?? undefined
  } catch (err) {
    throw createError({
      statusCode: 502,
      statusMessage: err instanceof Error ? err.message : 'Verdict indisponible',
    })
  }

  if (!raw) {
    throw createError({ statusCode: 502, statusMessage: `${scene.generation.model} n'a rien renvoyé` })
  }

  let parsed: Partial<LockResponse>
  try {
    parsed = JSON.parse(raw) as Partial<LockResponse>
  } catch {
    throw createError({ statusCode: 502, statusMessage: `${scene.generation.model} a renvoyé un JSON invalide` })
  }

  // L'écran doit s'afficher même si le modèle a oublié un champ : il ferme la
  // partie, on ne peut pas le laisser échouer sur une clé manquante.
  return {
    verdict: parsed.verdict?.trim() || scene.fallbacks.narrative_error,
    recap: Array.isArray(parsed.recap) && parsed.recap.length
      ? parsed.recap.filter(line => typeof line === 'string' && line.trim()).slice(0, 4)
      : [],
  }
})
