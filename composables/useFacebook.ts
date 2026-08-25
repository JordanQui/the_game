import type { FacebookRawProfile } from '~/types/facebook'
import { classifyFacebookData } from '~/utils/facebook-classifier'
import { usePlayerStore } from '~/stores/player'
import { useGameStore } from '~/stores/game'

declare global {
  interface Window {
    FB: {
      init(options: object): void
      login(callback: (response: { authResponse?: { accessToken: string } }) => void, options?: object): void
      api(path: string, callback: (response: unknown) => void): void
    }
    fbAsyncInit: () => void
  }
}

export function useFacebook() {
  const playerStore = usePlayerStore()
  const gameStore = useGameStore()

  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function login() {
    isLoading.value = true
    error.value = null

    try {
      // SDK is already initialized by plugins/facebook-sdk.client.ts
      if (!window.FB) {
        throw new Error('Le SDK Facebook n\'est pas encore chargé. Veuillez réessayer.')
      }

      const accessToken = await new Promise<string>((resolve, reject) => {
        window.FB.login((response) => {
          if (response.authResponse?.accessToken) {
            resolve(response.authResponse.accessToken)
          } else {
            reject(new Error('Connexion Facebook annulée'))
          }
        }, {
          scope: [
            'public_profile',
            'user_education_history',
            'user_work_history',
            'user_birthday',
            'user_location',
            'user_hometown',
            'user_likes',
          ].join(','),
        })
      })

      gameStore.setScreen('facebook_loading')

      const { profile } = await $fetch<{ profile: FacebookRawProfile }>('/api/auth/facebook', {
        method: 'POST',
        body: { accessToken },
      })

      const classified = classifyFacebookData(profile)
      playerStore.setFacebookData(classified)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Erreur de connexion Facebook'
      gameStore.setScreen('login')
    } finally {
      isLoading.value = false
    }
  }

  return { login, isLoading, error }
}
