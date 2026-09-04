import { SquareClient, SquareEnvironment } from 'square'
import { ScriptRuntime } from '~/utils/script-runtime'

/**
 * Square v44 : `SquareClient` / `SquareEnvironment`, et les ressources sont
 * imbriquées (`checkout.paymentLinks.create`). Les anciens `Client` /
 * `Environment` / `checkoutApi` de la v3x n'existent plus.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  await readBody(event).catch(() => null)

  const runtime = await ScriptRuntime.load()
  const paywall = runtime.paywall

  const client = new SquareClient({
    token: config.squareAccessToken,
    environment: config.public.squareEnvironment === 'production'
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox,
  })

  const response = await client.checkout.paymentLinks.create({
    idempotencyKey: crypto.randomUUID(),
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

  if (!response.paymentLink) {
    throw createError({ statusCode: 502, statusMessage: 'Square n\'a pas créé de lien de paiement' })
  }

  return {
    paymentLinkId: response.paymentLink.id,
    url: response.paymentLink.url,
    applicationId: config.public.squareApplicationId,
    locationId: config.public.squareLocationId,
  }
})
