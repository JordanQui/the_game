<script setup lang="ts">
defineProps<{
  loading?: boolean
  disabled?: boolean
}>()
</script>

<template>
  <button
    :disabled="disabled || loading"
    class="relative px-8 py-3 font-serif text-amber-100 bg-amber-900/60 border border-amber-600/60 rounded-sm
           transition-all duration-300 cursor-pointer select-none
           hover:bg-amber-800/70 hover:border-amber-500 hover:text-amber-50
           disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-amber-900/60
           active:scale-95
           animate-glow-pulse"
  >
    <span v-if="loading" class="inline-flex items-center gap-2">
      <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <slot />
    </span>
    <slot v-else />
  </button>
</template>
