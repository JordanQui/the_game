import type { FacebookRawProfile } from '~/types/facebook'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody<{ accessToken: string }>(event)

  if (!body?.accessToken) {
    throw createError({ statusCode: 400, statusMessage: 'Missing accessToken' })
  }

  // Verify token validity via Facebook debug_token endpoint
  const debugUrl = `https://graph.facebook.com/debug_token?input_token=${body.accessToken}&access_token=${config.public.facebookAppId}|${config.facebookAppSecret}`
  const debugRes = await $fetch<{ data: { is_valid: boolean; error?: { message: string } } }>(debugUrl)

  if (!debugRes.data.is_valid) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid Facebook token' })
  }

  // Fetch extended profile from Graph API
  const fields = [
    'id', 'name', 'picture.type(large)',
    'about', 'bio', 'birthday',
    'location', 'hometown',
    'education', 'work',
    'relationship_status', 'significant_other',
    'sports', 'favorite_teams',
    'inspirational_people', 'languages',
    'music.limit(20)', 'movies.limit(20)',
    'books.limit(20)', 'television.limit(10)',
    'games.limit(10)', 'likes.limit(30)',
  ].join(',')

  const profileUrl = `https://graph.facebook.com/me?fields=${fields}&access_token=${body.accessToken}`
  const profile = await $fetch<FacebookRawProfile>(profileUrl).catch((err) => {
    throw createError({ statusCode: 502, statusMessage: `Facebook Graph API error: ${err.message}` })
  })

  return { profile }
})
