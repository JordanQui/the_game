<script setup lang="ts">
import { useGameStore } from '~/stores/game'
import { GLYPHS } from '~/utils/psychotest'

const props = defineProps<{ id: string; label: string }>()
const emit = defineEmits<{ challenge: [] }>()

const gameStore = useGameStore()

/**
 * Le brouillage des OBJETS, distinct de celui des personnages.
 *
 * Les noms de gens sont recouverts de caractères qui défilent ; les objets le
 * sont de blocs géométriques. Le joueur doit voir d'un coup d'oeil à quoi il a
 * affaire — une identité ne se déchiffre pas comme une chose.
 */
const seed = ref(0)
let ticker: ReturnType<typeof setInterval> | null = null

onMounted(() => { ticker = setInterval(() => { seed.value++ }, 170) })
onUnmounted(() => { if (ticker) clearInterval(ticker) })

const decrypted = computed(() => gameStore.decryptedObjectIds.includes(props.id))

/** Une trame de blocs, de la longueur du vrai nom. */
const shown = computed(() => {
  if (decrypted.value) return props.label
  return Array.from(props.label, (ch, i) =>
    ch === ' ' ? ' ' : GLYPHS[(seed.value * 5 + i * 7 + ch.charCodeAt(0)) % GLYPHS.length]
  ).join('')
})

function onActivate() {
  if (decrypted.value) return
  // Sans l'augmentation, ou avec l'oeil en main, rien à tenter : seule la
  // loupe ouvre l'épreuve.
  if (!gameStore.hasAugmentation || gameStore.activeTool !== 'lens') {
    gameStore.denyRead()
    return
  }
  emit('challenge')
}
</script>

<template>
  <span
    class="glitch-object"
    :class="[
      decrypted ? 'is-clear' : 'is-sealed',
      !decrypted && gameStore.activeTool === 'lens' ? 'cursor-lens' : 'cursor-eye',
    ]"
    :tabindex="decrypted ? -1 : 0"
    :role="decrypted ? undefined : 'button'"
    :aria-label="decrypted ? label : 'Objet scellé — analyse requise'"
    @click="onActivate"
    @keydown.enter="onActivate"
  >
    <span class="sizer" aria-hidden="true">{{ label }}</span>
    <span class="overlay">{{ shown }}</span>
  </span>
</template>

<style scoped>
/* Même montage que les noms : une couche invisible réserve la largeur, le
   brouillage flotte au-dessus et ne déplace jamais le texte autour. */
.glitch-object {
  position: relative;
  display: inline-block;
  white-space: nowrap;
  overflow: hidden;
  vertical-align: baseline;
  outline: none;
  font-size: 0.95em;
  letter-spacing: 0.05em;
  transition: color 0.15s ease;
}

.sizer { visibility: hidden; }
.overlay { position: absolute; inset: 0; text-align: center; }

/* Scellé : froid, minéral — ce n'est pas une personne. */
.is-sealed { color: #6b7794; }

/* Déchiffré : la couleur du texte, l'objet devient un mot comme un autre. */
.is-clear { color: #dce1ea; font-weight: 600; }
</style>
