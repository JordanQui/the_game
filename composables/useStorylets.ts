import type { Qualities, StoryletEffect } from '~/utils/storylets'
import { draw } from '~/utils/storylets'
import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { useNarrative } from '~/composables/useNarrative'
import { usePaywall } from '~/composables/usePaywall'
import { useSceneCommands } from '~/composables/useSceneCommands'
import { resolveLocally, buildGuidance } from '~/utils/scene-oracle'
import { matchesKeyword } from '~/utils/text-match'

/**
 * Le seul chemin par lequel une saisie entre dans le jeu.
 *
 * Deux responsabilités, et pas une de plus : décanter l'état du monde en
 * qualités — ce que fait `snapshot()` —, puis exécuter le moment que le deck a
 * tiré. Aucune priorité ne se décide ici : elle est dans `utils/storylets.ts`,
 * en clair, dans l'ordre du tableau.
 *
 * Le lexique du monde reste dans script.json : les mots de la sortie, les
 * seuils de relance et de dénouement sont lus sur la scène, jamais écrits ici.
 */
export function useStorylets() {
  const gameStore = useGameStore()
  const playerStore = usePlayerStore()
  const { runTurn, findAddressedNpc, addressesNobody, answerLocally } = useNarrative()
  const { openExit } = usePaywall()
  const { isCommand, run: runSceneCommand } = useSceneCommands()

  /** Ce que l'oracle et le récapitulatif ont besoin de savoir du joueur. */
  function oracleState() {
    return { hasKeyItem: gameStore.hasKeyItem, talkedToNpcIds: gameStore.talkedToNpcIds }
  }

  /**
   * L'état du monde, aplati.
   *
   * Tout ce qui relève du texte — mots de la sortie, personnage interpellé,
   * réponse déjà écrite — est résolu ICI, une fois, et n'existe plus ensuite
   * que sous forme de booléens. C'est ce qui permet au deck de n'avoir aucune
   * dépendance et de se tester seul.
   */
  function snapshot(input: string): Qualities {
    const scene = playerStore.scene
    const item = scene?.key_item ?? null
    const pacing = scene?.pacing
    const npc = scene ? findAddressedNpc(input) : undefined

    // Les deux plafonds : le compte de tours mord en pratique, le budget en
    // dollars n'est qu'un filet si les prompts venaient à grossir.
    const capReached = (pacing?.hard_turn_cap ?? 0) > 0
      && gameStore.modelTurnsUsed >= pacing!.hard_turn_cap
    const budgetReached = (pacing?.budget_usd ?? 0) > 0
      && gameStore.spentUsd >= pacing!.budget_usd

    return {
      isCommand: isCommand(input),

      turn: gameStore.turnCount,

      mentionsExit: scene ? matchesKeyword(input, scene.paywall.exit_keywords) : false,
      exitOpensAtTurn: scene?.paywall.min_turns_before_trigger ?? 0,

      addressesNobody: scene ? addressesNobody(input) : false,
      addressesHolder: Boolean(npc && item && npc.id === item.npc_id),

      sceneHasKeyItem: Boolean(item),
      hasKeyItem: gameStore.hasKeyItem,
      pendingKeyItem: gameStore.pendingKeyItem,
      informed: gameStore.informedAboutItem,
      holderExchanges: gameStore.keyItemExchanges + 1,
      exchangesBeforeHandover: item?.exchanges_before_handover ?? 0,

      resolved: gameStore.resolved,
      resolutionAtTurn: pacing?.resolution_after_turns ?? 0,

      localAnswer: scene ? resolveLocally(input, scene, oracleState()) : null,
      canCallModel: !capReached && !budgetReached,
    }
  }

  /** Le texte d'une réponse qui ne passe pas par le modèle. */
  function localText(say: 'oracle' | 'nobody' | 'exhausted', q: Qualities): string {
    const scene = playerStore.scene
    if (say === 'oracle') return q.localAnswer?.text ?? ''
    if (say === 'nobody') {
      return "Tu ne connais pas encore son nom. L'oeil, en haut à droite, lit les identités."
    }
    const notice = scene?.pacing?.autonomous_notice ?? ''
    return scene ? `${notice}\n\n${buildGuidance(scene, oracleState())}` : notice
  }

  /**
   * Joue une saisie : on tire, on exécute.
   *
   * Le tirage lui-même est gratuit — dix prédicats sur des booléens. Seul le
   * moment `model` déclenche un appel facturé, et il n'est atteint que si
   * aucun des moments locaux ne l'a coiffé.
   */
  async function play(input: string): Promise<void> {
    const q = snapshot(input)
    const moment = draw(q)

    // Le canal '#' inscrit lui-même la commande au fil : il ne passe pas par
    // le monde, il parle au scénario.
    if (moment.play.kind === 'command') {
      runSceneCommand(input)
      return
    }

    gameStore.addNarrativeEntry('player_command', input)

    if (moment.play.kind === 'exit') {
      const gate = playerStore.scene?.paywall.gate_text
      if (gate) gameStore.addNarrativeEntry('narration', gate)
      setTimeout(openExit, 1400)
      return
    }

    if (moment.play.kind === 'local') {
      // Une réponse anonyme ne consomme pas de tour : le joueur n'a rien joué,
      // il lui manque un outil.
      if (moment.play.say === 'nobody') {
        gameStore.addNarrativeEntry('system', localText('nobody', q))
        gameStore.setPlayingSubState('awaiting_input')
        return
      }
      answerLocally(input, localText(moment.play.say, q), q.localAnswer?.npcName)
      return
    }

    await runTurn(input, moment.play.mode, moment.after ?? ([] as StoryletEffect[]))
  }

  return { play, snapshot }
}
