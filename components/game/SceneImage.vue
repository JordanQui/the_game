<script setup lang="ts">
const props = defineProps<{
  src: string | null
  loading?: boolean
  error?: string | null
}>()

defineEmits<{ retry: [] }>()

// La génération prend ~30 s. Sans compteur, l'écran passe pour figé.
const elapsed = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

function stopTimer() {
  if (timer) { clearInterval(timer); timer = null }
}

watch(() => props.loading, (isLoading) => {
  stopTimer()
  if (!isLoading) return
  elapsed.value = 0
  timer = setInterval(() => { elapsed.value += 1 }, 1000)
}, { immediate: true })

onUnmounted(stopTimer)

const message = computed(() => {
  if (props.error) return 'L\'image ne s\'est pas formée. Le texte, lui, tient toujours.'
  if (props.loading) return 'La brume du soir voile encore la salle...'
  return 'La salle attend d\'être dessinée.'
})
</script>

<template>
  <div class="relative w-full aspect-[16/9] sm:aspect-auto sm:h-full overflow-hidden bg-ink-900">
    <div v-if="!src" class="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6">
      <div v-if="loading" class="absolute inset-0 shimmer-bg" />
      <p
        class="relative z-10 text-center font-display text-[10px] sm:text-[11px] uppercase tracking-[0.22em]"
        :class="error ? 'text-red-400/50' : 'text-amber-500/60 animate-deco-pulse'"
      >
        {{ message }}
      </p>
      <p v-if="loading" class="relative z-10 text-ink-400 text-[11px] font-mono tabular-nums">
        {{ elapsed }}s — environ 30s
      </p>
      <button
        v-if="error"
        class="relative z-10 text-amber-500/80 hover:text-amber-300 text-[11px] uppercase tracking-wider border border-amber-800/50 px-3 py-1 transition-colors"
        @click="$emit('retry')"
      >
        Réessayer
      </button>
    </div>

    <Transition name="fade-in">
      <img
        v-if="src"
        :src="src"
        alt="Illustration de la scène"
        class="w-full h-full object-center object-cover sm:object-contain"
      />
    </Transition>

    <div class="absolute bottom-0 left-0 right-0 h-16 sm:h-24 bg-gradient-to-t from-ink-900 to-transparent pointer-events-none" />
  </div>
</template>

<style scoped>
.fade-in-enter-active { transition: opacity 1.2s ease; }
.fade-in-enter-from { opacity: 0; }
</style>
