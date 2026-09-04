<script setup lang="ts">
import { usePaywall } from '~/composables/usePaywall'
import { usePaymentStore } from '~/stores/payment'
import { usePlayerStore } from '~/stores/player'

const { initSquarePayments, fetchPaymentIntent, submitPayment } = usePaywall()
const paymentStore = usePaymentStore()
const playerStore = usePlayerStore()

const isInitializing = ref(true)

// Tout le texte du paywall vient du script, interpolé avec la quête du joueur.
const paywall = computed(() => playerStore.scene?.paywall ?? null)
const price = computed(() => {
  const p = paywall.value
  if (!p) return ''
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: p.currency })
    .format(p.amount_cents / 100)
})

onMounted(async () => {
  try {
    await fetchPaymentIntent()
    await nextTick()
    await initSquarePayments('#card-container')
  } catch (err) {
    paymentStore.setError(err instanceof Error ? err.message : 'Paiement indisponible')
  } finally {
    isInitializing.value = false
  }
})
</script>

<template>
  <div class="min-h-[100dvh] flex flex-col items-center justify-center px-5 py-10">
    <div class="w-full max-w-md space-y-7">

      <!-- Narration de la porte -->
      <div class="text-center space-y-4">
        <div class="w-16 h-px bg-gradient-to-r from-transparent via-amber-700/60 to-transparent mx-auto" />
        <p class="text-parchment/80 font-serif text-[15px] sm:text-sm italic leading-relaxed whitespace-pre-line">
          {{ paywall?.gate_text }}
        </p>
        <p v-if="paywall" class="text-amber-400/60 text-xs font-serif italic">
          {{ paywall.sub_cta }}
        </p>
        <div class="w-16 h-px bg-gradient-to-r from-transparent via-amber-700/60 to-transparent mx-auto" />
      </div>

      <!-- Prix -->
      <div class="text-center">
        <p class="text-amber-300 font-serif text-3xl text-glow">{{ price }}</p>
      </div>

      <!-- Formulaire Square -->
      <div class="panel-ancient p-4 space-y-4">
        <p class="text-amber-600/70 text-xs uppercase tracking-widest text-center">
          Paiement sécurisé
        </p>
        <div v-if="isInitializing" class="h-12 flex items-center justify-center">
          <p class="text-parchment/40 text-sm italic">Chargement du formulaire...</p>
        </div>
        <div id="card-container" />

        <p v-if="paymentStore.errorMessage" class="text-red-400/80 text-xs text-center">
          {{ paymentStore.errorMessage }}
        </p>
      </div>

      <div class="text-center">
        <GlowButton
          :loading="paymentStore.status === 'processing'"
          :disabled="isInitializing"
          class="w-full"
          @click="submitPayment"
        >
          {{ paywall?.cta ?? 'Continuer' }}
        </GlowButton>
      </div>

      <p class="text-ink-500 text-xs text-center">
        Aventure de {{ playerStore.playerName }} — {{ playerStore.place?.name }}
      </p>
    </div>
  </div>
</template>
