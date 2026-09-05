import type { SceneNPC, TurnContext, TurnMode, TurnUsage } from '~/types/scene'
import type { StoryletEffect } from '~/utils/storylets'
import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { normalize } from '~/utils/text-match'

/** Durée totale au-delà de laquelle on considère le tour perdu. */
const TURN_TIMEOUT_MS = 60_000
/** Silence toléré entre deux fragments avant de déclarer le flux mort. */
const STALL_TIMEOUT_MS = 20_000

/**
 * Un tour de jeu, et lui seul.
 *
 * Ce composable ne décide plus de CE QUI doit être joué — c'est le rôle du
 * deck, dans `utils/storylets.ts`, tiré par `useStorylets`. Il reçoit un mode
 * déjà choisi et se charge du reste : trouver l'interlocuteur, tenir les
 * compteurs qui font avancer la chaîne de l'objet, streamer, appliquer les
 * effets du moment.
 *
 * Le prompt système est bâti côté serveur depuis script.json ; on n'envoie ici
 * que les faits de la scène courante.
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
   * Applique ce que le moment tiré change dans l'état.
   *
   * Toujours APRÈS le tour, jamais avant : un tour qui échoue ne doit pas
   * laisser derrière lui un objet tendu que personne n'a jamais offert.
   */
  function applyEffects(effects: StoryletEffect[]) {
    for (const effect of effects) {
      // L'objet est TENDU, pas donné : le joueur doit le prendre lui-même. Un
      // objet qui apparaît tout seul dans l'inventaire ne se remarque pas.
      if (effect === 'offer_key_item' && !gameStore.hasKeyItem) gameStore.offerKeyItem()
    }
  }

  /**
   * Joue un tour facturé.
   *
   * `mode` et `after` viennent du deck. Ce qui reste ici est la comptabilité
   * du monde : elle s'applique à CHAQUE tour, quel que soit le moment tiré,
   * et c'est elle qui fait mûrir les qualités que le deck relira au tour
   * suivant.
   */
  async function runTurn(input: string, mode?: TurnMode, after: StoryletEffect[] = []) {
    // Retenus pour la relance : un tour qui a échoué se rejoue à l'identique,
    // effets compris — sinon une remise ratée laisserait la scène sans sortie.
    gameStore.setLastCommand(input)
    gameStore.setLastMode(mode ?? null)
    gameStore.setLastEffects(after)

    // Une relance vers la sortie est narrée, jamais jouée par un PNJ.
    const narrated = mode === 'exit_nudge' || mode === 'blocked_exit'
    const npc = narrated ? undefined : findAddressedNpc(input)
    gameStore.setActiveNpc(npc?.id ?? null)

    const item = playerStore.scene?.key_item

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
    const text = await streamTurn(input, npc, mode)
    if (!text) return

    gameStore.incrementTurn(input, text)
    applyEffects(after)
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

  /** Rejoue le dernier tour sans redemander la commande au joueur. */
  async function retryLastTurn() {
    const input = gameStore.lastCommand
    if (!input) return
    await runTurn(input, gameStore.lastMode ?? undefined, gameStore.lastEffects)
  }

  return { runTurn, retryLastTurn, answerLocally, streamTurn, findAddressedNpc, addressesNobody }
}
