<script setup lang="ts">
const props = defineProps<{
  text: string
  speed?: number
}>()

const emit = defineEmits<{ done: [] }>()

const displayed = ref('')
let interval: ReturnType<typeof setInterval> | null = null
let charIndex = 0

watch(() => props.text, (newText) => {
  if (newText.length <= displayed.value.length) return
  if (interval) return
  interval = setInterval(() => {
    if (charIndex < newText.length) {
      displayed.value = newText.slice(0, ++charIndex)
    } else {
      clearInterval(interval!)
      interval = null
      emit('done')
    }
  }, props.speed ?? 18)
}, { immediate: true })

onUnmounted(() => { if (interval) clearInterval(interval) })
</script>

<template>
  <span>{{ displayed }}<span v-if="displayed.length < text.length" class="animate-pulse text-amber-400">▍</span></span>
</template>
