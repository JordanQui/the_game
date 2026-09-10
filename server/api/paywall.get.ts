import { ScriptRuntime } from '~/utils/script-runtime'
import { interpolate } from '~/utils/prompt-builder'
import { requestLang } from '~/server/utils/lang'
import { translate } from '~/utils/languages'

/**
 * Le paywall sans scène chargée.
 *
 * Un visiteur qui a épuisé son quota gratuit n'a plus de scène en mémoire : il
 * faut pourtant lui proposer de payer, pas lui montrer une erreur. Cette route
 * sert les textes du script avec des tournures neutres. Aucune génération,
 * aucun coût.
 */
export default defineEventHandler(async (event) => {
  const runtime = await ScriptRuntime.load(requestLang(event))
  const p = runtime.paywall

  // Sans quête générée, on remplace les variables par des tournures qui se
  // tiennent debout toutes seules.
  const lang = requestLang(event)
  const vars = {
    quest_title: translate(lang, 'paywall.fallback_quest'),
    quest_artifact: translate(lang, 'paywall.fallback_artifact'),
    place_name: translate(lang, 'paywall.fallback_place'),
  }

  // Les tournures de repli sont en minuscule : elles conviennent en milieu de
  // phrase (« Derrière, ce que tu cherches… ») mais pas en tête. On remet donc
  // la majuscule quand la variable ouvre le texte.
  const fill = (template: string) => {
    const text = interpolate(template, vars)
    return text.charAt(0).toUpperCase() + text.slice(1)
  }

  return {
    gate_text: fill(p.gate_text),
    cta: interpolate(p.cta, vars),
    sub_cta: fill(p.sub_cta),
    amount_cents: p.amount_cents,
    currency: p.currency,
    exit_keywords: [] as string[],
    min_turns_before_trigger: 0,
    pitch: {
      eyebrow: p.pitch.eyebrow,
      points: p.pitch.points.map(pt => ({ label: pt.label, text: fill(pt.text) })),
      closing: fill(p.pitch.closing),
    },
  }
})
