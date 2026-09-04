import type { SceneNPC, TurnContext, TurnMode, LockResponse, TurnUsage } from '~/types/scene'
import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { resolveLocally, buildGuidance } from '~/utils/scene-oracle'

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
      theme: scene.theme ?? null,
      key_item: scene.key_item ?? null,
      has_key_item: gameStore.hasKeyItem,
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
          turnCount: gameStore.turnCount,
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
            const parsed = JSON.parse(data) as { text?: string; usage?: TurnUsage }
            if (parsed.text) {
              gameStore.updateLastNarrativeEntry(parsed.text)
              fullText += parsed.text
            }
            if (parsed.usage) {
              const pacing = playerStore.scene?.pacing
              gameStore.recordSpend(
                parsed.usage.prompt_tokens,
                parsed.usage.completion_tokens,
                pacing?.price_input_per_1m_usd ?? 0,
                pacing?.price_output_per_1m_usd ?? 0
              )
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

  /**
   * Le détenteur remet-il l'objet à ce tour ?
   *
   * La remise est décidée ici, pas par le modèle : on compte les échanges avec
   * le bon personnage. Sinon elle dépendrait du bon vouloir de la génération,
   * et la sortie pourrait rester fermée indéfiniment.
   */
  function isHandoverTurn(npc?: SceneNPC): boolean {
    const item = playerStore.scene?.key_item
    if (!item || !npc || gameStore.hasKeyItem) return false
    if (npc.id !== item.npc_id) return false
    return gameStore.keyItemExchanges + 1 >= item.exchanges_before_handover
  }

  /** Joue un tour à partir d'une commande déjà inscrite dans l'historique. */
  async function runTurn(input: string, mode?: TurnMode) {
    // Une relance vers la sortie est narrée, jamais jouée par un PNJ.
    const narrated = mode === 'exit_nudge' || mode === 'blocked_exit'
    const npc = narrated ? undefined : findAddressedNpc(input)
    gameStore.setActiveNpc(npc?.id ?? null)

    const item = playerStore.scene?.key_item
    const handover = !mode && isHandoverTurn(npc)
    const effectiveMode: TurnMode | undefined = handover ? 'handover' : mode

    if (npc) gameStore.recordNpcTalk(npc.id)
    if (npc && item && npc.id === item.npc_id && !gameStore.hasKeyItem) {
      gameStore.recordKeyItemExchange()
    }

    gameStore.recordModelTurn()
    const text = await streamTurn(input, npc, effectiveMode)
    if (!text) return

    gameStore.incrementTurn(input, text)

    // La remise n'est actée qu'une fois la réplique arrivée : sinon le joueur
    // verrait l'objet apparaître avant qu'on lui explique pourquoi.
    if (handover && item) {
      gameStore.receiveKeyItem()
      gameStore.addNarrativeEntry('system', `Tu tiens maintenant ${item.name}.`)
    }

    await lockIfOverstayed()
  }

  /**
   * Le joueur n'est jamais sorti : au seuil du script, la partie se ferme.
   *
   * Le tour vient d'être joué et reste lisible à l'écran ; c'est l'écran de
   * blocage qui prend la main juste après, avec le constat et le rappel.
   */
  async function lockIfOverstayed() {
    const scene = playerStore.scene
    const limit = scene?.pacing?.lock_after_turns
    if (!scene || !limit || gameStore.turnCount < limit) return
    if (gameStore.currentScreen !== 'playing') return

    const context = buildContext()
    if (!context) return

    try {
      const verdict = await $fetch<LockResponse>('/api/narrative/lock', {
        method: 'POST',
        body: {
          sceneId: scene.scene_id,
          context,
          turnCount: gameStore.turnCount,
          history: gameStore.conversationHistory,
        },
      })
      gameStore.lockGame(verdict.verdict, verdict.recap)
    } catch {
      // Un verdict manquant ne doit pas laisser le joueur tourner en rond :
      // on ferme quand même, avec le texte de porte du script.
      gameStore.lockGame(scene.paywall.gate_text, [])
    }
  }

  /**
   * Répond sans appeler le modèle, puis rend la réponse comme un tour normal.
   *
   * La scène générée contient déjà les descriptions du décor, ce que sait
   * chaque personnage et l'état de la quête : les ressortir ne justifie pas
   * une facturation.
   */
  function answerLocally(input: string, text: string, npcName?: string) {
    gameStore.addNarrativeEntry(npcName ? 'npc_speech' : 'narration', text, npcName)
    gameStore.incrementTurn(input, text)
    gameStore.setPlayingSubState('awaiting_input')
  }

  async function handlePlayerInput(input: string, mode?: TurnMode) {
    gameStore.addNarrativeEntry('player_command', input)
    gameStore.setLastCommand(input)
    gameStore.setLastMode(mode ?? null)

    const scene = playerStore.scene
    const state = { hasKeyItem: gameStore.hasKeyItem, talkedToNpcIds: gameStore.talkedToNpcIds }

    if (scene && !mode) {
      const npc = findAddressedNpc(input)
      // La remise de l'objet est le dénouement : elle passe toujours par le
      // modèle, quel qu'en soit le coût, sinon la scène n'a plus de sortie.
      const isHandover = isHandoverTurn(npc)

      if (!isHandover) {
        const local = resolveLocally(input, scene, state)
        if (local) {
          answerLocally(input, local.text, local.npcName)
          await lockIfOverstayed()
          return
        }

        // Autonomie : au premier des deux plafonds atteint. Le compte de tours
        // mord en pratique ; le budget en dollars n'est qu'un filet si les
        // prompts venaient à grossir.
        const pacing = scene.pacing
        const capReached = pacing?.hard_turn_cap > 0 && gameStore.modelTurnsUsed >= pacing.hard_turn_cap
        const budgetReached = pacing?.budget_usd > 0 && gameStore.spentUsd >= pacing.budget_usd
        if (capReached || budgetReached) {
          const notice = pacing.autonomous_notice
          answerLocally(input, `${notice}\n\n${buildGuidance(scene, state)}`)
          await lockIfOverstayed()
          return
        }
      }
    }

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
