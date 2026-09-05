import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

/**
 * La palette qui teint les premiers écrans.
 *
 * Lue dans le script au build et exposée telle quelle : l'accueil et la scène 1
 * n'ont pas de scène chargée d'où tirer leurs couleurs, mais leur rose doit
 * quand même venir d'un `palette.accent` — le même chemin que les scènes
 * générées, une seule source de vérité. Seules ces trois couleurs partent au
 * client : le script entier n'a rien à y faire.
 */
const script = JSON.parse(readFileSync(
  new URL('./game/script.json', import.meta.url), 'utf-8',
))
const uiPalette = script.defaults.interface_palette.palette

/**
 * L'empreinte du script, telle que le client peut la comparer.
 *
 * Le serveur en tamponnait déjà chaque scène (`script_fingerprint`) en
 * annonçant qu'elle servirait « à jeter une scène gardée en session dès que le
 * script a changé ». Personne ne la lisait : le client ne comparait que le
 * `build_id`, qui ne bouge pas d'un rechargement à l'autre. Résultat, modifier
 * un prompt ne changeait rien pour qui avait déjà une scène dans son onglet —
 * on croyait livrer sans effet.
 *
 * Même calcul que `server/utils/script-fingerprint.ts`, sur le même objet
 * reparsé : les deux empreintes coïncident.
 */
const scriptFingerprint = createHash('sha256')
  .update(JSON.stringify(script)).digest('hex').slice(0, 12)

/**
 * L'ordre des scènes, pour que `#scene<n>` sache où aller.
 *
 * Des identifiants et des titres, rien d'autre : le contenu du script reste
 * côté serveur. C'est ce qui permet au raccourci de désigner une scène par son
 * numéro sans que le client connaisse l'histoire.
 */
/**
 * L'inventaire de développement, exposé HORS PRODUCTION uniquement.
 *
 * En production il vaut `null` : aucun joueur ne doit recevoir un jeu complet
 * de cartes, et la liste n'a même pas à figurer dans le bundle.
 */
const devInventory = process.env.NODE_ENV === 'production' ? null : script.dev_inventory

const sceneIndex = script.progression.order.map((id: string) => {
  const scene = script.scenes.find((s: { id: string }) => s.id === id)
  return { id, title: scene?.title ?? id, act: scene?.act ?? null, kind: scene?.kind ?? 'scene' }
})

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
      title: 'La Nuit du Bout du Monde',
      htmlAttrs: { lang: 'fr' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#080b12' },
      ],
    },
  },

  runtimeConfig: {
    facebookAppSecret: process.env.FACEBOOK_APP_SECRET,
    openaiApiKey: process.env.OPENAI_API_KEY,
    squareAccessToken: process.env.SQUARE_ACCESS_TOKEN,
    nuxtSecret: process.env.NUXT_SECRET,

    public: {
      /** Dominante, secondaire et accent de l'auberge. Voir plus haut. */
      uiPalette,
      /** Les dix scènes, dans l'ordre. Identifiants et titres seulement. */
      sceneIndex,
      /** Inventaire complet de test. `null` en production. */
      devInventory,
      /** Empreinte du script : une scène née d'une autre version est jetée. */
      scriptFingerprint,
      facebookAppId: process.env.FACEBOOK_APP_ID,
      squareApplicationId: process.env.SQUARE_APPLICATION_ID,
      squareLocationId: process.env.SQUARE_LOCATION_ID,
      squareEnvironment: process.env.SQUARE_ENVIRONMENT || 'sandbox',
    },
  },

  /**
   * Le script fait partie de la configuration.
   *
   * Il est lu ici, au chargement de nuxt.config, pour en tirer la palette, la
   * liste des scènes et l'empreinte. Sans ce watch, le modifier en dev laissait
   * ces trois valeurs périmées jusqu'au prochain redémarrage — et l'empreinte
   * périmée aurait fait jeter la scène de session à CHAQUE rechargement.
   */
  watch: ['game/script.json'],

  nitro: {
    preset: process.env.VERCEL ? 'vercel' : undefined,
  },
})
