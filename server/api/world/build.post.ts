import OpenAI from 'openai'
import { loadColonne } from '~/utils/colonne-loader'
import { interpolate } from '~/utils/prompt-builder'
import type { GeneratedNPC, GeneratedQuest, GeneratedWorld } from '~/types/game'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody<{
    colonneId: string
    playerName: string
    lifeEventsSummary: string
    interestsAndHobbies: string
    importantLifeEvents: string
  }>(event)

  if (!body?.colonneId || !body?.playerName) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required fields' })
  }

  const colonne = await loadColonne(body.colonneId)
  const openai = new OpenAI({ apiKey: config.openaiApiKey })
  const wb = colonne.world_building
  const npcConfig = colonne.levels[0].npcs
  const questConfig = colonne.levels[0].quest

  // Run world name, NPC generation, and quest generation in parallel
  const [worldNameResult, npcsResult, questResult] = await Promise.all([
    // 1. World name
    openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: wb.system_prompt },
        { role: 'user', content: wb.world_name_prompt },
      ],
      max_tokens: 20,
    }),

    // 2. NPC generation
    openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: wb.system_prompt },
        {
          role: 'user',
          content: interpolate(npcConfig.generation_prompt, {
            player_name: body.playerName,
            interests_and_hobbies: body.interestsAndHobbies,
            npc_count: String(npcConfig.count),
          }),
        },
      ],
      max_tokens: 1200,
      response_format: { type: 'json_object' },
    }),

    // 3. Quest generation
    openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: wb.system_prompt },
        {
          role: 'user',
          content: interpolate(questConfig.generation_prompt, {
            player_name: body.playerName,
            important_life_events: body.importantLifeEvents,
          }),
        },
      ],
      max_tokens: 600,
      response_format: { type: 'json_object' },
    }),
  ])

  const worldName = worldNameResult.choices[0]?.message?.content?.trim() ?? 'Royaume des Ombres'

  // 4. World description (needs the world name from step 1)
  const worldDescResult = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: wb.system_prompt },
      {
        role: 'user',
        content: interpolate(wb.world_prompt, {
          player_name: body.playerName,
          life_events_summary: body.lifeEventsSummary,
          world_name: worldName,
        }),
      },
    ],
    max_tokens: 250,
  })

  const worldDescription = worldDescResult.choices[0]?.message?.content?.trim() ?? ''

  // Parse NPCs JSON
  let npcs: GeneratedNPC[] = []
  try {
    const raw = npcsResult.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(raw)
    npcs = Array.isArray(parsed) ? parsed : parsed.npcs ?? []
  } catch {
    npcs = []
  }

  // Parse quest JSON
  let quest: GeneratedQuest | null = null
  try {
    const raw = questResult.choices[0]?.message?.content ?? '{}'
    quest = JSON.parse(raw) as GeneratedQuest
  } catch {
    quest = null
  }

  const world: GeneratedWorld = { name: worldName, description: worldDescription }

  return { world, npcs, quest }
})
