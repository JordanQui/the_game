import { SquareClient, SquareEnvironment } from 'square'
import { ScriptRuntime } from '~/utils/script-runtime'
import { requireSecret } from '~/server/utils/runtime-secrets'
import { grantAccess } from '~/server/utils/session-quota'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody<{ sourceId: string }>(event)

  if (!body?.sourceId) {
    throw createError({ statusCode: 400, statusMessage: 'sourceId manquant' })
  }

  const runtime = await ScriptRuntime.load()
  const paywall = runtime.paywall

  const client = new SquareClient({
    token: requireSecret(config.squareAccessToken, 'SQUARE_ACCESS_TOKEN'),
    environment: config.public.squareEnvironment === 'production'
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox,
  })

  const response = await client.payments.create({
    sourceId: body.sourceId,
    idempotencyKey: crypto.randomUUID(),
    amountMoney: {
      amount: BigInt(paywall.amount_cents),
      currency: paywall.currency as 'EUR' | 'USD',
    },
    locationId: config.public.squareLocationId,
  })

  if (response.payment?.status !== 'COMPLETED') {
    throw createError({
      statusCode: 402,
      statusMessage: `Paiement non abouti : ${response.payment?.status}`,
    })
  }

  // Le paiement ouvre l'accès à la suite, pour la durée prévue au script.
  // Cookie SIGNÉ : le précédent portait une valeur fixe en clair, que
  // n'importe qui pouvait renvoyer pour débloquer la suite sans payer.
  const pass = grantAccess(event, response.payment?.id ?? 'inconnu', runtime.script.limits.paid.window_days)

  return { success: true, paymentId: response.payment?.id, expiresAt: pass.expires_at }
})
