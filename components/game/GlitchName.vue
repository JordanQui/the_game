<script setup lang="ts">
import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { useNameChime } from '~/composables/useNameChime'
import { voiceOfName } from '~/utils/voices'
import { scramble } from '~/utils/glitch'

const props = defineProps<{ name: string }>()

const gameStore = useGameStore()
const playerStore = usePlayerStore()
const { start: startChime, stop: stopChime } = useNameChime()

/**
 * Le brouillage change à intervalle régulier : c'est ce mouvement qui dit au
 * joueur qu'il y a quelque chose à lire là.
 */
const seed = ref(0)
let ticker: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  ticker = setInterval(() => { seed.value = (seed.value + 1) % 997 }, 110)
})
onUnmounted(() => { if (ticker) clearInterval(ticker) })

/**
 * L'attribution est faite pour la scène ENTIÈRE, pas nom par nom : c'est la
 * seule façon de garantir que deux personnages ne partagent pas une voix.
 */
const assigned = computed(() => voiceOfName(props.name, playerStore.npcs))

const revealed = computed(() => gameStore.revealing === props.name)
const shown = computed(() => (revealed.value ? props.name : scramble(props.name, seed.value)))

/**
 * L'arpège suit la révélation, jamais le montage du composant.
 *
 * Une note au chargement de la page venait d'un déclenchement lié au cycle de
 * vie ; ici, seule une bascule effective de l'état lance le son, et toute
 * bascule inverse l'arrête.
 */
watch(revealed, (isRevealed, wasRevealed) => {
  if (isRevealed && !wasRevealed) void startChime(props.name, assigned.value.mode, assigned.value.voice)
  if (!isRevealed && wasRevealed) stopChime()
})

onUnmounted(() => { if (revealed.value) stopChime() })

/** Sur desktop, la souris EST l'instrument : aucun mode à activer. */
function onEnter() {
  gameStore.setRevealing(props.name)
}
function onLeave() {
  if (gameStore.revealing === props.name) gameStore.setRevealing(null)
}

/**
 * Au doigt, sans l'oeil actif, on ne lit rien : tout le texte se brouille.
 * C'est la réponse du système à une tentative sans instrument.
 */
function onTouch() {
  if (!gameStore.eyeActive) gameStore.denyRead()
}
</script>

<template>
  <!--
    Deux couches superposées. Celle du dessous porte le VRAI nom, invisible :
    c'est elle qui réserve la place. Celle du dessus, en absolu, affiche le
    brouillage. Sans ce montage, chaque cycle de bruit changeait la largeur du
    mot et faisait danser tout le paragraphe autour.

    `data-glitch-name` sert de cible au test de collision de l'oeil : c'est le
    composable qui balaie le document, pas chaque nom qui s'observe lui-même.
  -->
  <span
    class="glitch-name cursor-eye"
    :class="revealed && 'is-revealed'"
    :data-glitch-name="name"
    :data-archetype="assigned.voice.key"
    tabindex="0"
    role="button"
    :aria-label="revealed ? name : 'Identité chiffrée'"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
    @focus="onEnter"
    @blur="onLeave"
    @touchstart.prevent="onTouch"
  >
    <span class="sizer" aria-hidden="true">{{ name }}</span>
    <span class="overlay">{{ shown }}</span>
  </span>
</template>

<style scoped>
.glitch-name {
  position: relative;
  display: inline-block;
  white-space: nowrap;
  overflow: hidden;
  vertical-align: baseline;
  outline: none;
  color: #ff4f9b;
  text-shadow: 0 0 6px rgba(255, 46, 136, 0.45);
  transition: color 0.12s ease;
  /*
   * Monospace dans TOUS les états. C'est ce qui garantit que le bruit occupe
   * exactement la largeur du vrai nom : en proportionnel, un W prend la place
   * de trois i et le brouillage se faisait rogner. Accessoirement, ça marque le
   * nom comme une donnée plutôt que comme un mot.
   */
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.95em;
}

/* Réserve exactement la largeur du vrai nom, sans jamais le montrer. */
.sizer { visibility: hidden; }

/* Le brouillage flotte au-dessus : il ne participe pas à la mise en page. */
.overlay {
  position: absolute;
  inset: 0;
  text-align: center;
}

/* Déchiffré : le nom en clair, une seconde. */
.is-revealed {
  color: #ffd9ec;
  text-shadow:
    0 0 4px rgba(255, 46, 136, 0.95),
    0 0 14px rgba(255, 46, 136, 0.7);
}
</style>
