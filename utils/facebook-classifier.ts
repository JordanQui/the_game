import type { FacebookRawProfile, ClassifiedFacebookData, InterestCluster, ImportantLifeEvents } from '~/types/facebook'

function scoreLifeEvent(description: string): number {
  let score = 0
  if (description.length > 100) score += 2
  if (description.length > 200) score += 1
  const majorKeywords = ['université', 'diplôme', 'marriage', 'mariage', 'naissance', 'enfant', 'fondé', 'créé', 'déménagé', 'moved', 'graduated', 'founded', 'married', 'born', 'died', 'started', 'left', 'joined']
  for (const kw of majorKeywords) {
    if (description.toLowerCase().includes(kw)) score += 2
  }
  return score
}

function extractInterestClusters(profile: FacebookRawProfile): InterestCluster[] {
  const clusters: InterestCluster[] = []
  const themeMap: Record<string, string[]> = {}

  const addToTheme = (theme: string, name: string) => {
    if (!themeMap[theme]) themeMap[theme] = []
    themeMap[theme].push(name)
  }

  if (profile.music?.data) {
    for (const item of profile.music.data) addToTheme('musique', item.name)
  }
  if (profile.movies?.data) {
    for (const item of profile.movies.data) addToTheme('cinéma', item.name)
  }
  if (profile.books?.data) {
    for (const item of profile.books.data) addToTheme('littérature', item.name)
  }
  if (profile.television?.data) {
    for (const item of profile.television.data) addToTheme('séries & télévision', item.name)
  }
  if (profile.games?.data) {
    for (const item of profile.games.data) addToTheme('jeux', item.name)
  }
  if (profile.sports) {
    for (const item of profile.sports) addToTheme('sport', item.name)
  }
  if (profile.favorite_teams) {
    for (const item of profile.favorite_teams) addToTheme('sport', item.name)
  }
  if (profile.likes?.data) {
    for (const item of profile.likes.data) {
      const cat = item.category?.toLowerCase() || 'divers'
      addToTheme(cat, item.name)
    }
  }

  for (const [theme, names] of Object.entries(themeMap)) {
    if (names.length === 0) continue
    const intensity: InterestCluster['intensity'] =
      names.length >= 5 ? 'high' : names.length >= 2 ? 'medium' : 'low'
    clusters.push({
      theme,
      description: `Passionné(e) de ${theme} : ${names.slice(0, 5).join(', ')}${names.length > 5 ? '...' : ''}`,
      intensity,
    })
  }

  return clusters.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 }
    return order[a.intensity] - order[b.intensity]
  })
}

function extractImportantLifeEvents(profile: FacebookRawProfile): ImportantLifeEvents {
  const rawEvents: string[] = []

  if (profile.education) {
    for (const edu of profile.education) {
      const year = edu.year?.name ? ` (${edu.year.name})` : ''
      const degree = edu.degree?.name ? `, ${edu.degree.name}` : ''
      rawEvents.push(`Études à ${edu.school.name}${degree}${year}`)
    }
  }

  if (profile.work) {
    for (const job of profile.work) {
      const pos = job.position?.name ? ` — ${job.position.name}` : ''
      const loc = job.location?.name ? ` à ${job.location.name}` : ''
      const dates = job.start_date ? ` (${job.start_date}${job.end_date ? ` → ${job.end_date}` : ' → aujourd\'hui'})` : ''
      rawEvents.push(`Travail chez ${job.employer.name}${pos}${loc}${dates}`)
    }
  }

  if (profile.location?.name) {
    rawEvents.push(`Vit actuellement à ${profile.location.name}`)
  }
  if (profile.hometown?.name && profile.hometown.name !== profile.location?.name) {
    rawEvents.push(`Originaire de ${profile.hometown.name}`)
  }

  if (profile.relationship_status) {
    const status = profile.relationship_status
    if (['Married', 'Engaged', 'In a relationship', 'Marié(e)', 'Fiancé(e)'].includes(status)) {
      const partner = profile.significant_other?.name ? ` avec ${profile.significant_other.name}` : ''
      rawEvents.push(`Statut relationnel : ${status}${partner}`)
    }
  }

  if (profile.about && profile.about.length > 50) {
    rawEvents.push(`À propos : ${profile.about}`)
  }
  if (profile.bio && profile.bio.length > 50 && profile.bio !== profile.about) {
    rawEvents.push(`Bio : ${profile.bio}`)
  }

  const scored = rawEvents.map(event => ({ event, score: scoreLifeEvent(event) }))
  scored.sort((a, b) => b.score - a.score)

  const turning_points = scored.slice(0, 3).map(s => s.event)
  const summary = rawEvents.length > 0
    ? rawEvents.slice(0, 5).join('. ')
    : 'Un aventurier au passé mystérieux'

  return { summary, turning_points, raw_events: rawEvents }
}

function extractMiscFacts(profile: FacebookRawProfile): string[] {
  const facts: string[] = []

  if (profile.languages) {
    const langs = profile.languages.map(l => l.name).join(', ')
    facts.push(`Parle : ${langs}`)
  }
  if (profile.inspirational_people) {
    const people = profile.inspirational_people.slice(0, 3).map(p => p.name).join(', ')
    facts.push(`Inspiré(e) par : ${people}`)
  }
  if (profile.birthday) {
    facts.push(`Né(e) le : ${profile.birthday}`)
  }

  return facts
}

export function classifyFacebookData(profile: FacebookRawProfile): ClassifiedFacebookData {
  return {
    playerName: profile.name,
    playerPictureUrl: profile.picture?.data?.url || '',
    importantLifeEvents: extractImportantLifeEvents(profile),
    interestClusters: extractInterestClusters(profile),
    miscFacts: extractMiscFacts(profile),
  }
}

export function buildInterestsString(data: ClassifiedFacebookData): string {
  if (data.interestClusters.length === 0) {
    return 'aventure, mystère, voyages'
  }
  return data.interestClusters
    .slice(0, 4)
    .map(c => c.description)
    .join('. ')
}

export function buildLifeEventsString(data: ClassifiedFacebookData): string {
  if (data.importantLifeEvents.raw_events.length === 0) {
    return 'Un passé mystérieux dont les détails restent à découvrir'
  }
  return data.importantLifeEvents.summary
}
