<script setup lang="ts">
import { KIND_ICONS, SEALED_ICON, sanitizeItemIcon } from '~/utils/item-icon'

/**
 * LE PICTOGRAMME D'UN OBJET PORTÉ.
 *
 * Trois états, dans cet ordre : scellé tant que le nom n'est pas lu, le
 * symbole généré pour cet objet-là, et à défaut celui de sa nature.
 *
 * Le tracé est nettoyé une seconde fois ici. Le serveur l'a déjà fait, mais
 * l'inventaire revient du navigateur : ce qui a dormi huit jours dans le
 * stockage local ne mérite pas plus de confiance que la sortie du modèle.
 */
const props = defineProps<{
  icon?: string
  kind: 'key' | 'lore' | 'trade'
  known: boolean
}>()

const shapes = computed(() => {
  if (!props.known) return SEALED_ICON
  return sanitizeItemIcon(props.icon) ?? KIND_ICONS[props.kind] ?? KIND_ICONS.lore
})
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="shapes"
  />
</template>
