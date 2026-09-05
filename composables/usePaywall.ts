import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
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

export function usePaywall() {
  const gameStore = useGameStore()
  const playerStore = usePlayerStore()
  const paymentStore = usePaymentStore()
  const progression = useProgression()
  const config = useRuntimeConfig()

  let squareCard: Awaited<ReturnType<Awaited<ReturnType<typeof window.Square.payments>>['card']>> | null = null

  /**
   * Ouvre la sortie. Un joueur qui a déjà payé passe directement à la suite :
   * le droit d'accès dure un mois, on ne lui repropose pas le paiement.
   */
  function openExit() {
    // Garde-fou : on ne quitte pas une scène dont l'objectif n'est pas rempli.
    // Le deck écarte déjà la sortie tant que l'objet manque, mais rien
    // n'empêchait un autre chemin — un raccourci, un bouton — d'avancer sans.
    if (!objectiveMet()) return

    // Seule la scène-porte demande le paiement. Ailleurs, franchir la sortie
    // fait simplement passer à la suite — sans quoi chaque scène renverrait à
    // l'écran de succès puis à elle-même, en boucle.
    const isGate = playerStore.scene?.is_paywall_gate === true
    if (!isGate || paymentStore.hasAccess) {
      if (progression.advance()) return
      // Plus rien après : on laisse l'écran de succès, qui conclut.
      gameStore.setScreen('payment_success')
      return
    }
    gameStore.triggerPaywall()
  }

  /**
   * L'objectif de la scène est-il rempli ?
   *
   * Une scène se quitte quand on a ce qu'on était venu y chercher. Une scène
   * sans objet-clé — s'il en existe — n'a rien à exiger.
   */
  function objectiveMet(): boolean {
    if (!playerStore.scene?.key_item) return true
    return gameStore.hasKeyItem
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
      const confirmed = await $fetch<{ expiresAt?: number }>('/api/payment/confirm', {
        method: 'POST',
        body: { sourceId: result.token },
      })
      paymentStore.setSuccess(confirmed?.expiresAt ?? null)
      gameStore.setScreen('payment_success')
      return true
    } catch (err) {
      paymentStore.setError(err instanceof Error ? err.message : 'Paiement refusé')
      gameStore.setScreen('paywall')
      return false
    }
  }

  // Les prédicats de sortie — « il en parle », « il est trop tôt », « l'objet
  // manque » — vivent désormais dans les qualités du deck : ils s'y lisent
  // dans l'ordre où ils se jouent. Ne reste ici que l'ouverture elle-même.
  return { objectiveMet, openExit, initSquarePayments, fetchPaymentIntent, submitPayment }
}
