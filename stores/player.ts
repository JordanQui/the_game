import { defineStore } from 'pinia'
import type { UserProfile } from '~/types/user'
import type { SceneTextResponse, SceneNPC, SceneQuest, ScenePlace, ScenePalette } from '~/types/scene'
import { entryFrom, type JournalEntry } from '~/utils/journal'
import type { SceneBuildProgress } from '~/types/game'

export const usePlayerStore = defineStore('player', {
  state: () => ({
    profile: null as UserProfile | null,
    scene: null as SceneTextResponse | null,
    /**
     * Les scènes déjà traversées, résumées. C'est la mémoire de la partie :
     * elle part avec chaque demande de scène et permet à l'histoire d'avancer
     * pas à pas, sans avoir été écrite d'avance.
     */
    journal: [] as JournalEntry[],
    buildProgress: { text: false, image: false } as SceneBuildProgress,
  }),

  getters: {
    playerName: (state): string => state.profile?.identity.name ?? 'Aventurier',
    place: (state): ScenePlace | null => state.scene?.place ?? null,
    palette: (state): ScenePalette | null => state.scene?.palette ?? null,
    npcs: (state): SceneNPC[] => state.scene?.npcs ?? [],
    quest: (state): SceneQuest | null => state.scene?.quest ?? null,
    npcNames: (state): string =>
      (state.scene?.npcs ?? []).map(n => `${n.name} (${n.archetype})`).join(', '),
    isSceneReady: (state): boolean => state.scene !== null,
  },

  actions: {
    setProfile(profile: UserProfile) {
      this.profile = profile
    },
    /** Referme la scène en cours et la consigne, avant d'en ouvrir une autre. */
    closeScene() {
      if (!this.scene) return
      // Une scène rejouée ne s'inscrit pas deux fois.
      const already = this.journal.some(e => e.scene_title === this.scene!.scene_title)
      if (!already) this.journal.push(entryFrom(this.scene))
    },

    setScene(scene: SceneTextResponse) {
      this.scene = scene
      this.buildProgress.text = true
    },
    markImageReady() {
      this.buildProgress.image = true
    },
    updateNpcPortrait(npcId: string, portraitUrl: string) {
      const npc = this.scene?.npcs.find(n => n.id === npcId)
      if (npc) npc.portraitUrl = portraitUrl
    },
    reset() {
      this.scene = null
      this.buildProgress = { text: false, image: false }
    },
  },
})
