import type { SceneScript } from '~/types/script'
import { ScriptRuntime } from '~/utils/script-runtime'
import { DECK } from '~/utils/storylets'

/**
 * Les données de la page de trame.
 *
 * Tout est LU dans game/script.json et dans le deck de moments, rien n'est
 * recopié : la page doit dire ce que le jeu fait aujourd'hui, pas ce qu'il
 * faisait quand elle a été écrite. L'accès est fermé par
 * server/middleware/admin-guard.ts.
 */

/** Ce que la scène fait obtenir, lu dans sa consigne d'objet-clé. */
function keyNature(scene: SceneScript): string {
  const text = scene.key_item?.instruction ?? ''
  // Du plus précis au plus vague : la consigne de la fréquence dit aussi
  // « n'est PAS une carte », d'où les majuscules exigées.
  if (text.includes('AUGMENTATION')) return 'augmentation'
  if (text.includes('SÉQUENCE D\'OPÉRATION')) return 'séquence d\'opération'
  if (text.includes('FRÉQUENCE')) return 'fréquence'
  if (text.includes('CARTE D\'ACCÈS')) return 'carte d\'accès'
  if (text.includes('CODE')) return 'code'
  return 'objet-clé'
}

const note = (block?: { note?: string; instruction?: string }) => ({
  note: block?.note ?? '',
  instruction: block?.instruction ?? '',
})

export default defineEventHandler(async () => {
  const { script: s } = await ScriptRuntime.load()
  const order = s.progression.order
  const d = s.defaults

  const scenes = order.map((id) => {
    const sc = s.scenes.find(x => x.id === id)!
    const next = order[order.indexOf(id) + 1] ?? null
    const isEnding = sc.kind === 'ending'
    return {
      id,
      title: sc.title,
      order: sc.order,
      act: sc.act ?? '',
      ending: isEnding,
      free: sc.is_free,
      gate: sc.is_paywall_gate,
      static_image: sc.static_image ?? null,
      mechanic: sc.mechanic ?? '',
      objective: sc.objective ?? null,
      theme_focus: sc.theme_focus ?? null,
      npc_count: sc.npcs?.count ?? 0,
      npc_instruction: sc.npcs?.instruction ?? '',
      cast_stances: sc.cast_stances ?? [],
      knowledge: sc.npcs?.knowledge?.fragments ?? [],
      key_item: isEnding ? null : {
        nature: keyNature(sc),
        acquisition: sc.key_item.acquisition ?? 'informant_then_holder',
        exchanges_before_handover: sc.key_item.exchanges_before_handover,
        holder_stance: sc.key_item.holder_stance ?? '',
        informant_stance: sc.key_item.informant_stance ?? '',
        instruction: sc.key_item.instruction,
      },
      exits: (sc.exits ?? []).map(e => ({
        label: e.label,
        leads_to: e.leads_to ?? next,
        min_turns: e.min_turns_before_trigger ?? 0,
      })),
      always_include: sc.interactables?.always_include ?? [],
      counsel: sc.counsel ?? null,
    }
  })

  return {
    meta: { title: s.meta.title, version: s.version, genre: s.meta.genre, mode: s.meta.narrative_mode },
    start: s.progression.start_scene,
    acts: s.acts,
    scenes,
    pacing: {
      steer_after_turns: d.turn.steer_after_turns,
      exchanges_before_steer: d.turn.exchanges_before_steer ?? 2,
      hard_turn_cap: d.turn.hard_turn_cap,
      lock_turns: s.limits.lock.turns_per_scene,
      lock_hours: s.limits.lock.hours,
      completed_days: s.limits.lock.completed_days,
    },
    paywall: { amount: s.paywall.amount_cents / 100, currency: s.paywall.currency },
    deck: DECK.map(x => ({ id: x.id, note: x.note, play: x.play, after: x.after ?? [] })),
    schema: {
      night: d.generation.output_schema.night,
      quest: d.quest.structure,
      key_item: d.generation.output_schema.key_item,
      sealed_object: d.generation.output_schema.sealed_object,
    },
    dossier: {
      signs: Object.values(s.zodiac.signs),
      numbers: Object.entries(s.numerology.numbers).map(([n, v]) => ({ n, ...v })),
      postures: s.onomastics.posture,
    },
    rules: [
      { id: 'night', title: 'La quête de la nuit — le but', note: d.night.note ?? '', instruction: d.night.instruction },
      { id: 'plan', title: 'Le plan de la nuit — les 6 lieux', note: '', instruction: d.night.plan },
      { id: 'derives', title: 'Ce qui découle du but', note: '', instruction: d.night.derives },
      { id: 'fixed', title: 'Ce que reçoit une scène après l\'auberge', note: '', instruction: d.night.fixed },
      { id: 'objective', title: 'Objectif d\'une scène', ...note(d.objective_derivation) },
      { id: 'cast', title: 'Distribution des personnages', ...note(d.cast) },
      { id: 'sealed', title: 'L\'objet scellé', ...note(d.sealed_object) },
      { id: 'exchange', title: 'L\'échange', ...note(d.exchange) },
      { id: 'inventory', title: 'L\'inventaire', note: d.inventory.note ?? '', instruction: d.inventory.prompt },
      { id: 'locks', title: 'Cartes et serrures', ...note(d.locks) },
      { id: 'game_over', title: 'La fermeture', ...note(d.game_over) },
      { id: 'deep_theme', title: 'Le thème profond', ...note(d.deep_theme) },
      { id: 'continuity', title: 'La continuité entre scènes', note: d.continuity.note ?? '', instruction: d.continuity.prompt },
    ],
  }
})
