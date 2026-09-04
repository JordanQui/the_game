import OpenAI from 'openai'
import type { TurnRequest } from '~/types/scene'
import { ScriptRuntime } from '~/utils/script-runtime'
import { buildConversationHistory } from '~/utils/prompt-builder'

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
  const scene = runtime.scene(body.sceneId)

  const npc = body.npcId && body.mode !== 'exit_nudge'
    ? body.context.npcs?.find(n => n.id === body.npcId)
    : undefined

  const openai = new OpenAI({ apiKey: config.openaiApiKey })

  const stream = await openai.chat.completions.create({
    model: scene.generation.model,
    temperature: scene.generation.temperature,
    max_tokens: scene.turn.max_tokens,
    stream: true,
    messages: [
      { role: 'system', content: scene.buildTurnSystemPrompt(body.context) },
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
