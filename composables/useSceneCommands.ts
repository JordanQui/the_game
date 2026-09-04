import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { usePaywall } from '~/composables/usePaywall'

/**
 * Canal direct vers le scénario.
 *
 * Tout ce qui commence par '#' court-circuite le modèle : la saisie ne part
 * jamais chez gpt-4o, on agit directement sur la machine à états. Ça permet
 * d'atteindre une étape sans jouer les tours qui y mènent — et ça ne coûte
 * pas un token.
 *
 * Pour ajouter une commande, il suffit d'une entrée de plus dans `commands`.
 */

const PREFIX = '#'

export interface SceneCommand {
  /** Le mot tapé après le '#', en minuscules. */
  name: string
  /** Une ligne, affichée par #aide. */
  help: string
  run: () => void
}

export function useSceneCommands() {
  const gameStore = useGameStore()
  const playerStore = usePlayerStore()
  const { openExit } = usePaywall()

  function say(text: string) {
    gameStore.addNarrativeEntry('system', text)
  }

  const commands: SceneCommand[] = [
    {
      name: 'sortie',
      help: 'force la porte : écran de sortie et paiement Square',
      run() {
        const gate = playerStore.scene?.paywall.gate_text
        if (!gate) {
          say('Aucune scène chargée — la porte n\'existe pas encore.')
          return
        }
        // Même mise en scène que la sortie jouée, mais sans le garde-fou du
        // nombre de tours : c'est tout l'intérêt du raccourci.
        gameStore.addNarrativeEntry('narration', gate)
        setTimeout(openExit, 1400)
      },
    },
    {
      name: 'blocage',
      help: 'force la fin de nuit : verdict et rappel de ce qu\'il fallait comprendre',
      run() {
        const scene = playerStore.scene
        if (!scene) {
          say('Aucune scène chargée.')
          return
        }
        say('Fin de nuit forcée.')
        // On passe par le même endpoint que le blocage réel : ce que tu vois
        // ici est exactement ce que verra un joueur au huitième tour.
        void $fetch<{ verdict: string; recap: string[] }>('/api/narrative/lock', {
          method: 'POST',
          body: {
            sceneId: scene.scene_id,
            context: {
              player_name: playerStore.playerName,
              place: scene.place,
              quest: scene.quest,
              npcs: scene.npcs,
            },
            turnCount: gameStore.turnCount,
            history: gameStore.conversationHistory,
          },
        })
          .then(res => gameStore.lockGame(res.verdict, res.recap))
          .catch(() => gameStore.lockGame(scene.paywall.gate_text, []))
      },
    },
    {
      name: 'aide',
      help: 'liste les commandes disponibles',
      run() {
        say(commands.map(c => `${PREFIX}${c.name} — ${c.help}`).join('\n'))
      },
    },
  ]

  /** Une saisie qui commence par '#' ne doit jamais atteindre le modèle. */
  function isCommand(input: string): boolean {
    return input.trim().startsWith(PREFIX)
  }

  function run(input: string): void {
    const raw = input.trim()
    const name = raw.slice(PREFIX.length).trim().toLowerCase()

    gameStore.addNarrativeEntry('player_command', raw)

    const command = commands.find(c => c.name === name)
    if (!command) {
      say(`Commande inconnue : ${PREFIX}${name || '?'} — tape ${PREFIX}aide pour la liste.`)
      return
    }

    command.run()
  }

  return { isCommand, run, commands }
}
