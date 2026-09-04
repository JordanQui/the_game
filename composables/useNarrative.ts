import type { SceneNPC, TurnContext, TurnMode } from '~/types/scene'
import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'

/** Durée totale au-delà de laquelle on considère le tour perdu. */
const TURN_TIMEOUT_MS = 60_000
/** Silence toléré entre deux fragments avant de déclarer le flux mort. */
const STALL_TIMEOUT_MS = 20_000

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

  async function streamTurn(input: string, npc?: SceneNPC, mode?: TurnMode): Promise<string> {
    const context = buildContext()
    if (!context) return ''

    gameStore.clearTurnError()
    gameStore.setPlayingSubState(npc ? 'npc_dialogue' : 'narrative_streaming')
    gameStore.addNarrativeEntry(npc ? 'npc_speech' : 'narration', '', npc?.name)

    const controller = new AbortController()
    const overall = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS)

    // Relancé à chaque fragment reçu : coupe un flux qui reste muet.
    let stall: ReturnType<typeof setTimeout> | null = null
    const resetStall = () => {
      if (stall) clearTimeout(stall)
      stall = setTimeout(() => controller.abort(), STALL_TIMEOUT_MS)
    }

    let fullText = ''

    try {
      resetStall()

      const response = await fetch('/api/narrative/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          sceneId: playerStore.scene?.scene_id,
          context,
          input,
          npcId: npc?.id,
          mode,
          history: gameStore.conversationHistory,
        }),
      })

      if (!response.ok || !response.body) {
        throw new Error(`Le serveur a répondu ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        resetStall()

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

      // Un flux qui se termine sans un mot est un échec, pas un tour vide.
      if (!fullText.trim()) throw new Error('Le narrateur est resté muet')

      gameStore.setPlayingSubState('awaiting_input')
      return fullText
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError'
      gameStore.removeLastNarrativeEntry()
      gameStore.setTurnError(
        aborted
          ? 'Le récit s\'est interrompu. Le narrateur a mis trop de temps.'
          : err instanceof Error ? err.message : 'Le récit s\'est interrompu.'
      )
      return ''
    } finally {
      clearTimeout(overall)
      if (stall) clearTimeout(stall)
    }
  }

  /** Joue un tour à partir d'une commande déjà inscrite dans l'historique. */
  async function runTurn(input: string, mode?: TurnMode) {
    // Une relance vers la sortie est narrée, jamais jouée par un PNJ.
    const npc = mode === 'exit_nudge' ? undefined : findAddressedNpc(input)
    gameStore.setActiveNpc(npc?.id ?? null)

    const text = await streamTurn(input, npc, mode)
    if (text) gameStore.incrementTurn(input, text)
  }

  async function handlePlayerInput(input: string, mode?: TurnMode) {
    gameStore.addNarrativeEntry('player_command', input)
    gameStore.setLastCommand(input)
    gameStore.setLastMode(mode ?? null)
    await runTurn(input, mode)
  }

  /** Rejoue le dernier tour sans redemander la commande au joueur. */
  async function retryLastTurn() {
    const input = gameStore.lastCommand
    if (!input) return
    await runTurn(input, gameStore.lastMode ?? undefined)
  }

  return { handlePlayerInput, retryLastTurn, streamTurn, findAddressedNpc }
}
