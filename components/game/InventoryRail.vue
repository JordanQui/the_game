<script setup lang="ts">
import { useGameStore } from '~/stores/game'

/**
 * Ce que le joueur porte.
 *
 * L'inventaire existait — il traversait les scènes, il partait au modèle à
 * chaque génération — mais rien ne le MONTRAIT. Le joueur ne pouvait donc pas
 * savoir de quelle couleur était la carte qu'il avait ramassée deux scènes
 * plus tôt, ce qui rendait toute la mécanique des serrures colorées injouable.
 *
 * Deux natures, distinguées à l'oeil : ce qui ouvre porte sa couleur, ce qui
 * éclaire reste sourd. Un objet dont le nom n'a pas été déchiffré ne se lit
 * pas — c'est la règle du jeu, elle vaut aussi ici.
 */
const gameStore = useGameStore()

const items = computed(() => gameStore.inventory.map(o => ({
  ...o,
  known: gameStore.decryptedObjectIds.includes(o.id),
})))
</script>

<template>
  <div v-if="items.length" class="shrink-0 flex items-center gap-1.5 px-4 pb-1.5 flex-wrap">
    <span class="text-steel-400 text-[10px] uppercase tracking-[0.22em] font-display mr-0.5">
      Sur toi
    </span>
    <span
      v-for="o in items"
      :key="o.id"
      class="inline-flex items-center gap-1.5 px-2 py-1 border text-[11px]"
      :class="o.kind === 'key'
        ? 'border-neon-600/50 text-neon-200'
        : 'border-steel-600/50 text-ink-200'"
      :title="[o.kind === 'key' ? 'Ouvre quelque chose' : 'Éclaire la quête',
               o.color ? `couleur : ${o.color}` : '',
               o.from ? `récupéré : ${o.from}` : ''].filter(Boolean).join(' — ')"
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
    </span>
  </div>
</template>
