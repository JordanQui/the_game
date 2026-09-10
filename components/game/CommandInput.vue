<script setup lang="ts">
const { t } = useLang()

import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ command: [value: string] }>()

const gameStore = useGameStore()
const playerStore = usePlayerStore()

const input = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

/**
 * La personne en face, quand il y en a une.
 *
 * Une conversation dure maintenant plus d'une phrase : sans ce repère, le
 * joueur ne saurait pas que sa prochaine ligne part chez quelqu'un plutôt que
 * dans le vide, et il retaperait le nom à chaque fois — ce qu'on lui demandait
 * précisément d'arrêter de faire.
 */
const facing = computed(() =>
  playerStore.npcs.find(n => n.id === gameStore.activeNpcId) ?? null)

function submit() {
  const value = input.value.trim()
  if (!value || props.disabled) return
  emit('command', value)
  input.value = ''
  // La veille de saisie ne doit JAMAIS rester bloquée. Sur mobile, le champ
  // garde le focus après l'envoi : `blur` ne part pas, `typing` reste vrai, et
  // l'oeil demeure endormi — plus un nom révélé, plus une note, sans rien pour
  // l'expliquer. On la relâche donc dès que la commande est partie.
  gameStore.setTyping(false)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') submit()
  // Se détourner sans avoir à l'écrire. La phrase — « je m'éloigne » — marche
  // aussi, mais elle coûte un tour ; la touche, elle, ne coûte rien.
  if (e.key === 'Escape') gameStore.leaveConversation()
}

onMounted(() => {
  // Pas d'autofocus sur mobile : le clavier masquerait la scène d'entrée.
  if (!window.matchMedia('(max-width: 640px)').matches) inputRef.value?.focus()
})
</script>

<template>
  <div class="flex items-center gap-3 px-4 py-3 border-t border-neon-700/40 bg-ink-900/80">
    <span class="text-neon-500/70 font-mono text-sm shrink-0 select-none">&#62;</span>
    <button
      v-if="facing"
      class="shrink-0 flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider
             text-neon-300 border border-neon-600/50 px-2 py-0.5 hover:border-neon-400
             hover:text-neon-200 transition-colors"
      :title="t('game.facing_hint')"
      @click="gameStore.leaveConversation()"
    >
      <span>{{ t('game.facing', { name: facing.name }) }}</span>
      <span class="text-neon-600/70">&#215;</span>
    </button>
    <input
      ref="inputRef"
      v-model="input"
      @focus="gameStore.setTyping(true)"
      @blur="gameStore.setTyping(false)"
      type="text"
      :disabled="disabled"
      class="command-prompt flex-1 text-base sm:text-sm placeholder-ink-500 disabled:opacity-40"
      :placeholder="facing ? t('game.replying_to', { name: facing.name }) : t('game.input_ph')"
      enterkeyhint="send"
      autocomplete="off"
      autocorrect="off"
      spellcheck="false"
      @keydown="onKeydown"
    />
    <button
      :disabled="disabled || !input.trim()"
      class="shrink-0 p-2 -m-2 text-neon-700/60 hover:text-neon-400 disabled:opacity-30 transition-colors"
      @click="submit"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
      </svg>
    </button>
  </div>
</template>
