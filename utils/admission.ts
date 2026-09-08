/**
 * Le formulaire d'admission, et ce qu'il produit.
 *
 * Meta est sorti du jeu : le profil n'est plus déduit d'un compte, il est
 * DÉCLARÉ par le joueur. Ce fichier tient les deux bouts — la forme des
 * questions posées à l'écran, et la conversion vers `UserProfile`, la seule
 * forme que le reste du jeu connaisse (voir `describeUser` dans
 * utils/script-runtime.ts, qui en est le contrat réel).
 *
 * On ne demande QUE ce qui sert. L'inventaire, champ par champ :
 *   identity.first_name ........ nom d'usage en jeu, et NAMANK (accueil du monde)
 *   identity.last_name ......... avec le prénom : le namank du nom complet,
 *                                soit l'HÉRITAGE — ce que le nom traîne
 *   identity.birthday .......... signe du zodiaque, moolank, bhagyank, âge
 *   identity.agreement ......... accord des participes dans toute la narration
 *   origin.hometown ............ ville d'origine
 *   origin.current_location .... ville actuelle
 *   trajectory.turning_points .. tournants de vie
 *   passions ................... passions, par intensité
 *   imprints ................... quatre traces à remettre en décor
 *   misc_facts ................. divers
 * `identity.id` et `picture_url` ne servaient qu'à l'ancienne extraction Meta :
 * le formulaire ne les demande pas. Trois questions ont été retirées faute d'usage :
 * les langues parlées (le jeu se joue en une langue, choisie ailleurs), la
 * formation et le parcours professionnel — un intitulé de poste ne survit pas à
 * la transposition, le prompt interdisant toute reprise littérale. Les sources
 * de décor et la couleur secondaire qui en dépendaient tirent désormais sur
 * `imprints`.
 */

import type { UserProfile, UserPassion, UserAgreement } from '~/types/user'

export interface AdmissionForm {
  /** Le prénom seul : c'est lui qu'on emploie en jeu, et lui qui porte le namank. */
  firstName: string
  /** Le nom de famille. Avec le prénom, il donne l'héritage. */
  lastName: string
  /** `YYYY-MM-DD`, tel que le rend un `<input type="date">`. */
  birthday: string
  agreement: UserAgreement
  hometown: string
  currentCity: string
  /** Thèmes retenus, DANS L'ORDRE DE CHOIX : il donne l'intensité. */
  passions: string[]
  /** Deux lignes libres, facultatives. */
  turningPoints: string[]
  /** Quatre traces personnelles, que la scène remettra en décor. */
  keepsake: string
  refuge: string
  ally: string
  aversion: string
}

export function emptyAdmissionForm(): AdmissionForm {
  return {
    firstName: '',
    lastName: '',
    birthday: '',
    agreement: 'masculin',
    hometown: '',
    currentCity: '',
    passions: [],
    turningPoints: ['', ''],
    keepsake: '',
    refuge: '',
    ally: '',
    aversion: '',
  }
}

/**
 * L'accord, proposé en trois touches.
 *
 * Ce n'est pas une question d'identité : c'est une question de grammaire. Le
 * jeu narre à la deuxième personne et doit savoir accorder « tu es entré(e) ».
 */
export const AGREEMENT_CHOICES: Array<{ value: UserAgreement; label: string; example: string }> = [
  { value: 'masculin', label: 'Masculin', example: 'tu es entré' },
  { value: 'feminin', label: 'Féminin', example: 'tu es entrée' },
  { value: 'neutre', label: 'Neutre', example: 'tu franchis le seuil' },
]

/**
 * Les passions proposées.
 *
 * Chacune porte ses `evidence` : trois accroches concrètes que le bloc joueur
 * affiche entre parenthèses. Sans elles, une
 * passion se réduirait à deux mots et le modèle n'aurait rien à quoi accrocher
 * un décor.
 */
export const PASSION_CHOICES: Array<{ theme: string; evidence: string[] }> = [
  { theme: 'musique et concerts', evidence: ['disques', 'salles de concert', 'basses trop fortes'] },
  { theme: 'cinéma et séries', evidence: ['salles obscures', 'film noir', 'séances de minuit'] },
  { theme: 'littérature et bandes dessinées', evidence: ['romans', 'librairies', 'piles de côté'] },
  { theme: 'jeux vidéo', evidence: ['arcades', 'jeux d\'aventure', 'manettes usées'] },
  { theme: 'jeux de rôle et jeux de société', evidence: ['Donjons & Dragons', 'dés', 'parties qui durent'] },
  { theme: 'cuisine et fermentation', evidence: ['pain au levain', 'marchés', 'bocaux'] },
  { theme: 'voyage et grandes villes', evidence: ['trains de nuit', 'aéroports', 'plans de métro'] },
  { theme: 'sport et endurance', evidence: ['course', 'entraînement', 'lignes d\'arrivée'] },
  { theme: 'montagne et grands espaces', evidence: ['randonnée', 'bivouacs', 'cols'] },
  { theme: 'mer et navigation', evidence: ['voile', 'ports', 'marées'] },
  { theme: 'dessin, photo et images', evidence: ['carnets', 'argentique', 'expositions'] },
  { theme: 'machines, code et bricolage', evidence: ['ateliers', 'fers à souder', 'vieux matériel'] },
  { theme: 'histoire et vieux documents', evidence: ['archives', 'cartes anciennes', 'musées'] },
  { theme: 'animaux et jardins', evidence: ['chats', 'plantes', 'longues promenades'] },
]

/** Combien de passions au maximum. Au-delà, plus rien ne ressort. */
export const MAX_PASSIONS = 5

/**
 * Intensité d'une passion, d'après son rang de sélection.
 *
 * Le joueur ne note pas ses passions une par une — ce serait quatorze
 * questions de plus. C'est l'ORDRE dans lequel il les touche qui les classe :
 * les deux premières comptent le plus.
 */
function intensityAt(rank: number): UserPassion['intensity'] {
  if (rank < 2) return 'high'
  if (rank < 4) return 'medium'
  return 'low'
}

/** Âge révolu. Retourne undefined si la date est absente ou illisible. */
export function ageFrom(birthday: string): number | undefined {
  const [y, m, d] = birthday.split('-').map(Number)
  if (!y || !m || !d || y < 1900) return undefined
  const now = new Date()
  let age = now.getFullYear() - y
  const month = now.getMonth() + 1
  if (month < m || (month === m && now.getDate() < d)) age--
  return age >= 0 && age < 130 ? age : undefined
}

/** « 1990-03-07 » → « 7 mars ». Pour la ligne « Né(e) le » des divers. */
function frenchDay(birthday: string): string | null {
  const [, m, d] = birthday.split('-').map(Number)
  const months = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  ]
  if (!m || !d || !months[m - 1]) return null
  return `${d} ${months[m - 1]}`
}

const clean = (s: string) => s.trim().replace(/\s+/g, ' ')

/**
 * Ce qui a fait bifurquer le joueur.
 *
 * Les deux lignes libres passent en premier — c'est lui qui parle. Le
 * déménagement est DÉDUIT : sans lui, un dossier rempli à la va-vite ne
 * donnerait aucune trajectoire au modèle.
 */
function turningPoints(form: AdmissionForm): string[] {
  const points = form.turningPoints.map(clean).filter(Boolean)

  const hometown = clean(form.hometown)
  const city = clean(form.currentCity)
  if (hometown && city && hometown.toLowerCase() !== city.toLowerCase()) {
    points.push(`A quitté ${hometown} pour ${city}`)
  }

  return points
}

function miscFacts(form: AdmissionForm): string[] {
  const facts: string[] = []
  const day = form.birthday ? frenchDay(form.birthday) : null
  // Accordé, tant qu'à faire : c'est la première phrase que le modèle lit sur
  // lui, ce serait bête d'y écrire « Né(e) ».
  const born = { masculin: 'Né', feminin: 'Née', neutre: 'Venu·e au monde' }[form.agreement]
  if (day) facts.push(`${born} un ${day}`)
  return facts
}

/** Les traces non vides, et rien d'autre : un champ vide vaut moins que rien. */
function imprints(form: AdmissionForm): UserProfile['imprints'] {
  const traces = {
    keepsake: clean(form.keepsake) || undefined,
    refuge: clean(form.refuge) || undefined,
    ally: clean(form.ally) || undefined,
    aversion: clean(form.aversion) || undefined,
  }
  return Object.values(traces).some(Boolean) ? traces : undefined
}

/**
 * Le dossier d'admission, converti dans la forme que le jeu consomme.
 *
 * Tout champ laissé vide disparaît du profil plutôt que d'y entrer vide : le
 * bloc joueur saute les lignes absentes, et une ligne « Formation :  » vaut
 * moins que pas de ligne du tout.
 */
export function profileFromAdmission(form: AdmissionForm): UserProfile {
  const firstName = clean(form.firstName)
  const lastName = clean(form.lastName)
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  const hometown = clean(form.hometown)
  const city = clean(form.currentCity)

  const passions: UserPassion[] = form.passions.slice(0, MAX_PASSIONS).map((theme, i) => ({
    theme,
    intensity: intensityAt(i),
    evidence: PASSION_CHOICES.find(p => p.theme === theme)?.evidence ?? [],
  }))

  return {
    identity: {
      name: fullName || 'Sans-nom',
      first_name: firstName || undefined,
      last_name: lastName || undefined,
      birthday: form.birthday || undefined,
      age: form.birthday ? ageFrom(form.birthday) : undefined,
      agreement: form.agreement,
    },
    origin: {
      hometown: hometown ? { name: hometown } : undefined,
      current_location: city ? { name: city } : undefined,
    },
    trajectory: {
      turning_points: turningPoints(form),
    },
    passions,
    imprints: imprints(form),
    misc_facts: miscFacts(form),
  }
}
