<script setup lang="ts">
defineProps<{
  src: string | null
  loading?: boolean
  fallbackText?: string
}>()
</script>

<template>
  <div class="relative w-full aspect-[16/9] overflow-hidden bg-ink-900">
    <!-- Loading shimmer -->
    <div v-if="loading || !src" class="absolute inset-0 flex items-center justify-center">
      <div class="absolute inset-0 shimmer-bg" />
      <p class="relative z-10 text-amber-600/60 font-serif text-sm italic animate-flicker">
        {{ fallbackText ?? 'La brume du soir voile momentanément la vue...' }}
      </p>
    </div>

    <!-- Scene image -->
    <Transition name="fade-in">
      <img
        v-if="src"
        :src="src"
        alt="Scène du jeu"
        class="w-full h-full object-cover"
      />
    </Transition>

    <!-- Bottom gradient overlay -->
    <div class="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-ink-900 to-transparent pointer-events-none" />
  </div>
</template>

<style scoped>
.fade-in-enter-active { transition: opacity 1.2s ease; }
.fade-in-enter-from { opacity: 0; }
</style>
