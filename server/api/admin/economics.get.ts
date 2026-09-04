import { ScriptRuntime } from '~/utils/script-runtime'

/**
 * Les données de la page de marge.
 *
 * L'accès est fermé par server/middleware/admin-guard.ts, qui rend tout /admin
 * inexistant hors développement. Pas de garde en double ici : deux règles
 * concurrentes finissent toujours par diverger.
 */
export default defineEventHandler(async () => {
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
