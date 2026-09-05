<script setup lang="ts">
import { splitByNames, type Term } from '~/utils/glitch'
import { usePlayerStore } from '~/stores/player'

const props = defineProps<{
  text: string
  names: Array<string | Term>
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
const playerStore = usePlayerStore()
const sealedId = computed(() => playerStore.scene?.sealed_object?.id ?? 'objet')

defineEmits<{ challenge: [] }>()

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
  <span><template v-for="(seg, i) in segments" :key="i"><GlitchObject
    v-if="seg.name && seg.kind === 'object'"
    :id="sealedId"
    :label="seg.name"
    @challenge="$emit('challenge')"
  /><GlitchName
    v-else-if="seg.name"
    :name="seg.name"
  /><template v-else>{{ seg.text }}</template></template></span>
</template>
