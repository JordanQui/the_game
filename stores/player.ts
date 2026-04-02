import { defineStore } from 'pinia'
import type { ClassifiedFacebookData } from '~/types/facebook'
import type { GeneratedNPC, GeneratedQuest, GeneratedWorld, WorldBuildProgress } from '~/types/game'

export const usePlayerStore = defineStore('player', {
  state: () => ({
    facebookData: null as ClassifiedFacebookData | null,
    world: null as GeneratedWorld | null,
    npcs: [] as GeneratedNPC[],
    quest: null as GeneratedQuest | null,
    buildProgress: {
      worldName: false,
      worldDescription: false,
      npcs: false,
      quest: false,
    } as WorldBuildProgress,
  }),

  getters: {
    playerName: (state) => state.facebookData?.playerName ?? 'Aventurier',
    isWorldReady: (state) =>
      state.buildProgress.worldName &&
      state.buildProgress.worldDescription &&
      state.buildProgress.npcs &&
      state.buildProgress.quest,
    npcNames: (state) => state.npcs.map(n => `${n.name} (${n.archetype})`).join(', '),
  },

  actions: {
    setFacebookData(data: ClassifiedFacebookData) {
      this.facebookData = data
    },
    setWorld(world: GeneratedWorld) {
      this.world = world
      this.buildProgress.worldName = true
      this.buildProgress.worldDescription = true
    },
    setNpcs(npcs: GeneratedNPC[]) {
      this.npcs = npcs
      this.buildProgress.npcs = true
    },
    setQuest(quest: GeneratedQuest) {
      this.quest = quest
      this.buildProgress.quest = true
    },
    updateNpcPortrait(npcId: string, portraitUrl: string) {
      const npc = this.npcs.find(n => n.id === npcId)
      if (npc) npc.portraitUrl = portraitUrl
    },
  },
})
