import type { SceneNPC, TurnContext } from '~/types/scene'
import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'

/**
 * Un tour de jeu. Le prompt système est bâti côté serveur depuis script.json ;
 * on n'envoie ici que les faits de la scène courante.
 */
export function useNarrative() {
  const gameStore = useGameStore()
  const playerStore = usePlayerStore()

  function buildContext(): TurnContext | null {
    const scene = playerStore.scene
    if (!scene) return null
    return {
      player_name: playerStore.playerName,
      place: scene.place,
      quest: scene.quest,
      npcs: scene.npcs,
    }
  }

  /** Trouve le PNJ interpellé par son prénom. */
  function findAddressedNpc(input: string): SceneNPC | undefined {
    const lower = input.toLowerCase()
    return playerStore.npcs.find(npc =>
      npc.name.split(' ').some(part => part.length > 2 && lower.includes(part.toLowerCase()))
    )
  }

  async function streamTurn(input: string, npc?: SceneNPC): Promise<string> {
    const context = buildContext()
    if (!context) return ''

    gameStore.setPlayingSubState(npc ? 'npc_dialogue' : 'narrative_streaming')
    gameStore.addNarrativeEntry(npc ? 'npc_speech' : 'narration', '', npc?.name)

    let fullText = ''

    try {
      const response = await fetch('/api/narrative/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneId: playerStore.scene?.scene_id,
          context,
          input,
          npcId: npc?.id,
          history: gameStore.conversationHistory,
        }),
      })

      if (!response.ok || !response.body) throw new Error('stream indisponible')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // Un chunk réseau peut couper une ligne SSE en deux.
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data) as { text?: string }
            if (parsed.text) {
              gameStore.updateLastNarrativeEntry(parsed.text)
              fullText += parsed.text
            }
          } catch { /* fragment incomplet, ignoré */ }
        }
      }
    } catch {
      const fallback = 'L\'aubergiste te regarde sans comprendre. « Répète un peu ça, voyageur. »'
      gameStore.updateLastNarrativeEntry(fallback)
      fullText = fallback
    } finally {
      gameStore.setPlayingSubState('awaiting_input')
    }

    return fullText
  }

  async function handlePlayerInput(input: string) {
    gameStore.addNarrativeEntry('player_command', input)

    const npc = findAddressedNpc(input)
    gameStore.setActiveNpc(npc?.id ?? null)

    const text = await streamTurn(input, npc)
    gameStore.incrementTurn(input, text)
  }

  return { handlePlayerInput, streamTurn, findAddressedNpc }
}
