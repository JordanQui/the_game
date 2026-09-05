import OpenAI from 'openai'
import type { GeneratedScene, SceneTextResponse, GeneratedEnding } from '~/types/scene'
import type { UserProfile } from '~/types/user'
import type { JournalEntry, CarriedItem } from '~/utils/journal'
import { ScriptRuntime, loadUserFixture, resolveTheme } from '~/utils/script-runtime'
import { requireSecret } from '~/server/utils/runtime-secrets'
import { assertNotLocked, consumeQuota, lockOut } from '~/server/utils/session-quota'
import { mockKey, readMock, writeMock, wantsFresh, scriptFingerprint } from '~/server/utils/dev-mocks'

/**
 * Phase 1 du pipeline : le texte.
 *
 * Renvoie une scène immédiatement jouable, sans attendre l'illustration.
 * Le client enchaîne ensuite sur /api/scene/image s'il en veut une.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody<{
    sceneId?: string
    /** Profil joueur. Omis en dev : on retombe sur game/user.json. */
    user?: UserProfile
    /**
     * Ce que le joueur a déjà vécu. Envoyé par le client, qui le tient : le
     * serveur ne garde aucun état entre deux scènes.
     */
    journal?: JournalEntry[]
    /** Ce que le joueur porte. La scène doit pouvoir bâtir son puzzle dessus. */
    carried?: CarriedItem[]
  }>(event) ?? {}

  const runtime = await ScriptRuntime.load()
  // Quota de session : arrête l'abus par rechargement avant tout appel payant.
  const limits = runtime.script.limits
  assertNotLocked(event)
  consumeQuota(event, 'scenes', limits)

  const scene = runtime.scene(body.sceneId)
  const user = body.user ?? await loadUserFixture()

  // En développement, on rejoue la dernière scène enregistrée plutôt que de
  // repayer la même génération à chaque relance. `?fresh=1` la renouvelle.
  const key = mockKey(scene.id, `${user.identity.name}|${user.identity.birthday ?? ''}|${body.journal?.length ?? 0}|${body.carried?.length ?? 0}`, scriptFingerprint(runtime.script))
  if (import.meta.dev && !wantsFresh(event)) {
    const cached = await readMock<SceneTextResponse>('scene', key)
    if (cached) return cached
  }

  const openai = new OpenAI({ apiKey: requireSecret(config.openaiApiKey, 'OPENAI_API_KEY') })
  const gen = scene.generation

  // L'épilogue ne suit pas le schéma des autres scènes : ni personnages, ni
  // quête, ni objet-clé. Il rend un texte, une palette de couchant et de quoi
  // peupler l'image de ce que ce joueur-là a traversé.
  const isEnding = scene.kind === 'ending'

  let completion
  try {
    completion = await openai.chat.completions.create({
      model: gen.model,
      temperature: gen.temperature,
      max_tokens: gen.max_tokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: gen.system_prompt },
        {
          role: 'user',
          content: isEnding
            ? scene.buildEndingPrompt(user, body.journal ?? [], body.carried ?? [])
            : scene.buildGenerationPrompt(user, body.journal ?? [], body.carried ?? []),
        },
      ],
    })
  } catch (err) {
    throw createError({
      statusCode: 502,
      statusMessage: err instanceof Error ? err.message : `Appel à ${gen.model} échoué`,
    })
  }

  const choice = completion.choices[0]
  const raw = choice?.message?.content
  if (!raw) {
    throw createError({ statusCode: 502, statusMessage: `${gen.model} n'a rien renvoyé` })
  }

  // Coupé au plafond : le JSON s'arrête au milieu d'une chaîne et `JSON.parse`
  // échoue plus bas, sur un message qui accuse le modèle à tort. On le dit ici,
  // pendant qu'on sait encore pourquoi — c'est `max_tokens` qu'il faut lever,
  // ou le schéma qu'il faut alléger.
  if (choice.finish_reason === 'length') {
    console.error(
      `[scene/text] réponse tronquée à max_tokens=${gen.max_tokens}`,
      `(${completion.usage?.completion_tokens ?? '?'} tokens produits)`)
    throw createError({
      statusCode: 502,
      statusMessage: `Réponse tronquée : la scène dépasse le plafond de ${gen.max_tokens} tokens`,
    })
  }

  let generated: GeneratedScene
  try {
    generated = JSON.parse(raw) as GeneratedScene
  } catch {
    // Les 300 derniers caractères disent où ça s'est arrêté — sans eux, on ne
    // peut pas distinguer une coupure d'un modèle qui bavarde hors JSON.
    console.error('[scene/text] JSON invalide, fin de la réponse :', raw.slice(-300))
    throw createError({ statusCode: 502, statusMessage: `${gen.model} a renvoyé un JSON invalide` })
  }

  if (isEnding) {
    try {
      const journal = body.journal ?? []
      const ending = generated as unknown as GeneratedEnding
      const assembled = {
        ...scene.assembleEnding(ending, journal[journal.length - 1]?.place_name ?? ''),
        script_fingerprint: scriptFingerprint(runtime.script),
      }

      // L'histoire est traversée : la ville se ferme, et pour de bon. Ce monde
      // a été bâti pour ce joueur-là et il ne se rejoue pas — c'est ce que
      // promet le paywall, et c'est aussi ce qui rend la fenêtre payante
      // tenable. L'adieu part dans le cookie : il doit survivre au
      // rechargement, l'épilogue ne s'affiche qu'une fois.
      lockOut(event, limits.lock.completed_days * 24, 'completed', ending.farewell)

      await writeMock('scene', key, assembled)
      return assembled
    } catch (err) {
      console.error('[scene/text] épilogue invalide :', err instanceof Error ? err.message : err)
      throw createError({
        statusCode: 502,
        statusMessage: err instanceof Error ? err.message : 'Fin invalide',
      })
    }
  }

  try {
    scene.assertValid(generated)
  } catch (err) {
    console.error('[scene/text] scène invalide :', err instanceof Error ? err.message : err)
    throw createError({
      statusCode: 502,
      statusMessage: err instanceof Error ? err.message : 'Scène invalide',
    })
  }

  const assembled = {
    ...scene.assembleText(generated, resolveTheme(user, runtime.script)),
    // Permet au client de jeter une scène gardée en session dès que le script
    // a changé — sans quoi un déploiement reste invisible pour lui.
    script_fingerprint: scriptFingerprint(runtime.script),
  }
  await writeMock('scene', key, assembled)
  return assembled
})
