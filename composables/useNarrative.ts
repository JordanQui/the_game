import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { buildSystemPrompt, buildConversationHistory } from '~/utils/prompt-builder'

export function useNarrative() {
  const gameStore = useGameStore()
  const playerStore = usePlayerStore()

  async function streamNarrative(promptPath: string, variables: Record<string, string>, npcName?: string) {
    const systemPrompt = buildSystemPrompt({
      worldSystemPrompt: 'Tu es le maître narrateur d\'un RPG médiéval-fantastique en français. Reste toujours dans le personnage.',
      playerName: playerStore.playerName,
      worldName: playerStore.world?.name ?? 'Royaume des Ombres',
      worldDescription: playerStore.world?.description ?? '',
      questTitle: playerStore.quest?.title ?? '',
      questObjective: playerStore.quest?.objective ?? '',
      npcNamesAndArchetypes: playerStore.npcNames,
    })

    gameStore.setPlayingSubState('narrative_streaming')
    const entryType = npcName ? 'npc_speech' : 'narration'
    gameStore.addNarrativeEntry(entryType, '', npcName)

    const response = await fetch('/api/narrative/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        colonneId: 'auberge_v1',
        promptPath,
        variables,
        systemPrompt,
        conversationHistory: buildConversationHistory(gameStore.conversationHistory),
        stream: true,
        maxTokens: 300,
      }),
    })

    if (!response.ok || !response.body) {
      gameStore.updateLastNarrativeEntry('Une étrange brume obscurcit les sens...')
      gameStore.setPlayingSubState('awaiting_input')
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullText = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value)
      const lines = chunk.split('\n')
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data === '[DONE]') break
          try {
            const parsed = JSON.parse(data)
            if (parsed.text) {
              gameStore.updateLastNarrativeEntry(parsed.text)
              fullText += parsed.text
            }
          } catch { /* ignore parse errors */ }
        }
      }
    }

    gameStore.setPlayingSubState('awaiting_input')
    return fullText
  }

  async function generateNonStreaming(promptPath: string, variables: Record<string, string>): Promise<string> {
    const data = await $fetch<{ text: string }>('/api/narrative/generate', {
      method: 'POST',
      body: {
        colonneId: 'auberge_v1',
        promptPath,
        variables,
        stream: false,
        maxTokens: 400,
      },
    })
    return data.text
  }

  async function handlePlayerInput(input: string) {
    const colonne = await $fetch<{ paywall_trigger: { keywords: string[]; min_turns_before_trigger: number } }>(
      '/api/colonne/triggers',
      { method: 'POST', body: { colonneId: 'auberge_v1' } }
    ).catch(() => null)

    // Add player command to history
    gameStore.addNarrativeEntry('player_command', input)

    // Check for NPC address (simple name matching)
    const addressedNpc = playerStore.npcs.find(npc =>
      input.toLowerCase().includes(npc.name.split(' ')[0].toLowerCase())
    )

    const variables: Record<string, string> = {
      player_name: playerStore.playerName,
      player_input: input,
      world_name: playerStore.world?.name ?? '',
      quest_title: playerStore.quest?.title ?? '',
    }

    if (addressedNpc) {
      gameStore.setActiveNpc(addressedNpc.id)
      gameStore.setPlayingSubState('npc_dialogue')
      await streamNarrative('levels.0.npc_dialogue.system_prompt', {
        ...variables,
        npc_name: addressedNpc.name,
        npc_archetype: addressedNpc.archetype,
        npc_backstory: addressedNpc.backstory,
        npc_personality: addressedNpc.personality,
      }, addressedNpc.name)
    } else {
      await streamNarrative('levels.0.ambient_reactions.prompt', variables)
    }

    // Check if quest should be revealed this turn
    if (!gameStore.questRevealed && gameStore.turnCount + 1 >= (colonne ? 2 : 2)) {
      gameStore.revealQuest()
      const questText = await generateNonStreaming('levels.0.quest_reveal.prompt', {
        ...variables,
        quest_title: playerStore.quest?.title ?? '',
        quest_hook: playerStore.quest?.hook ?? '',
      })
      gameStore.addNarrativeEntry('quest_reveal', questText)
    }

    const lastEntry = gameStore.narrativeHistory[gameStore.narrativeHistory.length - 1]
    gameStore.incrementTurn(input, lastEntry?.text ?? '')
  }

  return { streamNarrative, generateNonStreaming, handlePlayerInput }
}
