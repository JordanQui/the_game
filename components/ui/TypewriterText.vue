<script setup lang="ts">
import { highlightNames, escapeHtml } from '~/utils/highlight'

const props = defineProps<{
  text: string
  speed?: number
  /** Noms à mettre en gras, une fois la frappe terminée. */
  names?: string[]
}>()

const emit = defineEmits<{ done: [] }>()

const displayed = ref('')
let timer: ReturnType<typeof setInterval> | null = null

function stop() {
  if (timer) { clearInterval(timer); timer = null }
}

function tick() {
  // On relit props.text à CHAQUE tick : le capturer dans la closure figeait
  // l'affichage sur la valeur reçue au démarrage, et le reste du flux était perdu.
  const target = props.text

  if (displayed.value.length >= target.length) {
    stop()
    emit('done')
    return
  }

  // Si le flux arrive plus vite qu'on ne tape, on rattrape par paquets
  // au lieu de prendre un retard qui ne se rattrape jamais.
  const remaining = target.length - displayed.value.length
  const step = Math.max(1, Math.ceil(remaining / 60))
  displayed.value = target.slice(0, displayed.value.length + step)
}

function start() {
  if (timer) return
  timer = setInterval(tick, props.speed ?? 18)
}

watch(() => props.text, (target) => {
  // Nouvelle entrée réutilisant le composant : on repart de zéro.
  if (!target.startsWith(displayed.value)) displayed.value = ''
  if (displayed.value.length < target.length) start()
}, { immediate: true })

onUnmounted(stop)

const typing = computed(() => displayed.value.length < props.text.length)

/**
 * Pendant la frappe on rend du texte brut : poser des balises sur une chaîne
 * tronquée les couperait en plein milieu. Le gras arrive à la fin.
 */
const rendered = computed(() =>
  typing.value ? escapeHtml(displayed.value) : highlightNames(displayed.value, props.names ?? []))
</script>

<template>
  <span><span v-html="rendered" /><span v-if="typing" class="animate-pulse text-neon-400">▍</span></span>
</template>
