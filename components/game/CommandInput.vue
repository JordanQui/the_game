<script setup lang="ts">
const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ command: [value: string] }>()

const input = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

function submit() {
  const value = input.value.trim()
  if (!value || props.disabled) return
  emit('command', value)
  input.value = ''
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') submit()
}

onMounted(() => {
  // Pas d'autofocus sur mobile : le clavier masquerait la scène d'entrée.
  if (!window.matchMedia('(max-width: 640px)').matches) inputRef.value?.focus()
})
</script>

<template>
  <div class="flex items-center gap-3 px-4 py-3 border-t border-amber-900/40 bg-ink-900/80">
    <span class="text-amber-500/70 font-mono text-sm shrink-0 select-none">&#62;</span>
    <input
      ref="inputRef"
      v-model="input"
      type="text"
      :disabled="disabled"
      class="command-prompt flex-1 text-base sm:text-sm placeholder-ink-500 disabled:opacity-40"
      placeholder="Que fais-tu ?"
      enterkeyhint="send"
      autocomplete="off"
      autocorrect="off"
      spellcheck="false"
      @keydown="onKeydown"
    />
    <button
      :disabled="disabled || !input.trim()"
      class="shrink-0 p-2 -m-2 text-amber-700/60 hover:text-amber-400 disabled:opacity-30 transition-colors"
      @click="submit"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
      </svg>
    </button>
  </div>
</template>
