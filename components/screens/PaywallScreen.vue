<script setup lang="ts">
import { usePaywall } from '~/composables/usePaywall'
import { usePaymentStore } from '~/stores/payment'
import { usePlayerStore } from '~/stores/player'

const { initSquarePayments, fetchPaymentIntent, submitPayment } = usePaywall()
const paymentStore = usePaymentStore()
const playerStore = usePlayerStore()

const isInitializing = ref(true)
const paywallMessage = 'Vous posez la main sur la poignée de la porte. L\'air froid de la nuit s\'infiltre par les interstices...'

onMounted(async () => {
  await fetchPaymentIntent()
  await nextTick()
  await initSquarePayments('#card-container')
  isInitializing.value = false
})

async function pay() {
  await submitPayment()
}
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center px-6">
    <div class="w-full max-w-md space-y-8">

      <!-- Paywall narrative -->
      <div class="text-center space-y-4">
        <div class="w-16 h-px bg-gradient-to-r from-transparent via-amber-700/60 to-transparent mx-auto" />
        <p class="text-parchment/80 font-serif text-sm italic leading-relaxed">
          <TypewriterText :text="paywallMessage" />
        </p>
        <p class="text-amber-400/60 text-xs font-serif italic">
          La quête vous attend... mais le monde au-delà a un prix.
        </p>
        <div class="w-16 h-px bg-gradient-to-r from-transparent via-amber-700/60 to-transparent mx-auto" />
      </div>

      <!-- Price -->
      <div class="text-center">
        <p class="text-amber-300 font-serif text-3xl text-glow">10 €</p>
        <p class="text-parchment/50 text-xs mt-1">Accès complet à la quête</p>
      </div>

      <!-- Square payment form -->
      <div class="panel-ancient p-4 space-y-4">
        <p class="text-amber-600/70 text-xs uppercase tracking-widest text-center">
          Paiement sécurisé
        </p>
        <div v-if="isInitializing" class="h-12 flex items-center justify-center">
          <p class="text-parchment/40 text-sm italic">Chargement du formulaire...</p>
        </div>
        <div id="card-container" />

        <!-- Error -->
        <p v-if="paymentStore.errorMessage" class="text-red-400/80 text-xs text-center">
          {{ paymentStore.errorMessage }}
        </p>
      </div>

      <!-- Pay button -->
      <div class="text-center">
        <GlowButton
          :loading="paymentStore.status === 'processing'"
          :disabled="isInitializing"
          class="w-full"
          @click="pay"
        >
          Poursuivre la quête — 10€
        </GlowButton>
      </div>

      <!-- Player context -->
      <p class="text-ink-500 text-xs text-center">
        Aventure de {{ playerStore.playerName }} dans {{ playerStore.world?.name }}
      </p>
    </div>
  </div>
</template>
