<script setup lang="ts">
import type { NarrativeEntry } from '~/types/game'

const props = defineProps<{ entries: NarrativeEntry[] }>()

const scrollContainer = ref<HTMLElement | null>(null)

function scrollToBottom() {
  nextTick(() => {
    const el = scrollContainer.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

// Surveiller la ref de l'élément ne déclenchait jamais rien : elle ne change
// qu'au montage. Il faut suivre le contenu, texte en cours de frappe compris.
watch(
  () => [props.entries.length, props.entries[props.entries.length - 1]?.text] as const,
  scrollToBottom,
  { immediate: true }
)
</script>

<template>
  <div ref="scrollContainer" class="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
    <TransitionGroup name="entry" tag="div" class="space-y-4">
      <div
        v-for="entry in entries"
        :key="entry.id"
        :class="{
          'narrative-text text-parchment/90 text-[15px] sm:text-sm leading-relaxed whitespace-pre-line': entry.type === 'narration',
          'pl-4 border-l-2 border-amber-700/60 text-amber-200 text-sm italic': entry.type === 'npc_speech',
          'text-amber-500/70 text-xs uppercase tracking-widest': entry.type === 'system',
          'text-ink-400 text-xs font-mono': entry.type === 'player_command',
        }"
      >
        <span v-if="entry.type === 'npc_speech' && entry.npcName" class="block text-amber-400/80 text-xs mb-1 not-italic font-sans uppercase tracking-wider">
          {{ entry.npcName }}
        </span>
        <span v-if="entry.type === 'player_command'" class="text-amber-600/50 mr-1">&gt;</span>
        <TypewriterText
          v-if="entry === entries[entries.length - 1] && ['narration', 'npc_speech'].includes(entry.type)"
          :text="entry.text"
        />
        <span v-else>{{ entry.text }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.entry-enter-active { transition: opacity 0.4s ease, transform 0.4s ease; }
.entry-enter-from { opacity: 0; transform: translateY(6px); }
</style>
