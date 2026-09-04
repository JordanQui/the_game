// Forme normalisée des données Meta. Produite par utils/facebook-classifier.ts
// en production, lue depuis game/user.json en développement.

export type PassionIntensity = 'high' | 'medium' | 'low'

export interface UserPassion {
  theme: string
  intensity: PassionIntensity
  evidence: string[]
}

export interface UserPlace {
  name: string
  /** Enrichissement local — Meta ne fournit pas ça. */
  traits?: string[]
}

export interface UserEducation {
  school: string
  degree?: string
  year?: string
  type?: string
}

export interface UserWork {
  employer: string
  position?: string
  location?: string
  start_date?: string
  end_date?: string | null
}

export interface UserProfile {
  identity: {
    id?: string
    name: string
    first_name?: string
    picture_url?: string
    birthday?: string
    age?: number
    languages?: string[]
  }
  origin: {
    hometown?: UserPlace
    current_location?: UserPlace
  }
  trajectory: {
    education: UserEducation[]
    work: UserWork[]
    turning_points: string[]
  }
  passions: UserPassion[]
  misc_facts?: string[]
}
