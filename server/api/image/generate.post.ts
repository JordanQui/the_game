import OpenAI from 'openai'
import { interpolate } from '~/utils/prompt-builder'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody<{
    prompt: string
    style?: string
    negativePrompt?: string
    variables?: Record<string, string>
  }>(event)

  if (!body?.prompt) {
    throw createError({ statusCode: 400, statusMessage: 'Missing prompt' })
  }

  const openai = new OpenAI({ apiKey: config.openaiApiKey })

  const finalPrompt = body.variables
    ? interpolate(body.prompt, body.variables)
    : body.prompt

  const fullPrompt = body.style
    ? `${finalPrompt}. Style: ${body.style}`
    : finalPrompt

  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt: fullPrompt,
    n: 1,
    size: '1792x1024',
    quality: 'standard',
    style: 'vivid',
  })

  const url = response.data[0]?.url
  if (!url) {
    throw createError({ statusCode: 502, statusMessage: 'No image URL returned from DALL-E' })
  }

  return { url }
})
