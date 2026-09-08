<script setup lang="ts">
/**
 * Le bandeau qui demande de confirmer qu'on prend un objet.
 *
 * Un objet qui apparaît tout seul dans l'inventaire ne se remarque pas : il
 * faut un geste du joueur, et c'est ce geste qui fait qu'il s'en souviendra.
 * La règle vaut pour tout ce qui s'acquiert — ce qu'on ramasse dans le décor
 * comme ce qu'un personnage tend au fil d'une conversation.
 *
 * Le geste change avec l'appareil : un bouton à la souris, une GLISSIÈRE au
 * doigt. Au bas d'un écran tenu à une main, un bouton se touche par accident ;
 * il faut traverser pour prendre, comme on décroche un appel.
 */
withDefaults(defineProps<{
  label: string
  /** Ce que le geste confirme. Court : il tient sur la glissière. */
  action?: string
  /** L'objet est TENDU par quelqu'un, pas trouvé : le bandeau s'allume. */
  offered?: boolean
}>(), { action: 'Ramasser', offered: false })

defineEmits<{ confirm: [] }>()

/**
 * Vrai sur un appareil sans survol. Même test que la fenêtre de l'augmentation :
 * ce n'est pas la largeur qui décide, c'est le doigt.
 */
const usesTouch = computed(() =>
  import.meta.client && !window.matchMedia('(hover: hover) and (pointer: fine)').matches)
</script>

<template>
  <div
    class="shrink-0 mx-4 mb-2 px-3 py-2.5 border"
    :class="offered ? 'border-neon-500/50 bg-neon-700/10' : 'border-neon-600/40'"
  >
    <div class="flex items-center gap-3" :class="usesTouch ? 'mb-2.5' : ''">
      <svg
        v-if="offered"
        viewBox="0 0 8 10" class="w-2 h-2.5 shrink-0 fill-neon-500 animate-deco-pulse"
        aria-hidden="true"
      >
        <path d="M0 0 L5 5 L0 10 L3 10 L8 5 L3 0 Z" />
      </svg>
      <span v-else class="shrink-0 text-neon-500 font-display text-sm">+</span>

      <p class="flex-1 min-w-0 text-ink-100 text-xs leading-snug">
        <slot>{{ label }}</slot>
      </p>

      <button
        v-if="!usesTouch"
        class="shrink-0 font-display text-[10px] uppercase tracking-[0.2em] px-3 py-1.5 transition-colors"
        :class="offered
          ? 'text-neon-200 bg-neon-500/70 hover:bg-neon-400 hover:text-ink-900'
          : 'text-neon-300 border border-neon-600/60 hover:border-neon-400 hover:text-neon-200'"
        @click="$emit('confirm')"
      >
        {{ action }}
      </button>
    </div>

    <SlideToConfirm
      v-if="usesTouch"
      :label="`Glisse pour ${action.toLowerCase()}`"
      @confirm="$emit('confirm')"
    />
  </div>
</template>
