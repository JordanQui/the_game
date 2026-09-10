<script setup lang="ts">
const { t } = useLang()

import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { useNarrative } from '~/composables/useNarrative'
import { useStorylets } from '~/composables/useStorylets'
import { useImageGen } from '~/composables/useImageGen'
import { analyzables, isTakeable } from '~/utils/interactables'
import { pack } from '~/utils/languages'
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

/** Les articles à retirer d'un nom, normalisés une fois pour toutes. */
const articles = computed(() => pack(playerStore.language).input.articles
  .map(a => normalize(a))
  .filter(Boolean)
  // Les plus longs d'abord : « de la » avant « de », sinon « de » gagne et
  // laisse « la » collé au nom.
  .sort((a, b) => b.length - a.length))

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
    if (!isTakeable(obj, playerStore.language)) return false
    if (gameStore.inventory.some(o => o.id === obj.id)) return false

    // L'article se retire avec la liste de la langue jouée : « le Sas » se
    // cherche par « sas », « the Airlock » par « airlock », et le russe n'a
    // rien à retirer. La liste française en dur ne trouvait rien ailleurs.
    const label = articles.value.reduce(
      (name, article) => name.startsWith(article) ? name.slice(article.length).trim() : name,
      normalize(obj.label))
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
  // Ce que l'analyse en dira part AVEC l'objet : la scène qui l'a écrit sera
  // loin quand le joueur pensera enfin à le rouvrir.
  gameStore.pickUp({
    id: obj.id,
    label: obj.label,
    from: playerStore.scene?.place?.name,
    kind: 'lore',
    observation: observationFor(obj.id),
  })
  gameStore.addNarrativeEntry('system', t('game.pickup', { label: obj.label }))
}

/**
 * Ce que l'analyse d'une chose révèle, où qu'elle se trouve.
 *
 * D'abord la scène — c'est elle qui l'a écrit —, puis l'inventaire, pour tout
 * ce que le joueur traîne depuis une scène précédente et rouvre maintenant.
 */
function observationFor(id: string): string | undefined {
  const scene = playerStore.scene
  const here = scene ? analyzables(scene).find(o => o.id === id)?.observation : undefined
  return here || gameStore.inventory.find(o => o.id === id)?.observation
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
  const observation = observationFor(target.id)
  if (observation) gameStore.addNarrativeEntry('narration', observation)
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
    <InventoryRail @give="offerItem" />

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

    <!-- Un objet vient d'apparaître : on le prend d'un geste, pas en le tapant -->
    <Transition name="slide">
      <PickupPrompt
        v-if="justAppeared"
        :label="justAppeared.label"
        :action="t('game.action_pickup')"
        :slide-label="t('game.slide_pickup')"
        @confirm="pickUp(justAppeared)"
      />
    </Transition>

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
