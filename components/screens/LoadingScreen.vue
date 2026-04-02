<script setup lang="ts">
defineProps<{ message?: string }>()
</script>

<template>
  <div class="min-h-screen flex items-center justify-center">
    <p class="text-amber-600/60 font-serif italic animate-flicker">
      {{ message ?? 'Le destin tisse son fil...' }}
    </p>
  </div>
</template>
