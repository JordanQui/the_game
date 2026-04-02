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
  const config = useRuntimeConfig()
  const playerStore = usePlayerStore()
  const gameStore = useGameStore()

  const isLoading = ref(false)
  const error = ref<string | null>(null)

  function loadSdk(): Promise<void> {
    return new Promise((resolve) => {
      if (window.FB) {
        resolve()
        return
      }
      window.fbAsyncInit = () => {
        window.FB.init({
          appId: config.public.facebookAppId,
          cookie: true,
          xfbml: false,
          version: 'v19.0',
        })
        resolve()
      }
      const script = document.createElement('script')
      script.src = 'https://connect.facebook.net/fr_FR/sdk.js'
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    })
  }

  async function login() {
    isLoading.value = true
    error.value = null

    try {
      await loadSdk()

      const accessToken = await new Promise<string>((resolve, reject) => {
        window.FB.login((response) => {
          if (response.authResponse?.accessToken) {
            resolve(response.authResponse.accessToken)
          } else {
            reject(new Error('Facebook login cancelled or failed'))
          }
        }, {
          scope: [
            'public_profile', 'email',
            'user_education_history', 'user_work_history',
            'user_birthday', 'user_location', 'user_hometown',
            'user_likes', 'user_about_me',
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
