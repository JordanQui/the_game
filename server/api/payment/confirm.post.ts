import { Client, Environment } from 'squareup'
import { loadColonne } from '~/utils/colonne-loader'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody<{ sourceId: string; colonneId?: string }>(event)

  if (!body?.sourceId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing sourceId' })
  }

  const colonneId = body.colonneId ?? 'auberge_v1'
  const colonne = await loadColonne(colonneId)

  const client = new Client({
    accessToken: config.squareAccessToken,
    environment: config.public.squareEnvironment === 'production'
      ? Environment.Production
      : Environment.Sandbox,
  })

  const idempotencyKey = crypto.randomUUID()

  const { result } = await client.paymentsApi.createPayment({
    sourceId: body.sourceId,
    idempotencyKey,
    amountMoney: {
      amount: BigInt(colonne.paywall.amount_cents),
      currency: colonne.paywall.currency as 'EUR' | 'USD',
    },
    locationId: config.public.squareLocationId,
  })

  if (result.payment?.status !== 'COMPLETED') {
    throw createError({
      statusCode: 402,
      statusMessage: `Payment not completed: ${result.payment?.status}`,
    })
  }

  // Set a session cookie granting access to level 2
  setCookie(event, 'game_access', 'level_2_unlocked', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })

  return { success: true, paymentId: result.payment?.id }
})
