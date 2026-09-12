<script setup lang="ts">
import { usePlayerStore } from '~/stores/player'
import { useGameStore } from '~/stores/game'
import { interpolate } from '~/utils/prompt-builder'

/**
 * La fenêtre qui présente l'augmentation, au premier passage à la loupe.
 *
 * Le joueur vient d'obtenir un objet dont il ne sait rien : ni ce qu'il fait,
 * ni comment s'en servir. Sans ce moment, il repart avec une loupe dans la
 * barre d'outils sans savoir qu'elle existe ni qu'il faut S'ARRÊTER sur un mot.
 *
 * Elle s'ouvre au PREMIER passage à la loupe, pas à la remise : le détenteur
 * vient d'en dire deux mots, et couper sa réplique par une fenêtre arrivait
 * avant que le joueur ait quoi que ce soit à en faire.
 *
 * Le RÉCIT est brodé à partir des champs déjà générés de l'objet — il change
 * donc d'un joueur à l'autre, comme l'objet lui-même — et ne coûte aucun appel
 * supplémentaire. Le MODE D'EMPLOI, lui, est fixe : c'est une mécanique.
 *
 * C'EST AUSSI LE SEUL ENDROIT OÙ LA RÈGLE D'OBSERVATION SE DIT (`caps_note`).
 * L'augmentation, elle, vient d'un personnage : si rien ne le corrigeait, le
 * joueur en déduirait que tout s'obtient en parlant, et traverserait le reste
 * de la nuit sans jamais ramasser ce que les salles laissent traîner.
 */
const playerStore = usePlayerStore()
const gameStore = useGameStore()

const primer = computed(() => playerStore.scene?.augmentation_primer ?? null)

/** Vrai sur un appareil sans survol : c'est l'oeil gyroscopique qui vise. */
const usesGyro = computed(() =>
  import.meta.client && !window.matchMedia('(hover: hover) and (pointer: fine)').matches)

const story = computed(() => {
  const p = primer.value
  const item = playerStore.scene?.key_item
  if (!p || !item) return []
  // Un champ que le modèle a laissé vide ne doit pas laisser un trou dans la
  // phrase : le script porte un repli pour chacun.
  const f = p.story_fallbacks
  const values: Record<string, string> = {
    item_name: item.name,
    item_description: item.description || f.item_description,
    item_worn: item.worn || f.item_worn,
    item_why: item.why || f.item_why,
    // L'acte que l'augmentation rend possible : c'est le champ le plus
    // personnel de l'objet — il est taillé sur la manière d'agir du joueur et
    // sur la tension de son signe — et la fenêtre est le seul endroit où il
    // lui est dit en clair.
    item_action: item.resolving_action || f.item_action,
  }
  return p.story.map(line => interpolate(line, values)).filter(Boolean)
})

const steps = computed(() =>
  usesGyro.value ? primer.value?.howto_gyro ?? [] : primer.value?.howto_pointer ?? [])

function close() {
  gameStore.markPrimerSeen()
}
</script>

<template>
  <div
    v-if="primer"
    class="fixed inset-0 z-50 flex items-center justify-center px-6 py-8 overflow-y-auto"
    @click.self="close"
  >
    <div class="absolute inset-0 bg-ink-900/92" />

    <div
      class="relative z-10 w-full max-w-md bg-ink-900 border border-neon-600/50 p-7 space-y-6"
      style="box-shadow: 0 24px 60px rgba(0,0,0,0.8), 0 0 40px rgb(var(--neon-500) / 0.12)"
    >
      <span class="absolute inset-[5px] border border-neon-500/15 pointer-events-none" />

      <div class="space-y-2">
        <p class="text-neon-400/80 text-[10px] uppercase tracking-[0.32em] font-display">
          {{ primer.eyebrow }}
        </p>
        <p class="neon-text font-display uppercase text-xl tracking-[0.05em]">
          {{ playerStore.scene?.key_item?.name }}
        </p>
      </div>

      <div class="space-y-3">
        <p v-for="(line, i) in story" :key="i" class="text-ink-200/85 text-sm leading-relaxed">
          {{ line }}
        </p>
      </div>

      <div class="space-y-3 pt-1 border-t border-steel-600/40">
        <p class="text-neon-400/80 text-[10px] uppercase tracking-[0.28em] font-display pt-4">
          {{ primer.howto_title }}
        </p>
        <ol class="space-y-2">
          <li
            v-for="(step, i) in steps"
            :key="i"
            class="text-ink-200/80 text-[13px] leading-relaxed flex gap-3"
          >
            <span class="text-neon-500/70 font-mono shrink-0">{{ i + 1 }}</span>
            <span>{{ step }}</span>
          </li>
        </ol>
      </div>

      <p v-if="primer.caps_note" class="text-ink-200/80 text-[13px] leading-relaxed">
        {{ primer.caps_note }}
      </p>

      <p class="text-steel-400 text-[11px] leading-relaxed italic">
        {{ primer.footer }}
      </p>

      <GlowButton class="w-full" @click="close">{{ primer.cta }}</GlowButton>
    </div>
  </div>
</template>
