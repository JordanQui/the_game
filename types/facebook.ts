export interface FacebookPicture {
  data: {
    url: string
    width?: number
    height?: number
    is_silhouette?: boolean
  }
}

export interface FacebookEducation {
  school: { name: string }
  degree?: { name: string }
  year?: { name: string }
  type: 'High School' | 'College' | 'Graduate School' | string
}

export interface FacebookWork {
  employer: { name: string }
  position?: { name: string }
  location?: { name: string }
  start_date?: string
  end_date?: string
  description?: string
}

export interface FacebookRawProfile {
  id: string
  name: string
  picture?: FacebookPicture
  about?: string
  bio?: string
  birthday?: string
  location?: { name: string }
  hometown?: { name: string }
  education?: FacebookEducation[]
  work?: FacebookWork[]
  relationship_status?: string
  significant_other?: { name: string }
  sports?: Array<{ id: string; name: string }>
  favorite_teams?: Array<{ id: string; name: string }>
  inspirational_people?: Array<{ id: string; name: string }>
  languages?: Array<{ id: string; name: string }>
  music?: { data: Array<{ id: string; name: string; category: string }> }
  movies?: { data: Array<{ id: string; name: string; category: string }> }
  books?: { data: Array<{ id: string; name: string; category: string }> }
  television?: { data: Array<{ id: string; name: string; category: string }> }
  games?: { data: Array<{ id: string; name: string; category: string }> }
  likes?: { data: Array<{ id: string; name: string; category: string }> }
}
