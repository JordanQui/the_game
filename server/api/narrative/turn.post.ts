import OpenAI from 'openai'
import type { TurnRequest } from '~/types/scene'
import { ScriptRuntime } from '~/utils/script-runtime'
import { buildConversationHistory } from '~/utils/prompt-builder'
import { requireSecret } from '~/server/utils/runtime-secrets'
import { assertNotLocked, consumeQuota } from '~/server/utils/session-quota'

/**
 * Un tour de jeu, en streaming SSE.
 *
 * Le prompt système est reconstruit ici depuis le script : le client fournit
 * les faits de sa scène (lieu, quête, PNJ), jamais d'instruction au modèle.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody<TurnRequest>(event)

  if (!body?.input || !body?.context?.place || !body?.context?.quest) {
    throw createError({ statusCode: 400, statusMessage: 'Champs requis : input, context.place, context.quest' })
  }

  const runtime = await ScriptRuntime.load()
  // Quota de session : arrête l'abus par rechargement avant tout appel payant.
  const limits = runtime.script.limits
  assertNotLocked(event)
  consumeQuota(event, 'turns', limits)

  const scene = runtime.scene(body.sceneId)

  const npc = body.npcId && body.mode !== 'exit_nudge'
    ? body.context.npcs?.find(n => n.id === body.npcId)
    : undefined

  const openai = new OpenAI({ apiKey: requireSecret(config.openaiApiKey, 'OPENAI_API_KEY') })

  const stream = await openai.chat.completions.create({
    model: scene.generation.model,
    temperature: scene.generation.temperature,
    max_tokens: scene.turn.max_tokens,
    stream: true,
    // Sans ça le décompte serait une estimation : on veut les vrais chiffres.
    stream_options: { include_usage: true },
    messages: [
      { role: 'system', content: scene.buildTurnSystemPrompt(body.context, body.turnCount ?? 0) },
      ...buildConversationHistory(body.history ?? []),
      { role: 'user', content: scene.buildTurnUserPrompt(body.context, body.input, npc, body.mode) },
    ],
  })

  setResponseHeader(event, 'Content-Type', 'text/event-stream')
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  setResponseHeader(event, 'Connection', 'keep-alive')
  setResponseHeader(event, 'X-Accel-Buffering', 'no')

  const encoder = new TextEncoder()

  // h3 attend un vrai stream : lui passer une fonction lève « Invalid stream provided ».
  const sse = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))

      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content
          if (delta) send({ text: delta })

          // OpenAI place l'usage dans un dernier chunk, sans contenu.
          if (chunk.usage) {
            send({
              usage: {
                prompt_tokens: chunk.usage.prompt_tokens,
                completion_tokens: chunk.usage.completion_tokens,
              },
            })
          }
        }
      } catch {
        send({ text: scene.fallbacks.narrative_error })
      }

      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return sendStream(event, sse)
})
