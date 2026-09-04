import { SquareClient, SquareEnvironment } from 'square'
import { ScriptRuntime } from '~/utils/script-runtime'
import { requireSecret } from '~/server/utils/runtime-secrets'

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

  // Cookie de session ouvrant l'accès à la suite de l'aventure.
  setCookie(event, 'game_access', 'scene_2_unlocked', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })

  return { success: true, paymentId: response.payment?.id }
})
