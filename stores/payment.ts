import { defineStore } from 'pinia'

export type PaymentStatus = 'idle' | 'pending' | 'processing' | 'success' | 'error'

export const usePaymentStore = defineStore('payment', {
  state: () => ({
    status: 'idle' as PaymentStatus,
    paymentId: null as string | null,
    applicationId: null as string | null,
    locationId: null as string | null,
    errorMessage: null as string | null,
  }),

  actions: {
    setIntent(data: { paymentId: string; applicationId: string; locationId: string }) {
      this.paymentId = data.paymentId
      this.applicationId = data.applicationId
      this.locationId = data.locationId
      this.status = 'pending'
      this.errorMessage = null
    },
    setProcessing() {
      this.status = 'processing'
      this.errorMessage = null
    },
    setSuccess() {
      this.status = 'success'
      this.errorMessage = null
    },
    setError(message: string) {
      this.status = 'error'
      this.errorMessage = message
    },
    reset() {
      this.status = 'idle'
      this.paymentId = null
      this.errorMessage = null
    },
  },
})
