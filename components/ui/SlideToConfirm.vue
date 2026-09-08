<script setup lang="ts">
/**
 * La glissière de confirmation, pour les appareils sans souris.
 *
 * Un bouton de 30 pixels au bas d'un écran tenu à une main se touche par
 * accident, et ramasser un objet par accident coûte au joueur la seule chose
 * que le jeu lui demande : l'attention. Le geste de décrocher un appel règle
 * ça depuis vingt ans — il faut TRAVERSER, et on ne traverse pas sans le
 * vouloir.
 *
 * Le curseur suit le doigt sans transition ; c'est au relâchement qu'il
 * décide : passé le seuil il file au bout et confirme, sinon il revient.
 */
const props = withDefaults(defineProps<{
  label: string
  /** Part de la course à franchir pour que ça compte. */
  threshold?: number
}>(), { threshold: 0.72 })

const emit = defineEmits<{ confirm: [] }>()

const track = ref<HTMLElement | null>(null)
const knob = ref<HTMLElement | null>(null)
/** Position du curseur, de 0 à 1. */
const progress = ref(0)
const dragging = ref(false)
const done = ref(false)

/** Course utile : la piste moins le curseur, qui ne peut pas en sortir. */
function travel(): number {
  const t = track.value?.clientWidth ?? 0
  const k = knob.value?.clientWidth ?? 0
  return Math.max(1, t - k - 8)
}

function startX(): number {
  return (track.value?.getBoundingClientRect().left ?? 0) + (knob.value?.clientWidth ?? 0) / 2 + 4
}

function onDown(e: PointerEvent) {
  if (done.value) return
  dragging.value = true
  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  onMove(e)
}

function onMove(e: PointerEvent) {
  if (!dragging.value || done.value) return
  progress.value = Math.min(1, Math.max(0, (e.clientX - startX()) / travel()))
}

function onUp() {
  if (!dragging.value || done.value) return
  dragging.value = false
  if (progress.value >= props.threshold) {
    // Le curseur va au bout de lui-même : le joueur a fait sa part, la fin du
    // geste n'a plus à lui être demandée.
    done.value = true
    progress.value = 1
    emit('confirm')
  } else {
    progress.value = 0
  }
}

/** Au clavier, une glissière est un bouton : Entrée ou Espace confirment. */
function onKey(e: KeyboardEvent) {
  if (done.value || (e.key !== 'Enter' && e.key !== ' ')) return
  e.preventDefault()
  done.value = true
  progress.value = 1
  emit('confirm')
}
</script>

<template>
  <div
    ref="track"
    class="relative select-none h-11 border border-neon-600/60 bg-ink-900/60 overflow-hidden touch-none"
    role="button"
    tabindex="0"
    :aria-label="label"
    @keydown="onKey"
  >
    <!-- La traînée : ce qui est déjà parcouru s'allume derrière le curseur. -->
    <span
      class="absolute inset-y-0 left-0 bg-neon-500/20 pointer-events-none"
      :class="dragging ? '' : 'transition-[width] duration-200'"
      :style="{ width: `calc(${progress * 100}% )` }"
      aria-hidden="true"
    />

    <span
      class="absolute inset-0 flex items-center justify-center px-12 pointer-events-none
             font-display text-[10px] uppercase tracking-[0.28em] text-neon-300/80 text-center"
      :style="{ opacity: 1 - progress }"
    >
      {{ label }}
    </span>

    <!-- Le curseur. Deux chevrons : le sens du geste doit se lire sans notice. -->
    <span
      ref="knob"
      class="absolute top-1 bottom-1 left-1 w-14 flex items-center justify-center
             bg-neon-500/80 text-ink-900 cursor-grab active:cursor-grabbing"
      :class="dragging ? '' : 'transition-transform duration-200'"
      :style="{ transform: `translateX(${progress * travel()}px)` }"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    >
      <svg viewBox="0 0 16 10" class="w-4 h-2.5 fill-current" aria-hidden="true">
        <path d="M0 0 L5 5 L0 10 L2.5 10 L7.5 5 L2.5 0 Z" />
        <path d="M7 0 L12 5 L7 10 L9.5 10 L14.5 5 L9.5 0 Z" opacity="0.55" />
      </svg>
    </span>
  </div>
</template>
