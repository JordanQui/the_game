<script setup lang="ts">
import type { SceneNPC } from '~/types/scene'

defineProps<{ npc: SceneNPC; talked?: boolean }>()
</script>

<template>
  <div
    class="flex items-start gap-3 p-3 bg-ink-800/60 border transition-colors"
    :class="talked ? 'border-neon-600/50' : 'border-steel-600/50'"
  >
    <!-- Portrait -->
    <div class="shrink-0 w-12 h-12 overflow-hidden border border-steel-600/60 bg-ink-700">
      <img
        v-if="npc.portraitUrl"
        :src="npc.portraitUrl"
        :alt="npc.name"
        class="w-full h-full object-cover"
      />
      <div v-else class="w-full h-full flex items-center justify-center text-neon-500/60 text-xl font-display">
        {{ npc.name[0] }}
      </div>
    </div>

    <!-- Info -->
    <div class="flex-1 min-w-0">
      <p class="flex items-center gap-1.5 text-neon-300 text-xs uppercase tracking-wider font-display mb-0.5">
        {{ npc.name }}
        <!-- Puce pleine : tu lui as déjà parlé -->
        <span
          class="w-1.5 h-1.5 shrink-0"
          :class="talked ? 'bg-neon-500' : 'bg-steel-600'"
          :title="talked ? 'Déjà interrogé' : 'Pas encore interrogé'"
        />
      </p>
      <p class="text-ink-300 text-xs">{{ npc.archetype }}</p>
    </div>
  </div>
</template>
