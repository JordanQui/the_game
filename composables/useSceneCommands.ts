import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { usePaywall } from '~/composables/usePaywall'
import { useProgression } from '~/composables/useProgression'

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
  const progression = useProgression()

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
      name: 'resolution',
      help: 'force le dénouement : les personnages viennent et tendent l\'objet',
      run() {
        const item = playerStore.scene?.key_item
        if (!item) {
          say('Aucune scène chargée.')
          return
        }
        gameStore.markResolved()
        gameStore.markInformedAboutItem()
        gameStore.offerKeyItem()
        say('Dénouement forcé.')
      },
    },
    {
      name: 'scenes',
      help: 'liste les scènes et leur numéro',
      run() { jumpToScene('scene') },
    },
    {
      name: 'suivant',
      help: 'passe à la scène suivante, comme le ferait une sortie réussie',
      run() {
        const target = progression.next()
        if (!target) {
          say('Plus rien après celle-ci.')
          return
        }
        progression.goTo(target)
      },
    },
    {
      name: 'aide',
      help: 'liste les commandes disponibles',
      run() {
        say([
          ...commands.map(c => `${PREFIX}${c.name} — ${c.help}`),
          `${PREFIX}scene<n> — saute à la scène n (${PREFIX}scene2, ${PREFIX}scene7...)`,
        ].join('\n'))
      },
    },
  ]

  /** Les dix scènes, dans l'ordre, telles que le build les a inscrites. */
  const sceneIndex = progression.scenes

  /**
   * Saut direct à une scène : `#scene2`, `#scene7`...
   *
   * Ce n'est pas une commande comme les autres — son nom porte un numéro, donc
   * elle se reconnaît par motif. Elle referme proprement la scène en cours :
   * celle-ci s'inscrit au journal, et la suivante la lira, exactement comme si
   * elle avait été jouée jusqu'au bout.
   */
  function jumpToScene(name: string): boolean {
    // On accepte l'espace : « #scene3 » et « #scene 3 » se tapent aussi bien.
    const match = /^scene\s*(\d*)$/.exec(name)
    if (!match) return false

    const scenes = sceneIndex()
    // « #scene » sans numéro : on montre la liste plutôt qu'une erreur.
    if (!match[1]) {
      say(scenes.map((s, i) =>
        `${PREFIX}scene${i + 1} — ${s.title}${s.act ? ` (${s.act})` : ''}`).join('\n'))
      return true
    }
    const n = Number(match[1])
    const target = scenes[n - 1]
    if (!target) {
      say(`Il n'y a pas de scène ${n} — le jeu en compte ${scenes.length}.`)
      return true
    }

    // Même chemin que la sortie jouée et que l'après-paiement : les trois
    // doivent laisser exactement le même état derrière eux.
    progression.goTo(target)
    return true
  }

  /** Une saisie qui commence par '#' ne doit jamais atteindre le modèle. */
  function isCommand(input: string): boolean {
    return input.trim().startsWith(PREFIX)
  }

  function run(input: string): void {
    const raw = input.trim()
    const name = raw.slice(PREFIX.length).trim().toLowerCase()

    gameStore.addNarrativeEntry('player_command', raw)

    if (jumpToScene(name)) return

    const command = commands.find(c => c.name === name)
    if (!command) {
      say(`Commande inconnue : ${PREFIX}${name || '?'} — tape ${PREFIX}aide pour la liste.`)
      return
    }

    command.run()
  }

  return { isCommand, run, commands }
}
