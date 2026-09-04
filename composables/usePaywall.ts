import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { usePaymentStore } from '~/stores/payment'
import { matchesKeyword } from '~/utils/text-match'

declare global {
  interface Window {
    Square: {
      payments(applicationId: string, locationId: string): Promise<{
        card(): Promise<{
          attach(selector: string): Promise<void>
          tokenize(): Promise<{ status: string; token?: string; errors?: Array<{ message: string }> }>
        }>
      }>
    }
  }
}

export function usePaywall() {
  const gameStore = useGameStore()
  const playerStore = usePlayerStore()
  const paymentStore = usePaymentStore()
  const config = useRuntimeConfig()

  let squareCard: Awaited<ReturnType<Awaited<ReturnType<typeof window.Square.payments>>['card']>> | null = null

  /**
   * Les mots-clés et le nombre de tours minimum viennent du script, portés par
   * la scène — plus aucune liste codée en dur côté client.
   */
  function checkPaywallTrigger(input: string): boolean {
    const paywall = playerStore.scene?.paywall
    if (!paywall) return false
    if (gameStore.turnCount < paywall.min_turns_before_trigger) return false
    return matchesKeyword(input, paywall.exit_keywords)
  }

  /** Le joueur parle de sortir, mais il est trop tôt : on le relance vers la porte. */
  function mentionsExit(input: string): boolean {
    const paywall = playerStore.scene?.paywall
    if (!paywall) return false
    return matchesKeyword(input, paywall.exit_keywords)
  }

  async function initSquarePayments(containerSelector: string) {
    if (!window.Square) await loadSquareSdk()

    const payments = await window.Square.payments(
      config.public.squareApplicationId,
      config.public.squareLocationId
    )
    squareCard = await payments.card()
    await squareCard.attach(containerSelector)
  }

  function loadSquareSdk(): Promise<void> {
    return new Promise((resolve) => {
      if (window.Square) { resolve(); return }
      const src = config.public.squareEnvironment === 'production'
        ? 'https://web.squarecdn.com/v1/square.js'
        : 'https://sandbox.web.squarecdn.com/v1/square.js'
      const script = document.createElement('script')
      script.src = src
      script.onload = () => resolve()
      document.head.appendChild(script)
    })
  }

  async function fetchPaymentIntent() {
    const data = await $fetch<{
      paymentLinkId: string
      url: string
      applicationId: string
      locationId: string
    }>('/api/payment/intent', { method: 'POST', body: {} })

    paymentStore.setIntent({
      paymentId: data.paymentLinkId,
      applicationId: data.applicationId,
      locationId: data.locationId,
    })
    return data
  }

  async function submitPayment() {
    if (!squareCard) {
      paymentStore.setError('Formulaire de paiement non initialisé')
      return false
    }

    paymentStore.setProcessing()
    gameStore.setScreen('payment_processing')

    const result = await squareCard.tokenize()
    if (result.status !== 'OK' || !result.token) {
      paymentStore.setError(result.errors?.[0]?.message ?? 'Erreur de tokenisation')
      gameStore.setScreen('paywall')
      return false
    }

    try {
      await $fetch('/api/payment/confirm', {
        method: 'POST',
        body: { sourceId: result.token },
      })
      paymentStore.setSuccess()
      gameStore.setScreen('payment_success')
      return true
    } catch (err) {
      paymentStore.setError(err instanceof Error ? err.message : 'Paiement refusé')
      gameStore.setScreen('paywall')
      return false
    }
  }

  return { checkPaywallTrigger, mentionsExit, initSquarePayments, fetchPaymentIntent, submitPayment }
}
