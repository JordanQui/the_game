<script setup lang="ts">
import { usePlayerStore } from '~/stores/player'

/**
 * Ce qu'est l'oeil, au moment de l'ouvrir.
 *
 * On dit ce qu'il EST et ce qu'il coûte, jamais comment s'en servir : le geste
 * s'apprend en le faisant, et l'icône au-dessus le montre mieux qu'une phrase.
 * Elle dérive dans un carré invisible — c'est la visée elle-même, en réduction.
 *
 * SUR IOS, LE GYROSCOPE N'ÉMET RIEN AVANT LA PERMISSION, et cette fenêtre est
 * précisément ce qui la précède. L'icône se pilote donc au capteur quand il
 * parle déjà — Android, iOS déjà autorisé — et dérive d'elle-même sinon. Dans
 * les deux cas elle dit la même chose : ça se déplace en inclinant.
 */
const props = defineProps<{ text?: string }>()
const emit = defineEmits<{ confirm: []; close: [] }>()

const playerStore = usePlayerStore()
const labels = computed(() => playerStore.scene?.eye_primer)

/** Position dans le carré, en fraction. 0,5 au centre. */
const pos = ref({ x: 0.5, y: 0.5 })
/** Le capteur a parlé : on cesse alors la dérive de démonstration. */
const live = ref(false)

let raf: number | null = null
let phase = 0

function onOrientation(e: DeviceOrientationEvent) {
  if (e.beta === null || e.gamma === null) return
  live.value = true
  // Débattement volontairement court : le carré fait quelques dizaines de
  // pixels, il doit réagir à un mouvement de poignet.
  pos.value = {
    x: Math.min(1, Math.max(0, 0.5 + e.gamma / 24)),
    y: Math.min(1, Math.max(0, 0.5 + (e.beta - 45) / 30)),
  }
}

function drift() {
  if (!live.value) {
    phase += 0.018
    // Une figure de Lissajous : les deux axes ne se répètent pas ensemble, le
    // mouvement ne paraît donc jamais mécanique.
    pos.value = { x: 0.5 + Math.sin(phase) * 0.34, y: 0.5 + Math.sin(phase * 1.6) * 0.3 }
  }
  raf = requestAnimationFrame(drift)
}

onMounted(() => {
  window.addEventListener('deviceorientation', onOrientation, true)
  raf = requestAnimationFrame(drift)
})
onUnmounted(() => {
  window.removeEventListener('deviceorientation', onOrientation, true)
  if (raf) cancelAnimationFrame(raf)
})

const style = computed(() => ({
  left: `${pos.value.x * 100}%`,
  top: `${pos.value.y * 100}%`,
}))
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center px-6 py-8 overflow-y-auto"
    @click.self="emit('close')"
  >
    <div class="absolute inset-0 bg-ink-900/92" />

    <div
      class="relative z-10 w-full max-w-sm bg-ink-900 border border-neon-600/50 p-7 space-y-6"
      style="box-shadow: 0 24px 60px rgba(0,0,0,0.8), 0 0 40px rgb(var(--neon-500) / 0.12)"
    >
      <span class="absolute inset-[5px] border border-neon-500/15 pointer-events-none" />

      <!-- Le carré est invisible : seul le déplacement se voit. -->
      <div class="relative h-24 w-24 mx-auto">
        <div class="absolute -translate-x-1/2 -translate-y-1/2 text-neon-400" :style="style">
          <svg viewBox="0 0 24 16" class="w-10 h-7" fill="none" stroke="currentColor" stroke-width="1.2">
            <path d="M1 8s4-6.5 11-6.5S23 8 23 8s-4 6.5-11 6.5S1 8 1 8Z" />
            <circle cx="12" cy="8" r="3.2" fill="currentColor" opacity="0.85" />
          </svg>
        </div>
      </div>

      <div class="space-y-2 text-center">
        <p class="text-neon-400/80 text-[10px] uppercase tracking-[0.32em] font-display">
          {{ labels?.eyebrow ?? 'L\'œil' }}
        </p>
      </div>

      <p v-if="props.text" class="text-ink-200/85 text-sm leading-relaxed">
        {{ props.text }}
      </p>

      <GlowButton class="w-full" @click="emit('confirm')">
        {{ labels?.cta ?? 'Ouvrir l\'œil' }}
      </GlowButton>
    </div>
  </div>
</template>
