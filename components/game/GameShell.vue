<script setup lang="ts">
const { t } = useLang()

import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { useNarrative } from '~/composables/useNarrative'
import { useStorylets } from '~/composables/useStorylets'
import { useImageGen } from '~/composables/useImageGen'
import { observationOf } from '~/utils/interactables'

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

/** Refermer l'épreuve, c'est retirer la demande : elle n'a pas d'autre état. */
function closeTest() {
  gameStore.clearChallenge()
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
  // Ce que l'analyse révèle vient de la MÊME liste que le brouillage du texte :
  // l'objet scellé, les ramassables du décor, et l'augmentation elle-même, dont
  // le nom est prononcé dès l'ouverture sans que le joueur puisse le lire. Trois
  // recherches séparées laissaient chaque fois un chemin en arrière.
  const observation = observationOf(
    playerStore.scene, gameStore.inventory, target.id,
    playerStore.language, gameStore.revealedInteractableIds)
  if (observation) gameStore.addNarrativeEntry('narration', observation)

  // LÀ OÙ L'OBJET N'EST SUR PERSONNE, LE LIRE EST L'OBTENIR. Une fréquence
  // affichée par un terminal, un code gravé sur une plaque : il n'y a rien à
  // recevoir des mains de quelqu'un, et la remise — seul chemin vers
  // `hasKeyItem` — ne se déclenchait jamais. La scène se refermait donc sur un
  // joueur qui avait tout fait juste.
  if (isFoundItem.value && target.id === `cle_${playerStore.scene?.scene_id}`) collectItem()
}

/**
 * Le joueur tend un objet à celui à qui il parle.
 *
 * Le clic désigne l'objet et le destinataire ; la phrase n'est là que pour
 * laisser une trace au fil, et c'est le deck qui décide de la suite — il le
 * prend et parle, ou il le rend.
 */
function offerItem(itemId: string) {
  const npc = playerStore.npcs.find(n => n.id === gameStore.activeNpcId)
  const item = gameStore.inventory.find(o => o.id === itemId)
  if (!npc || !item) return
  const known = gameStore.decryptedObjectIds.includes(item.id)
  gameStore.offerToNpc(item.id, npc.id)
  void play(`Tu tends ${known ? item.label : 'ce que tu portes'} à ${npc.name}.`)
}

/** La grille de l'inventaire est ouverte : elle recouvre la scène. */
const inventoryOpen = ref(false)

/** Ici, l'objet-clé n'a pas de détenteur : il est inscrit dans le lieu. */
const isFoundItem = computed(() => playerStore.scene?.key_item?.acquisition === 'found')

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
    // La couleur de la carte EST l'accent de la scène où on la prend : on la
    // fige ici, sinon la pastille se repeindrait au lieu suivant.
    hex: playerStore.scene?.palette?.accent?.hex,
    observation: playerStore.scene?.key_item?.observation,
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
    planned: scene.planned,
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

    <!-- Outils de lecture, et l'accès à ce que le joueur porte -->
    <ToolRail @inventory="inventoryOpen = true" />

    <!-- Le même inventaire, étalé : les noms en entier et les mêmes gestes -->
    <InventoryGrid
      v-if="inventoryOpen"
      @give="offerItem"
      @close="inventoryOpen = false"
    />

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

    <!-- Au premier passage à la loupe : ce qu'elle est, et comment s'en servir -->
    <AugmentationPrimer v-if="gameStore.primerOpen" />


    <PsychoTest
      v-if="gameStore.pendingChallenge"
      :object-id="gameStore.pendingChallenge.id"
      :object-name="gameStore.pendingChallenge.label"
      @solved="onSolved"
      @close="closeTest"
    />

    <!--
      L'objet est TENDU, pas donné : c'est la fin de la conversation avec celui
      qui le portait, et c'est le joueur qui referme sa main dessus.
    -->
    <Transition name="slide">
      <PickupPrompt
        v-if="gameStore.pendingKeyItem && playerStore.scene?.key_item"
        :label="t('game.offered_to_you', { item: playerStore.scene.key_item.name })"
        :action="t('game.action_collect')"
        :slide-label="t('game.slide_collect')"
        offered
        @confirm="collectItem"
      />
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
          {{ t('common.retry') }}
        </button>
        <button
          class="shrink-0 text-ink-400 hover:text-parchment/60 text-lg leading-none px-1 transition-colors"
          :aria-label="t('common.ignore')"
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
