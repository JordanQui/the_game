<script setup lang="ts">
import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { useNarrative } from '~/composables/useNarrative'
import { useStorylets } from '~/composables/useStorylets'
import { useImageGen } from '~/composables/useImageGen'
import { isTakeable } from '~/utils/interactables'
import { normalize } from '~/utils/text-match'

const gameStore = useGameStore()
const playerStore = usePlayerStore()
const { retryLastTurn } = useNarrative()
const { generateSceneImage } = useImageGen()
// Une saisie n'entre plus par une cascade de `if` : elle tire un moment dans
// le deck, dont l'ordre de priorité se lit d'un bloc dans `utils/storylets.ts`.
const { play } = useStorylets()

/**
 * Ouvert par défaut : le joueur doit voir tout de suite avec qui parler, c'est
 * par là que passe la progression. Il peut toujours replier pour lire.
 */
const showNpcs = ref(true)

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
    // Même règle que pour le chiffrement du texte : ce qui se ramasse et ce qui
    // se déchiffre sont la même liste.
    if (!isTakeable(obj)) return false
    if (gameStore.inventory.some(o => o.id === obj.id)) return false

    const label = normalize(obj.label).replace(/^(l['’]|le |la |les |un |une |des )/, '')
    if (label.length < 3) return false
    if (excluded.some(n => label.includes(n) || n.includes(label))) return false

    return text.includes(label)
  }) ?? null
})

/** Refermer l'épreuve, c'est retirer la demande : elle n'a pas d'autre état. */
function closeTest() {
  gameStore.clearChallenge()
}

function pickUp(obj: { id: string; label: string }) {
  gameStore.pickUp(obj.id, obj.label, playerStore.scene?.place?.name, 'lore')
  gameStore.addNarrativeEntry('system', `Tu ramasses ${obj.label}.`)
}

/**
 * Analyse réussie : le nom de CET objet devient lisible, définitivement.
 *
 * L'épreuve portait autrefois toujours sur l'objet scellé, le seul que cet
 * écran connaissait. Elle porte maintenant sur celui qui était sous la loupe —
 * une carte d'accès, un objet trouvé dans le décor —, et c'est le store qui
 * l'a désigné : les deux chemins de visée, la souris et l'oeil gyroscopique,
 * n'ont que lui en commun.
 */
function onSolved() {
  const target = gameStore.pendingChallenge
  gameStore.clearChallenge()
  if (!target) return

  gameStore.markDecrypted(target.id)
  gameStore.addNarrativeEntry('system', `${target.label} — analyse terminée.`)

  // Ce que l'analyse révèle : l'objet scellé le porte, et depuis peu les objets
  // qu'on ramasse dans le décor aussi. Ces textes ont été écrits à la
  // génération de la scène — les afficher ne coûte aucun appel au modèle.
  const sealed = playerStore.scene?.sealed_object
  const observation = sealed?.id === target.id
    ? sealed?.observation
    : playerStore.scene?.interactables?.find(o => o.id === target.id)?.observation
  if (observation) gameStore.addNarrativeEntry('narration', observation)
}

/** Le joueur prend l'objet que le détenteur lui tend. */
function collectItem() {
  const item = playerStore.scene?.key_item
  if (!item) return
  gameStore.collectKeyItem(playerStore.scene?.grants_augmentation ?? false, {
    // Toujours le même id que celui sous lequel le récit l'a chiffré : déchiffré
    // dans le texte, il doit rester déchiffré dans l'inventaire.
    id: `cle_${playerStore.scene?.scene_id}`,
    name: playerStore.scene?.key_item?.name ?? '',
    from: playerStore.scene?.place?.name,
    color: playerStore.scene?.key_item?.color,
  })
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
  <!--
    L'outil en main EST le curseur, sur toute la surface de jeu.
    Il ne l'était que sur les noms chiffrés : ailleurs, flèche standard. Le
    joueur ne voyait donc pas ce qu'il tenait tant qu'il n'avait pas trouvé
    quelque chose à lire — alors que sur mobile l'oeil est à l'écran en
    permanence. `tool-cursor` rend leur curseur normal aux commandes.
  -->
  <div
    class="flex flex-col h-[100dvh] bg-ink-900 tool-cursor"
    :class="gameStore.activeTool === 'eye' ? 'cursor-eye' : 'cursor-lens'"
  >
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

    <!-- Ce que le joueur porte : sans ça, les cartes colorées sont injouables -->
    <InventoryRail />

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
    <NarrativeText :entries="gameStore.narrativeHistory" />

    <PsychoTest
      v-if="gameStore.pendingChallenge"
      :object-id="gameStore.pendingChallenge.id"
      :object-name="gameStore.pendingChallenge.label"
      @solved="onSolved"
      @close="closeTest"
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
        @command="play"
      />
    </div>
  </div>
</template>

<style scoped>
.slide-enter-active, .slide-leave-active { transition: all 0.25s ease; overflow: hidden; }
.slide-enter-from, .slide-leave-to { max-height: 0; opacity: 0; }
.slide-enter-to, .slide-leave-from { max-height: 200px; opacity: 1; }
</style>
