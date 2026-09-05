<script setup lang="ts">
import { splitByNames } from '~/utils/glitch'

const props = defineProps<{
  text: string
  names: string[]
  /** Nombre de caractères déjà tapés. Omis, tout le texte est affiché. */
  visible?: number
}>()

/**
 * Le texte, découpé autour des noms.
 *
 * La frappe progressive est gérée ici plutôt que dans le composant machine à
 * écrire : tronquer la chaîne AVANT le découpage couperait les noms en deux et
 * en laisserait une moitié lisible en clair — ce qui viderait la mécanique.
 */
const segments = computed(() => {
  const limit = props.visible ?? props.text.length
  return splitByNames(props.text, props.names)
    .filter(seg => seg.start < limit)
    .map(seg => ({
      ...seg,
      // Un nom ne s'affiche qu'entier : à moitié tapé, il resterait muet.
      text: seg.name ? seg.text : seg.text.slice(0, Math.max(0, limit - seg.start)),
      complete: !seg.name || seg.start + seg.text.length <= limit,
    }))
    .filter(seg => !seg.name || seg.complete)
})
</script>

<template>
  <span><template v-for="(seg, i) in segments" :key="i"><GlitchName
    v-if="seg.name"
    :name="seg.name"
  /><template v-else>{{ seg.text }}</template></template></span>
</template>
