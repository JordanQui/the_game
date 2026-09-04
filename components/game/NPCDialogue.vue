<script setup lang="ts">
import type { SceneNPC } from '~/types/scene'

defineProps<{ npc: SceneNPC }>()
</script>

<template>
  <div class="flex items-start gap-3 p-3 bg-ink-800/60 border border-amber-900/30 rounded-sm">
    <!-- Portrait -->
    <div class="shrink-0 w-12 h-12 overflow-hidden rounded-sm border border-amber-800/40 bg-ink-700">
      <img
        v-if="npc.portraitUrl"
        :src="npc.portraitUrl"
        :alt="npc.name"
        class="w-full h-full object-cover"
      />
      <div v-else class="w-full h-full flex items-center justify-center text-amber-600/50 text-xl font-serif">
        {{ npc.name[0] }}
      </div>
    </div>

    <!-- Info -->
    <div class="flex-1 min-w-0">
      <p class="text-amber-400 text-xs uppercase tracking-wider font-sans mb-0.5">{{ npc.name }}</p>
      <p class="text-parchment/60 text-xs italic">{{ npc.archetype }}</p>
    </div>
  </div>
</template>
