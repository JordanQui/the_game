import { useGameStore } from '~/stores/game'
import { usePaymentStore } from '~/stores/payment'

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

const PAYWALL_KEYWORDS = ['sortir', 'quitter', 'partir', 'dehors', 'porte', 'exit', 'leave', 'quitte', 'sort']

export function usePaywall() {
  const gameStore = useGameStore()
  const paymentStore = usePaymentStore()
  const config = useRuntimeConfig()

  let squareCard: Awaited<ReturnType<Awaited<ReturnType<typeof window.Square.payments>>['card']>> | null = null

  function checkPaywallTrigger(input: string, minTurns = 3): boolean {
    if (gameStore.turnCount < minTurns) return false
    const lower = input.toLowerCase()
    return PAYWALL_KEYWORDS.some(kw => lower.includes(kw))
  }

  async function initSquarePayments(containerSelector: string) {
    if (!window.Square) {
      await loadSquareSdk()
    }

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
    const data = await $fetch<{ paymentLinkId: string; url: string; applicationId: string; locationId: string }>(
      '/api/payment/intent',
      { method: 'POST', body: { colonneId: 'auberge_v1' } }
    )
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
      const errMsg = result.errors?.[0]?.message ?? 'Erreur de tokenisation'
      paymentStore.setError(errMsg)
      gameStore.setScreen('paywall')
      return false
    }

    try {
      await $fetch('/api/payment/confirm', {
        method: 'POST',
        body: { sourceId: result.token, colonneId: 'auberge_v1' },
      })
      paymentStore.setSuccess()
      gameStore.setScreen('payment_success')
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Paiement refusé'
      paymentStore.setError(msg)
      gameStore.setScreen('paywall')
      return false
    }
  }

  return { checkPaywallTrigger, initSquarePayments, fetchPaymentIntent, submitPayment }
}
