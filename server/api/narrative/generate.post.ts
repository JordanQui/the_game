import OpenAI from 'openai'
import { loadColonne } from '~/utils/colonne-loader'
import { interpolate } from '~/utils/prompt-builder'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody<{
    colonneId: string
    promptPath: string
    variables: Record<string, string>
    systemPrompt?: string
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
    stream?: boolean
    maxTokens?: number
  }>(event)

  if (!body?.colonneId || !body?.promptPath) {
    throw createError({ statusCode: 400, statusMessage: 'Missing colonneId or promptPath' })
  }

  const colonne = await loadColonne(body.colonneId)

  // Get the prompt template by dot-path
  const parts = body.promptPath.split('.')
  let current: unknown = colonne
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      throw createError({ statusCode: 400, statusMessage: `Invalid promptPath: ${body.promptPath}` })
    }
    const idx = parseInt(part, 10)
    current = isNaN(idx)
      ? (current as Record<string, unknown>)[part]
      : (current as unknown[])[idx]
  }

  if (typeof current !== 'string') {
    throw createError({ statusCode: 400, statusMessage: `promptPath does not resolve to a string` })
  }

  const userPrompt = interpolate(current, body.variables ?? {})
  const systemPrompt = body.systemPrompt
    ? interpolate(body.systemPrompt, body.variables ?? {})
    : interpolate(colonne.world_building.system_prompt, body.variables ?? {})

  const openai = new OpenAI({ apiKey: config.openaiApiKey })

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...(body.conversationHistory ?? []),
    { role: 'user', content: userPrompt },
  ]

  if (body.stream) {
    setResponseHeader(event, 'Content-Type', 'text/event-stream')
    setResponseHeader(event, 'Cache-Control', 'no-cache')
    setResponseHeader(event, 'Connection', 'keep-alive')

    const stream = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: body.maxTokens ?? 300,
      stream: true,
    })

    return sendStream(event, async (writer) => {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) {
          writer.write(`data: ${JSON.stringify({ text: delta })}\n\n`)
        }
      }
      writer.write('data: [DONE]\n\n')
      writer.close()
    })
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    max_tokens: body.maxTokens ?? 300,
  })

  return { text: completion.choices[0]?.message?.content ?? '' }
})
