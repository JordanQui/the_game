import { ScriptRuntime } from '~/utils/script-runtime'

/**
 * Les données de la page de marge.
 *
 * Rien de secret ici — ce sont des prix unitaires et des hypothèses — mais
 * l'économie d'un produit n'a pas à être publique. En production la route
 * exige donc ADMIN_KEY ; sans cette variable elle reste fermée, ce qui évite
 * une exposition par oubli de configuration.
 */
export default defineEventHandler(async (event) => {
  if (!import.meta.dev) {
    const expected = process.env.ADMIN_KEY
    const provided = getQuery(event).key

    if (!expected || provided !== expected) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }
  }

  const runtime = await ScriptRuntime.load()
  const s = runtime.script

  return {
    pricing: s.pricing,
    limits: s.limits,
    economics: s.economics,
    turn: {
      max_tokens: s.defaults.turn.max_tokens,
      hard_turn_cap: s.defaults.turn.hard_turn_cap,
    },
    generation: { max_tokens: s.defaults.generation.max_tokens },
    art: { image_size: s.defaults.art_direction.image_size },
  }
})
