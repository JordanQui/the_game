export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },

  modules: [
    '@nuxtjs/tailwindcss',
    '@pinia/nuxt',
  ],

  components: [
    { path: '~/components', pathPrefix: false },
  ],

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      htmlAttrs: { lang: 'fr' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#0d0a07' },
      ],
    },
  },

  runtimeConfig: {
    facebookAppSecret: process.env.FACEBOOK_APP_SECRET,
    openaiApiKey: process.env.OPENAI_API_KEY,
    squareAccessToken: process.env.SQUARE_ACCESS_TOKEN,
    nuxtSecret: process.env.NUXT_SECRET,

    public: {
      facebookAppId: process.env.FACEBOOK_APP_ID,
      squareApplicationId: process.env.SQUARE_APPLICATION_ID,
      squareLocationId: process.env.SQUARE_LOCATION_ID,
      squareEnvironment: process.env.SQUARE_ENVIRONMENT || 'sandbox',
    },
  },

  nitro: {
    preset: process.env.VERCEL ? 'vercel' : undefined,
  },
})
