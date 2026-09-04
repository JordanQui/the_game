import pkg from 'square'
const { Client, Environment } = pkg
import { ScriptRuntime } from '~/utils/script-runtime'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  await readBody(event).catch(() => null)

  const runtime = await ScriptRuntime.load()
  const paywall = runtime.paywall

  const client = new Client({
    accessToken: config.squareAccessToken,
    environment: config.public.squareEnvironment === 'production'
      ? Environment.Production
      : Environment.Sandbox,
  })

  const idempotencyKey = crypto.randomUUID()

  const { result } = await client.checkoutApi.createPaymentLink({
    idempotencyKey,
    order: {
      locationId: config.public.squareLocationId,
      lineItems: [
        {
          name: paywall.cta,
          quantity: '1',
          basePriceMoney: {
            amount: BigInt(paywall.amount_cents),
            currency: paywall.currency as 'EUR' | 'USD',
          },
        },
      ],
    },
    checkoutOptions: {
      allowTipping: false,
      askForShippingAddress: false,
    },
  })

  if (!result.paymentLink) {
    throw createError({ statusCode: 502, statusMessage: 'Failed to create Square payment link' })
  }

  return {
    paymentLinkId: result.paymentLink.id,
    url: result.paymentLink.url,
    applicationId: config.public.squareApplicationId,
    locationId: config.public.squareLocationId,
  }
})
