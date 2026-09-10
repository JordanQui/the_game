import { defineStore } from 'pinia'
import type { UserProfile } from '~/types/user'
import type { LangCode } from '~/types/i18n'
import { DEFAULT_LANG } from '~/types/i18n'
import { agreementFor, translate } from '~/utils/languages'
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
    /**
     * Le nom sous lequel on l'interpelle.
     *
     * Le PRÉNOM, pas l'état civil : les personnages d'un bar ne s'adressent pas
     * à quelqu'un par son nom de famille. Le nom entier reste dans le profil,
     * pour le dossier et pour la génération.
     */
    playerName: (state): string =>
      state.profile?.identity.first_name
      || state.profile?.identity.name
      // Sans dossier, personne n'a de prénom : le mot de repli suit la langue
      // du dossier absent, donc celle du pack par défaut.
      || translate(state.profile?.language, 'game.player_fallback'),
    /** La langue déclarée au dossier. Français tant qu'aucun dossier n'est là. */
    language: (state): LangCode => state.profile?.language ?? DEFAULT_LANG,
    /**
     * L'accord à tenir dans les tours, DANS LA LANGUE JOUÉE.
     *
     * La formulation change avec elle et pas seulement le mot : en turc ou en
     * indonésien il n'y a pas de participe à accorder, et la ligne y porte sur
     * la façon d'interpeller le joueur. Null tant qu'il n'a rien déclaré.
     */
    playerAgreement: (state): string | null =>
      agreementFor(state.profile?.language, state.profile?.identity.agreement),
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
