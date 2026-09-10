<script setup lang="ts">
const { t } = useLang()

import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'

/**
 * Ce que le joueur porte, et ce qu'il peut en faire.
 *
 * L'inventaire existait — il traversait les scènes, il partait au modèle à
 * chaque génération — mais rien ne le MONTRAIT, puis rien ne permettait d'y
 * TOUCHER. Il ne suffit pas de voir de quelle couleur est sa carte : un objet
 * qu'on ne peut ni rouvrir ni tendre à quelqu'un n'est qu'une ligne de texte.
 *
 * Trois gestes, et la barre les distingue :
 *   — un nom encore brouillé s'OUVRE, comme dans le récit : loupe en main, on
 *     s'arrête dessus et l'épreuve se déclenche ;
 *   — un objet déchiffré s'OBSERVE : ce qu'il est, ce à quoi il fait écho ;
 *   — un objet se DONNE, quand quelqu'un est en face et qu'il le veut.
 *
 * Deux natures, distinguées à l'oeil : ce qui ouvre porte sa couleur, ce qui
 * éclaire reste sourd.
 */
const gameStore = useGameStore()
const playerStore = usePlayerStore()

const emit = defineEmits<{ give: [id: string] }>()

const items = computed(() => gameStore.inventory.map(o => ({
  ...o,
  known: gameStore.decryptedObjectIds.includes(o.id),
})))

/** Le personnage à qui l'on parle. Sans lui, rien ne se donne. */
const facing = computed(() =>
  playerStore.npcs.find(n => n.id === gameStore.activeNpcId) ?? null)

/**
 * Le geste que cet objet-ci attend.
 *
 * Un seul par objet, et il change avec l'état : tant que le nom est scellé,
 * il n'y a rien d'autre à en faire que le lire.
 */
function actionFor(o: { id: string; known: boolean; observation?: string }) {
  if (!o.known) return gameStore.hasAugmentation ? 'read' : 'locked'
  return o.observation?.trim() ? 'observe' : 'none'
}

function activate(o: { id: string; label: string; known: boolean; observation?: string }) {
  const action = actionFor(o)
  if (action === 'locked') {
    // Même refus que dans le récit : le texte se brouille un instant.
    gameStore.denyRead()
    return
  }
  if (action === 'read') {
    // Depuis l'inventaire, la loupe n'a pas à être en main : l'objet est déjà
    // dans la paume du joueur, il n'a pas à le viser.
    gameStore.requestChallenge(o.id, o.label)
    return
  }
  if (action === 'observe' && o.observation) {
    gameStore.addNarrativeEntry('narration', o.observation)
  }
}
</script>

<template>
  <div v-if="items.length" class="shrink-0 flex items-center gap-1.5 px-4 pb-1.5 flex-wrap">
    <span class="text-steel-400 text-[10px] uppercase tracking-[0.22em] font-display mr-0.5">
      {{ t('game.inventory') }}
    </span>

    <span
      v-for="o in items"
      :key="o.id"
      class="inline-flex items-center gap-1.5 border text-[11px]"
      :class="o.kind === 'key'
        ? 'border-neon-600/50 text-neon-200'
        : 'border-steel-600/50 text-ink-200'"
    >
      <button
        class="inline-flex items-center gap-1.5 px-2 py-1 transition-colors"
        :class="actionFor(o) === 'none' ? 'cursor-default' : 'hover:bg-neon-500/10'"
        :title="[
          o.kind === 'key' ? 'Ouvre quelque chose' : 'Éclaire la quête',
          o.color ? `couleur : ${o.color}` : '',
          o.from ? `récupéré : ${o.from}` : '',
          actionFor(o) === 'read' ? 'nom scellé — analyser' : '',
          actionFor(o) === 'observe' ? 'observer' : '',
          actionFor(o) === 'locked' ? 'il te faut de quoi lire' : '',
        ].filter(Boolean).join(' — ')"
        @click="activate(o)"
      >
        <!-- La pastille de couleur : c'est elle qu'on compare à une serrure. -->
        <span
          v-if="o.kind === 'key'"
          class="w-2 h-2 shrink-0 border border-ink-50/25"
          :style="{ background: 'rgb(var(--neon-500))' }"
          aria-hidden="true"
        />
        <span :class="o.known ? '' : 'font-mono text-steel-400'">
          {{ o.known ? o.label : '••••••' }}
        </span>
        <span v-if="o.kind === 'key' && o.color" class="text-steel-400">{{ o.color }}</span>

        <!-- Ce qui reste à en faire, en un caractère. Rien à lire, rien à voir. -->
        <span
          v-if="actionFor(o) === 'read'"
          class="text-neon-500/80 leading-none"
          aria-hidden="true"
        >⌖</span>
        <span
          v-else-if="actionFor(o) === 'observe'"
          class="text-steel-400 leading-none"
          aria-hidden="true"
        >◉</span>
      </button>

      <!--
        On ne donne qu'à quelqu'un. Le bouton n'existe donc que le panneau d'un
        personnage ouvert : ailleurs il n'aurait pas de destinataire, et un
        objet lâché dans le vide ne revient pas.
      -->
      <button
        v-if="facing"
        class="shrink-0 border-l border-current/25 px-1.5 py-1 text-[10px] uppercase
               tracking-[0.14em] font-display text-steel-400 hover:text-neon-300 transition-colors"
        :title="t('game.give_to', { name: facing.name })"
        @click="emit('give', o.id)"
      >
        {{ t('game.give') }}
      </button>
    </span>
  </div>
</template>
