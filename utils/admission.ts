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
 *   anthem ..................... un morceau, tenu en registre — jamais ses paroles
 *   imprints ................... quatre traces à remettre en décor
 *   nights ..................... les nuits sans sommeil, et le rêve qui revient
 *   misc_facts ................. divers
 * `identity.id` et `picture_url` ne servaient qu'à l'ancienne extraction Meta :
 * le formulaire ne les demande pas. Trois questions ont été retirées faute d'usage :
 * les langues parlées (le jeu se joue en une langue, choisie ailleurs), la
 * formation et le parcours professionnel — un intitulé de poste ne survit pas à
 * la transposition, le prompt interdisant toute reprise littérale. Les sources
 * de décor et la couleur secondaire qui en dépendaient tirent désormais sur
 * `imprints`.
 *
 * TOUT SE SAISIT AU CLAVIER, sauf l'accord. Les grilles de touches — passions,
 * nuits, rêves — ont été retirées le 2026-09-09 : une touche est un mot que le
 * joueur n'a pas écrit, et le générateur ne peut rien transposer d'un
 * vocabulaire qu'il a lui-même fourni. Deux joueurs qui cochent « musique et
 * concerts » ont la même nuit ; deux joueurs qui l'écrivent, jamais. L'accord
 * grammatical reste en touches parce qu'il n'est pas une réponse mais un
 * réglage : trois valeurs, et le code les consomme telles quelles.
 */

import type { UserProfile, UserPassion, UserAgreement, UserNights } from '~/types/user'
import type { LangCode } from '~/types/i18n'
import { DEFAULT_LANG } from '~/types/i18n'
import { translate } from '~/utils/languages'

export interface AdmissionForm {
  /**
   * La langue de la nuit.
   *
   * Premier champ du dossier, et le seul qui agisse AVANT d'être déposé : le
   * changer retourne le formulaire lui-même. C'est voulu — on ne fait pas
   * remplir vingt lignes dans une langue pour jouer dans une autre, et le
   * joueur doit voir tout de suite ce qu'il vient de choisir.
   *
   * Elle part ensuite dans le profil, où elle décide de la génération.
   */
  language: LangCode
  /** Le prénom seul : c'est lui qu'on emploie en jeu, et lui qui porte le namank. */
  firstName: string
  /** Le nom de famille. Avec le prénom, il donne l'héritage. */
  lastName: string
  /** `YYYY-MM-DD`, tel que le rend un `<input type="date">`. */
  birthday: string
  agreement: UserAgreement
  hometown: string
  currentCity: string
  /**
   * Trois lignes libres, DANS L'ORDRE : la première pèse le plus.
   *
   * Ce fut une grille de quatorze touches. Une touche est un mot que le joueur
   * n'a pas écrit : « musique et concerts » vaut pour un million de personnes,
   * « les vinyles de mon père que je n'ose pas jouer » n'en désigne qu'une, et
   * c'est de celle-là que la nuit a besoin.
   */
  passions: string[]
  /** Un morceau qui compte. Le titre suffit. */
  anthemTitle: string
  /** Qui le joue. Facultatif : le titre seul porte déjà genre et époque. */
  anthemArtist: string
  /** Deux lignes libres, facultatives. */
  turningPoints: string[]
  /** Quatre traces personnelles, que la scène remettra en décor. */
  keepsake: string
  refuge: string
  ally: string
  aversion: string
  /** Ce qu'il fait les nuits où il ne dort pas. Ligne libre. */
  awakeNote: string
  /** Le rêve qui revient, dans ses mots. Ligne libre. */
  dreamNote: string
}

export function emptyAdmissionForm(lang: LangCode = DEFAULT_LANG): AdmissionForm {
  return {
    language: lang,
    firstName: '',
    lastName: '',
    birthday: '',
    agreement: 'masculin',
    hometown: '',
    currentCity: '',
    passions: ['', '', ''],
    anthemTitle: '',
    anthemArtist: '',
    turningPoints: ['', ''],
    keepsake: '',
    refuge: '',
    ally: '',
    aversion: '',
    awakeNote: '',
    dreamNote: '',
  }
}

/**
 * L'accord et les amorces de passions ont quitté ce fichier.
 *
 * Ils vivaient ici en dur, en français : trois libellés d'accord avec leur
 * exemple, trois lignes d'amorce sous les passions. Ce sont des textes
 * AFFICHÉS, et leur formulation change complètement d'une langue à l'autre —
 * l'exemple d'accord surtout, qui porte un participe en français, un pronom en
 * anglais et une forme d'adresse en turc. Ils sont donc dans les packs de
 * langue, sous `admission.agreement_*` et `admission.passion_ph*`, et
 * `AdmissionScreen.vue` les y prend.
 */

export const MAX_PASSIONS = 3

/**
 * Intensité d'une passion, d'après le rang de sa ligne.
 *
 * Le joueur ne note pas ses passions une par une — ce serait trois questions
 * de plus. C'est l'ORDRE des lignes qui les classe : les deux premières
 * comptent le plus.
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

/**
 * « 1990-03-07 » → « 7 mars ». Pour la ligne « Né(e) le » des divers.
 *
 * Reste EN FRANÇAIS quelle que soit la langue jouée, et ce n'est pas un oubli :
 * `misc_facts` ne s'affiche nulle part, il part au modèle, au milieu d'un
 * prompt français. Le traduire n'aurait servi personne et aurait mis un mot
 * étranger là où tout le reste de la consigne est d'une seule langue.
 */
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
 * Le morceau, s'il en a donné un.
 *
 * Sans titre, pas de champ : un artiste seul ne dit rien qu'une passion ne
 * dise déjà mieux.
 */
function anthem(form: AdmissionForm): UserProfile['anthem'] {
  const title = clean(form.anthemTitle)
  if (!title) return undefined
  return { title, artist: clean(form.anthemArtist) || undefined }
}

/**
 * Les nuits déclarées, et rien si l'étape a été traversée sans rien écrire.
 *
 * Deux lignes libres, et plus aucune touche. La question reste posée en
 * CONDITIONNEL — « les nuits où vous ne dormez pas », pas « quel dormeur
 * êtes-vous » : un état n'appelle rien de la part de qui dort bien, un
 * conditionnel parle à tout le monde. Ce que le joueur écrit se passe DEHORS,
 * et le formulaire le lui dit : le jeu est une nuit dans une ville, un quai ou
 * un dernier bar donnent un décor, une heure et une raison d'être là, le
 * plafond d'une chambre ne donne rien à fabriquer.
 *
 * Le rêve demandé est celui qui REVIENT, jamais le dernier cauchemar : un
 * joueur sur deux ne s'en souvient pas, et un rêve récurrent est un motif
 * qu'une scène peut reposer aux dix tableaux sans lasser.
 */
function nights(form: AdmissionForm): UserProfile['nights'] {
  const declared: UserNights = {
    awake_note: clean(form.awakeNote) || undefined,
    dream_note: clean(form.dreamNote) || undefined,
  }
  return Object.values(declared).some(Boolean) ? declared : undefined
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

  // Les lignes vides sautent, et le classement se resserre : qui n'écrit que
  // la troisième ligne a une passion haute, pas une passion basse.
  const passions: UserPassion[] = form.passions
    .map(clean)
    .filter(Boolean)
    .slice(0, MAX_PASSIONS)
    .map((theme, i) => ({
      theme,
      intensity: intensityAt(i),
      // Les `evidence` venaient de la grille de touches : c'est le prix de la
      // ligne libre, et il est mince. Le joueur écrit déjà en concret, et
      // `describeUser` saute la parenthèse quand elle est vide.
      evidence: [],
    }))

  return {
    // La langue voyage AVEC le dossier, pas seulement dans le cookie : une
    // partie reprise depuis un autre appareil garde ainsi la sienne.
    language: form.language,
    identity: {
      name: fullName || translate(form.language, 'admission.unnamed'),
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
    anthem: anthem(form),
    imprints: imprints(form),
    nights: nights(form),
    misc_facts: miscFacts(form),
  }
}
