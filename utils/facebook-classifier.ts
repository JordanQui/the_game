import type { FacebookRawProfile } from '~/types/facebook'
import type { UserProfile, UserPassion, PassionIntensity } from '~/types/user'

/**
 * Convertit un profil Graph API brut en UserProfile — exactement la forme de
 * game/user.json, que /api/scene/text sait consommer.
 */

function scoreLifeEvent(description: string): number {
  let score = 0
  if (description.length > 100) score += 2
  if (description.length > 200) score += 1
  const majorKeywords = [
    'université', 'diplôme', 'mariage', 'naissance', 'enfant', 'fondé', 'créé', 'déménagé',
    'moved', 'graduated', 'founded', 'married', 'born', 'died', 'started', 'left', 'joined',
  ]
  for (const kw of majorKeywords) {
    if (description.toLowerCase().includes(kw)) score += 2
  }
  return score
}

function computeAge(birthday?: string): number | undefined {
  if (!birthday) return undefined
  // Facebook renvoie MM/DD/YYYY, ou MM/DD si l'année est masquée.
  const parts = birthday.split('/')
  const year = parts.length === 3 ? Number(parts[2]) : Number(birthday.slice(0, 4))
  if (!Number.isFinite(year) || year < 1900) return undefined
  return new Date().getFullYear() - year
}

function extractPassions(profile: FacebookRawProfile): UserPassion[] {
  const themes = new Map<string, string[]>()

  const add = (theme: string, name: string) => {
    const list = themes.get(theme)
    if (list) list.push(name)
    else themes.set(theme, [name])
  }

  for (const item of profile.music?.data ?? []) add('musique', item.name)
  for (const item of profile.movies?.data ?? []) add('cinéma', item.name)
  for (const item of profile.books?.data ?? []) add('littérature', item.name)
  for (const item of profile.television?.data ?? []) add('séries & télévision', item.name)
  for (const item of profile.games?.data ?? []) add('jeux', item.name)
  for (const item of profile.sports ?? []) add('sport', item.name)
  for (const item of profile.favorite_teams ?? []) add('sport', item.name)
  for (const item of profile.likes?.data ?? []) add(item.category?.toLowerCase() || 'divers', item.name)

  const passions: UserPassion[] = []
  for (const [theme, names] of themes) {
    if (!names.length) continue
    const intensity: PassionIntensity = names.length >= 5 ? 'high' : names.length >= 2 ? 'medium' : 'low'
    passions.push({ theme, intensity, evidence: names.slice(0, 5) })
  }

  const rank: Record<PassionIntensity, number> = { high: 0, medium: 1, low: 2 }
  return passions.sort((a, b) => rank[a.intensity] - rank[b.intensity])
}

function extractTurningPoints(profile: FacebookRawProfile): string[] {
  const events: string[] = []

  for (const edu of profile.education ?? []) {
    const year = edu.year?.name ? ` (${edu.year.name})` : ''
    const degree = edu.degree?.name ? `, ${edu.degree.name}` : ''
    events.push(`Études à ${edu.school.name}${degree}${year}`)
  }

  for (const job of profile.work ?? []) {
    const pos = job.position?.name ? ` — ${job.position.name}` : ''
    const loc = job.location?.name ? ` à ${job.location.name}` : ''
    const dates = job.start_date
      ? ` (${job.start_date}${job.end_date ? ` → ${job.end_date}` : ' → aujourd\'hui'})`
      : ''
    events.push(`Travail chez ${job.employer.name}${pos}${loc}${dates}`)
  }

  if (profile.hometown?.name && profile.hometown.name !== profile.location?.name) {
    events.push(`A quitté ${profile.hometown.name} pour ${profile.location?.name ?? 'ailleurs'}`)
  }

  if (profile.relationship_status) {
    const notable = ['Married', 'Engaged', 'In a relationship', 'Marié(e)', 'Fiancé(e)']
    if (notable.includes(profile.relationship_status)) {
      const partner = profile.significant_other?.name ? ` avec ${profile.significant_other.name}` : ''
      events.push(`Statut relationnel : ${profile.relationship_status}${partner}`)
    }
  }

  if (profile.about && profile.about.length > 50) events.push(`À propos : ${profile.about}`)
  if (profile.bio && profile.bio.length > 50 && profile.bio !== profile.about) {
    events.push(`Bio : ${profile.bio}`)
  }

  return events
    .map(event => ({ event, score: scoreLifeEvent(event) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(s => s.event)
}

function extractMiscFacts(profile: FacebookRawProfile): string[] {
  const facts: string[] = []
  if (profile.inspirational_people?.length) {
    facts.push(`Inspiré(e) par : ${profile.inspirational_people.slice(0, 3).map(p => p.name).join(', ')}`)
  }
  if (profile.birthday) facts.push(`Né(e) le : ${profile.birthday}`)
  return facts
}

export function classifyFacebookData(profile: FacebookRawProfile): UserProfile {
  const turningPoints = extractTurningPoints(profile)

  return {
    identity: {
      id: profile.id,
      name: profile.name,
      first_name: profile.name?.split(' ')[0],
      picture_url: profile.picture?.data?.url,
      birthday: profile.birthday,
      age: computeAge(profile.birthday),
      languages: profile.languages?.map(l => l.name),
    },
    origin: {
      hometown: profile.hometown?.name ? { name: profile.hometown.name } : undefined,
      current_location: profile.location?.name ? { name: profile.location.name } : undefined,
    },
    trajectory: {
      education: (profile.education ?? []).map(e => ({
        school: e.school.name,
        degree: e.degree?.name,
        year: e.year?.name,
        type: e.type,
      })),
      work: (profile.work ?? []).map(w => ({
        employer: w.employer.name,
        position: w.position?.name,
        location: w.location?.name,
        start_date: w.start_date,
        end_date: w.end_date ?? null,
      })),
      turning_points: turningPoints.length
        ? turningPoints
        : ['Un passé dont les détails restent à découvrir'],
    },
    passions: extractPassions(profile),
    misc_facts: extractMiscFacts(profile),
  }
}
