<script setup lang="ts">
import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { useNarrative } from '~/composables/useNarrative'
import { usePaywall } from '~/composables/usePaywall'
import { useImageGen } from '~/composables/useImageGen'
import { useSceneCommands } from '~/composables/useSceneCommands'
import { normalize } from '~/utils/text-match'

const gameStore = useGameStore()
const playerStore = usePlayerStore()
const { handlePlayerInput, retryLastTurn } = useNarrative()
const { checkPaywallTrigger, blockedByKeyItem, openExit, mentionsExit } = usePaywall()
const { generateSceneImage } = useImageGen()
const { isCommand, run: runSceneCommand } = useSceneCommands()

/**
 * Ouvert par défaut : le joueur doit voir tout de suite avec qui parler, c'est
 * par là que passe la progression. Il peut toujours replier pour lire.
 */
const showNpcs = ref(true)

async function onCommand(input: string) {
  // Le canal '#' parle au scénario, pas au modèle : il passe avant tout le
  // reste et rien ne part chez gpt-4o.
  if (isCommand(input)) {
    runSceneCommand(input)
    return
  }

  // Il veut sortir mais l'objet lui manque : on le renvoie vers son détenteur.
  if (blockedByKeyItem(input)) {
    await handlePlayerInput(input, 'blocked_exit')
    return
  }

  if (checkPaywallTrigger(input)) {
    const gate = playerStore.scene?.paywall.gate_text
    if (gate) gameStore.addNarrativeEntry('narration', gate)
    setTimeout(openExit, 1400)
    return
  }

  // Le joueur parle de sortir mais il est trop tôt : on ramène le regard
  // vers la porte sans jamais lui dicter la commande.
  if (mentionsExit(input)) {
    await handlePlayerInput(input, 'exit_nudge')
    return
  }

  await handlePlayerInput(input)
}

/** Verbes qui désignent une prise. Le reste — examiner, parler — n'en est pas une. */
const TAKE_VERBS = ['prendre', 'ramasser', 'recuperer', 'récupérer', 'empocher', 'saisir', 'voler', 'emporter']

/**
 * L'objet qui vient d'arriver dans la conversation, et qu'on peut prendre.
 *
 * On ne regarde QUE la dernière réplique : le bouton est un geste offert à
 * l'instant où l'objet apparaît, pas un inventaire du décor. Une barre
 * permanente listant tout ce qui a été nommé afficherait le comptoir, les
 * murs, et les personnages.
 */
const justAppeared = computed(() => {
  const scene = playerStore.scene
  const last = gameStore.narrativeHistory[gameStore.narrativeHistory.length - 1]
  if (!scene?.interactables || !last) return null
  if (last.type !== 'narration' && last.type !== 'npc_speech') return null

  const text = normalize(last.text)
  // Ni les personnages ni le décor : on ne ramasse ni les gens, ni les murs,
  // ni le comptoir. La génération met « prendre » un peu partout.
  const excluded = [
    ...scene.npcs.map(n => normalize(n.name)),
    ...(scene.decor ?? []).map(d => normalize(d.name ?? '')),
  ].filter(n => n.length > 2)

  return scene.interactables.find((obj) => {
    if (obj.triggers_paywall) return false
    if (!TAKE_VERBS.includes(normalize(obj.verb ?? ''))) return false
    if (gameStore.inventory.some(o => o.id === obj.id)) return false

    const label = normalize(obj.label).replace(/^(l['’]|le |la |les |un |une |des )/, '')
    if (label.length < 3) return false
    if (excluded.some(n => label.includes(n) || n.includes(label))) return false

    return text.includes(label)
  }) ?? null
})

function pickUp(obj: { id: string; label: string }) {
  gameStore.pickUp(obj.id, obj.label, playerStore.scene?.place?.name)
  gameStore.addNarrativeEntry('system', `Tu ramasses ${obj.label}.`)
}

/** L'épreuve d'analyse de l'objet scellé. */
const testing = ref(false)

/**
 * Analyse réussie : le nom devient lisible et l'observation s'inscrit dans le
 * fil. Ce texte a été écrit à la génération de la scène — l'afficher ne coûte
 * donc aucun appel au modèle.
 */
function onSolved() {
  const sealed = playerStore.scene?.sealed_object
  testing.value = false
  if (!sealed) return
  gameStore.markDecrypted(sealed.id)
  gameStore.addNarrativeEntry('system', `${sealed.name} — analyse terminée.`)
  gameStore.addNarrativeEntry('narration', sealed.observation)
}

/** Le joueur prend l'objet que le détenteur lui tend. */
function collectItem() {
  const item = playerStore.scene?.key_item
  if (!item) return
  gameStore.collectKeyItem(playerStore.scene?.grants_augmentation ?? false)
  gameStore.addNarrativeEntry('system', `Tu tiens maintenant ${item.name}.`)
}

function retryImage() {
  const scene = playerStore.scene
  if (!scene) return

  // Illustration figée : il n'y a rien à regénérer, on la repose.
  if (scene.static_image) {
    gameStore.setSceneImage(scene.static_image)
    gameStore.finishSceneImage()
    return
  }

  void generateSceneImage({
    sceneId: scene.scene_id,
    placeName: scene.place.name,
    palette: scene.palette,
    decor: scene.decor,
  })
}
</script>

<template>
  <div class="flex flex-col h-[100dvh] bg-ink-900">
    <!-- Le cadre reste 16/9 sur les deux tailles. Mobile : il prend toute la
         largeur. Desktop : c'est la hauteur qui le dimensionne, et il se centre
         — un 16/9 pleine largeur y ferait 810px de haut, sans place pour le
         texte. -->
    <div class="shrink-0 flex justify-center">
      <SceneImage
        :src="gameStore.currentSceneImageUrl"
        :loading="gameStore.sceneImageLoading"
        :error="gameStore.sceneImageError"
        @retry="retryImage"
      />
    </div>

    <!-- Bandeau : lieu + accès aux PNJ -->
    <div class="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-neon-700/30">
      <p class="flex-1 min-w-0 truncate text-neon-400/90 font-display uppercase tracking-[0.14em] text-[11px]">
        {{ playerStore.place?.name ?? playerStore.scene?.scene_title }}
      </p>
      <button
        v-if="playerStore.npcs.length"
        class="shrink-0 text-xs text-neon-600/80 hover:text-neon-400 transition-colors py-1 px-2 -my-1"
        @click="showNpcs = !showNpcs"
      >
        {{ playerStore.npcs.length }} à qui parler {{ showNpcs ? '▴' : '▾' }}
      </button>

    </div>

    <!-- Outils de lecture -->
    <ToolRail />

    <!-- Réglages, en surimpression en haut à droite de l'écran -->
    <SettingsPanel />

    <!-- Liste des PNJ -->
    <Transition name="slide">
      <div v-if="showNpcs" class="shrink-0 flex gap-2 px-4 py-2 border-b border-neon-700/30 overflow-x-auto">
        <NPCDialogue
          v-for="npc in playerStore.npcs"
          :key="npc.id"
          :npc="npc"
          :talked="gameStore.talkedToNpcIds.includes(npc.id)"
          class="shrink-0 w-44 sm:w-48"
        />
      </div>
    </Transition>


    <!-- Narration. L'historique tient lieu d'inventaire : l'objet scellé y
         reste visible, et l'on y revient avec la loupe. -->
    <NarrativeText :entries="gameStore.narrativeHistory" @challenge="testing = true" />

    <PsychoTest
      v-if="testing && playerStore.scene?.sealed_object"
      :object-id="playerStore.scene.sealed_object.id"
      :object-name="playerStore.scene.sealed_object.name"
      @solved="onSolved"
      @close="testing = false"
    />

    <!-- Un objet vient d'apparaître : on le prend d'un clic, pas en le tapant -->
    <Transition name="slide">
      <div
        v-if="justAppeared"
        class="shrink-0 flex items-center gap-3 mx-4 mb-2 px-3 py-2.5 border border-neon-600/40"
      >
        <span class="shrink-0 text-neon-500 font-display text-sm">+</span>
        <p class="flex-1 min-w-0 text-ink-100 text-xs leading-snug">
          {{ justAppeared.label }}
        </p>
        <button
          class="shrink-0 font-display text-[10px] uppercase tracking-[0.2em] text-neon-300
                 border border-neon-600/60 hover:border-neon-400 hover:text-neon-200
                 px-3 py-1.5 transition-colors"
          @click="pickUp(justAppeared)"
        >
          Ramasser
        </button>
      </div>
    </Transition>

    <!--
      L'objet est tendu, pas donné. Un objet qui apparaît tout seul dans
      l'inventaire ne se remarque pas : il faut un geste du joueur.
    -->
    <Transition name="slide">
      <div
        v-if="gameStore.pendingKeyItem && playerStore.scene?.key_item"
        class="shrink-0 flex items-center gap-3 mx-4 mb-2 px-3 py-2.5 border border-neon-500/50 bg-neon-700/10"
      >
        <svg viewBox="0 0 8 10" class="w-2 h-2.5 shrink-0 fill-neon-500 animate-deco-pulse" aria-hidden="true">
          <path d="M0 0 L5 5 L0 10 L3 10 L8 5 L3 0 Z" />
        </svg>
        <p class="flex-1 min-w-0 text-ink-100 text-xs leading-snug">
          {{ playerStore.scene.key_item.name }} t'est tendu.
        </p>
        <button
          class="shrink-0 font-display text-[10px] uppercase tracking-[0.2em] text-neon-200 bg-neon-500/70
                 hover:bg-neon-400 hover:text-ink-900 px-3 py-1.5 transition-colors"
          @click="collectItem"
        >
          Récupérer
        </button>
      </div>
    </Transition>

    <!-- Tour en échec : la saisie reste ouverte, et on peut relancer -->
    <Transition name="slide">
      <div
        v-if="gameStore.turnError"
        class="shrink-0 flex items-center gap-3 mx-4 mb-2 px-3 py-2 border border-red-900/50 bg-red-950/20"
      >
        <p class="flex-1 min-w-0 text-red-300/70 text-xs leading-snug">
          {{ gameStore.turnError }}
        </p>
        <button
          class="shrink-0 text-neon-400 hover:text-neon-300 text-xs uppercase tracking-wider border border-neon-700/60 px-3 py-1.5 transition-colors"
          @click="retryLastTurn"
        >
          Réessayer
        </button>
        <button
          class="shrink-0 text-ink-400 hover:text-parchment/60 text-lg leading-none px-1 transition-colors"
          aria-label="Ignorer"
          @click="gameStore.clearTurnError()"
        >
          ×
        </button>
      </div>
    </Transition>

    <!-- L'oeil de visée, sur les appareils sans souris -->
    <HackEye />

    <!-- Saisie -->
    <div class="shrink-0 pb-[env(safe-area-inset-bottom)]">
      <CommandInput
        :disabled="gameStore.isInputDisabled"
        @command="onCommand"
      />
    </div>
  </div>
</template>

<style scoped>
.slide-enter-active, .slide-leave-active { transition: all 0.25s ease; overflow: hidden; }
.slide-enter-from, .slide-leave-to { max-height: 0; opacity: 0; }
.slide-enter-to, .slide-leave-from { max-height: 200px; opacity: 1; }
</style>
