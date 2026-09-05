<script setup lang="ts">
import { usePlayerStore } from '~/stores/player'
import { useGameStore } from '~/stores/game'
import { useInterfacePalette } from '~/composables/useInterfacePalette'
import type { EndingResponse } from '~/types/scene'

/**
 * L'épilogue.
 *
 * Deux couches : l'image du couchant, générée et peuplée de ce que le joueur a
 * traversé, et par-dessus le texte de fin en HTML. C'est ce montage qui permet
 * d'avoir du vrai texte français lisible — aucun modèle d'image ne sait en
 * produire. Le HTML a été réduit côté serveur aux quatre balises autorisées.
 */
const playerStore = usePlayerStore()
const gameStore = useGameStore()
const interfacePalette = useInterfacePalette()

const ending = ref<EndingResponse | null>(null)
const image = ref<string | null>(null)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    ending.value = await $fetch<EndingResponse>('/api/scene/text', {
      method: 'POST',
      body: {
        sceneId: 'fin',
        user: playerStore.profile ?? undefined,
        journal: playerStore.journal,
        carried: gameStore.inventory.map(o => ({
          id: o.id,
          label: o.label,
          decrypted: gameStore.decryptedObjectIds.includes(o.id),
          from: o.from,
        })),
      },
    })
    // Le couchant a sa propre palette : l'interface la prend aussi.
    interfacePalette.applyScene(ending.value)
  } catch (err) {
    error.value = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
      ?? 'La fin ne s\'est pas écrite.'
    return
  }

  // L'image ne bloque pas la lecture : le texte est déjà là.
  try {
    const res = await $fetch<{ image: string }>('/api/scene/image', {
      method: 'POST',
      body: {
        scene_id: 'fin',
        place_name: ending.value.scene_title,
        palette: ending.value.palette,
        decor: ending.value.decor,
      },
    })
    image.value = res.image
  } catch {
    // Sans image, le texte tient debout tout seul sur le fond de la palette.
  }
})
</script>

<template>
  <div class="ending">
    <!-- L'image, en fond. Recadrée : le texte passe devant, pas à côté. -->
    <img v-if="image" :src="image" alt="" class="backdrop">
    <div class="veil" />

    <div class="sheet">
      <p v-if="error" class="text-neon-300 font-mono text-sm">{{ error }}</p>
      <!-- Réduit aux balises <h2> <p> <em> <strong> par le serveur. -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <article v-else-if="ending" class="prose" v-html="ending.ending_html" />
      <p v-else class="text-ink-200/70 font-mono text-sm animate-pulse">
        Le jour se lève sur la ville...
      </p>
    </div>
  </div>
</template>

<style scoped>
.ending {
  position: relative;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.25rem;
  background: rgb(var(--ink-900));
  overflow: hidden;
}

.backdrop {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/*
 * Sans ce voile, le texte se pose sur une image dont on ne maîtrise ni la
 * luminosité ni le contraste : illisible une partie sur deux. Il s'ouvre au
 * centre, là où le soleil doit rester visible.
 */
.veil {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgb(var(--ink-900) / 0.92) 0%, rgb(var(--ink-900) / 0.55) 38%,
                    rgb(var(--ink-900) / 0.55) 62%, rgb(var(--ink-900) / 0.94) 100%);
}

.sheet {
  position: relative;
  max-width: 34rem;
  width: 100%;
}

.prose :deep(h2) {
  font-family: Futura, 'Avenir Next', 'Century Gothic', 'Trebuchet MS', system-ui, sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: clamp(1.35rem, 5vw, 2rem);
  line-height: 1.15;
  color: rgb(var(--neon-200));
  text-shadow: 0 0 10px rgb(var(--neon-500) / 0.75), 0 0 28px rgb(var(--neon-500) / 0.4);
  margin-bottom: 1.5rem;
}

.prose :deep(p) {
  color: rgb(var(--ink-100) / 0.92);
  font-size: 0.98rem;
  line-height: 1.75;
  margin-bottom: 1rem;
}

.prose :deep(em) {
  font-style: normal;
  color: rgb(var(--neon-300));
}

.prose :deep(strong) {
  font-weight: 600;
  color: rgb(var(--neon-200));
}
</style>
