import { loadUserFixture } from '~/utils/script-runtime'

/** Profil de démonstration : permet de jouer la scène sans passer par Meta. */
export default defineEventHandler(async () => {
  return await loadUserFixture()
})
