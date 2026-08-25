import pkg from 'square'
const { Client, Environment } = pkg
import { loadColonne } from '~/utils/colonne-loader'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody<{ colonneId: string }>(event)

  const colonneId = body?.colonneId ?? 'auberge_v1'
  const colonne = await loadColonne(colonneId)

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
          name: colonne.paywall.cta,
          quantity: '1',
          basePriceMoney: {
            amount: BigInt(colonne.paywall.amount_cents),
            currency: colonne.paywall.currency as 'EUR' | 'USD',
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
