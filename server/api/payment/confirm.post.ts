import pkg from 'square'
const { Client, Environment } = pkg
import { ScriptRuntime } from '~/utils/script-runtime'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody<{ sourceId: string }>(event)

  if (!body?.sourceId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing sourceId' })
  }

  const runtime = await ScriptRuntime.load()
  const paywall = runtime.paywall

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
      amount: BigInt(paywall.amount_cents),
      currency: paywall.currency as 'EUR' | 'USD',
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
