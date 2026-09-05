import type { SceneNPC, TurnContext, TurnMode, TurnUsage } from '~/types/scene'
import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { resolveLocally, buildGuidance } from '~/utils/scene-oracle'
import { normalize } from '~/utils/text-match'

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
      informed_about_item: gameStore.informedAboutItem,
    }
  }

  /**
   * Le contexte, complété du compteur d'échanges avec CE personnage.
   *
   * Il ne peut pas vivre dans `buildContext()`, qui ne sait pas à qui l'on
   * parle : c'est au moment d'envoyer le tour qu'on connaît l'interlocuteur.
   */
  function contextFor(npc?: SceneNPC): TurnContext | null {
    const ctx = buildContext()
    if (!ctx) return null
    return { ...ctx, npc_exchanges: npc ? gameStore.npcExchanges[npc.id] ?? 0 : 0 }
  }

  /**
   * Trouve le personnage interpellé.
   *
   * Le prénom d'abord, puis le rôle : « je parle au barman » doit fonctionner
   * autant que « parler à Leo ». Sans ça, une commande adressée à quelqu'un
   * partait en narration d'ambiance et aucun personnage ne répondait jamais —
   * la chaîne informateur puis détenteur ne pouvait pas s'ouvrir.
   */
  function findAddressedNpc(input: string): SceneNPC | undefined {
    const text = normalize(input)
    const npcs = playerStore.npcs

    // UNIQUEMENT le nom. Reconnaître l'archétype — « je parle au barman » —
    // rouvrirait une porte dérobée : on pourrait jouer sans jamais déchiffrer
    // une identité, et l'oeil bionique ne servirait plus à rien.
    return npcs.find(npc =>
      normalize(npc.name).split(' ').some(part => part.length > 2 && text.includes(part))
    )
  }

  /** Verbes par lesquels on s'adresse à quelqu'un. */
  const ADDRESS_VERBS = ['parle', 'parler', 'demande', 'demander', 'interroge', 'interroger',
    'aborde', 'aborder', 'dis', 'dire', 'salue', 'saluer', 'questionne', 'questionner']

  /** Le joueur s'adresse à quelqu'un sans le nommer : il lui manque l'outil. */
  function addressesNobody(input: string): boolean {
    const text = normalize(input)
    if (findAddressedNpc(input)) return false
    return ADDRESS_VERBS.some(v => text.includes(v))
  }

  async function streamTurn(input: string, npc?: SceneNPC, mode?: TurnMode): Promise<string> {
    const context = contextFor(npc)
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
    if (!item || !npc || gameStore.hasKeyItem || gameStore.pendingKeyItem) return false
    // Le détenteur ne cède rien tant qu'un autre habitué n'a pas mis sur la piste.
    if (!gameStore.informedAboutItem) return false
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

    // Au seuil du script, la salle vient au joueur : les personnages disent ce
    // qu'ils savent et posent l'objet devant lui. Ce n'est pas une fin de
    // partie, c'est le moment où le monde arrête de résister.
    const resolving = !mode && !handover && needsResolution()
    const effectiveMode: TurnMode | undefined =
      resolving ? 'resolution' : handover ? 'handover' : mode

    if (npc) gameStore.recordNpcTalk(npc.id)

    // Parler à l'informateur ouvre la chaîne — mais pas au premier bonjour. Il
    // faut lui avoir parlé deux ou trois fois : avant, il jauge, et il ne
    // nomme personne.
    const beforeSteer = playerStore.scene?.pacing?.exchanges_before_steer ?? 2
    if (npc && item && npc.id === item.informant_npc_id && !gameStore.informedAboutItem
      && (gameStore.npcExchanges[npc.id] ?? 0) >= beforeSteer) {
      gameStore.markInformedAboutItem()
    }

    // L'aide active fait venir l'informateur au joueur et lui fait nommer le
    // détenteur. Sans ce relais, l'état n'avancerait que si le joueur pensait
    // à l'interpeller : il se ferait aborder en boucle sans jamais progresser.
    const steerFrom = playerStore.scene?.pacing?.steer_after_turns
    if (item && !gameStore.informedAboutItem && steerFrom && gameStore.turnCount >= steerFrom + 2) {
      gameStore.markInformedAboutItem()
    }

    // Les échanges ne comptent qu'une fois la piste connue : avant, le
    // détenteur ne parle pas de l'objet, ça ne fait pas avancer.
    if (npc && item && npc.id === item.npc_id && gameStore.informedAboutItem && !gameStore.hasKeyItem) {
      gameStore.recordKeyItemExchange()
    }

    gameStore.recordModelTurn()
    const text = await streamTurn(input, npc, effectiveMode)
    if (!text) return

    gameStore.incrementTurn(input, text)

    // L'objet est TENDU, pas donné : le joueur doit le prendre lui-même. Un
    // objet qui apparaît tout seul dans l'inventaire ne se remarque pas.
    if (handover && item) {
      gameStore.offerKeyItem()
    }

    if (resolving && item) {
      gameStore.markResolved()
      gameStore.markInformedAboutItem()
      if (!gameStore.hasKeyItem) gameStore.offerKeyItem()
    }

  }

  /** Le joueur a-t-il atteint le seuil où la scène se dénoue d'elle-même ? */
  function needsResolution(): boolean {
    const scene = playerStore.scene
    const at = scene?.pacing?.resolution_after_turns
    if (!scene?.key_item || !at || gameStore.resolved) return false
    if (gameStore.hasKeyItem || gameStore.pendingKeyItem) return false
    return gameStore.turnCount + 1 >= at
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

    // Il veut parler à quelqu'un mais n'a nommé personne : on le renvoie vers
    // l'oeil plutôt que de dépenser un tour en narration d'ambiance.
    if (scene && !mode && addressesNobody(input)) {
      gameStore.addNarrativeEntry(
        'system',
        "Tu ne connais pas encore son nom. L'oeil, en haut à droite, lit les identités."
      )
      gameStore.setPlayingSubState('awaiting_input')
      return
    }

    if (scene && !mode) {
      const npc = findAddressedNpc(input)
      // La remise de l'objet est le dénouement : elle passe toujours par le
      // modèle, quel qu'en soit le coût, sinon la scène n'a plus de sortie.
      const isHandover = isHandoverTurn(npc)

      if (!isHandover) {
        const local = resolveLocally(input, scene, state)
        if (local) {
          answerLocally(input, local.text, local.npcName)
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
