export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()

  return new Promise<void>((resolve) => {
    window.fbAsyncInit = () => {
      window.FB.init({
        appId: config.public.facebookAppId as string,
        cookie: true,
        xfbml: false,
        version: 'v19.0',
      })
      resolve()
    }

    if (window.FB) {
      // SDK already loaded (e.g. hot reload) — just re-init
      window.fbAsyncInit()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://connect.facebook.net/fr_FR/sdk.js'
    script.async = true
    script.defer = true
    document.head.appendChild(script)
  })
})
