<script setup lang="ts">
defineProps<{
  loading?: boolean
  disabled?: boolean
}>()
</script>

<!--
  Bouton Dark Deco : rectangle net aux angles biseautés, tube néon, capitales
  très espacées. Au survol, le néon envahit le bouton et le texte passe en
  négatif. Le nom du composant reste GlowButton, il est utilisé partout.

  Le filet n'est pas une bordure : le clip-path la rognerait aux biseaux. C'est
  le fond néon du bouton qui affleure sur 1px autour du calque intérieur noir.
-->
<template>
  <button
    :disabled="disabled || loading"
    class="deco-cut group relative px-8 py-3 font-display text-[13px] uppercase tracking-[0.22em]
           text-neon-200 bg-neon-500/70
           transition-colors duration-200 cursor-pointer select-none
           hover:bg-neon-400 hover:text-ink-900
           disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:text-neon-200"
  >
    <span class="deco-cut absolute inset-[1px] bg-ink-900" />

    <span
      class="deco-cut absolute inset-[1px] bg-neon-400 origin-bottom scale-y-0
             transition-transform duration-200 ease-out
             group-hover:scale-y-100 group-disabled:scale-y-0"
    />

    <span class="relative z-10">
      <span v-if="loading" class="inline-flex items-center gap-2.5">
        <svg class="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
          <path class="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <slot />
      </span>
      <slot v-else />
    </span>
  </button>
</template>

<style scoped>
/* Le contour est un tube néon : il diffuse. */
button.deco-cut {
  filter: drop-shadow(0 0 6px rgb(var(--neon-500) / 0.55));
}

/* Angles coupés : la silhouette octogonale du Deco, sans rayon de courbure. */
.deco-cut {
  --cut: 9px;
  clip-path: polygon(
    var(--cut) 0, calc(100% - var(--cut)) 0,
    100% var(--cut), 100% calc(100% - var(--cut)),
    calc(100% - var(--cut)) 100%, var(--cut) 100%,
    0 calc(100% - var(--cut)), 0 var(--cut)
  );
}
</style>
