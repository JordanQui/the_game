import { defineStore } from 'pinia'
import type { GameScreen, PlayingSubState, NarrativeEntry, NarrativeEntryType } from '~/types/game'

export const useGameStore = defineStore('game', {
  state: () => ({
    currentScreen: 'init' as GameScreen,
    playingSubState: 'awaiting_input' as PlayingSubState,
    narrativeHistory: [] as NarrativeEntry[],
    turnCount: 0,
    currentSceneImageUrl: null as string | null,
    sceneImageLoading: false,
    sceneImageError: null as string | null,
    activeNpcId: null as string | null,
    paywallTriggered: false,
    /** Objet-clé : sans lui, le sas reste fermé. */
    hasKeyItem: false,
    /** Échanges déjà eus avec le détenteur de l'objet. */
    keyItemExchanges: 0,
    /** PNJ à qui le joueur a déjà parlé — ce qu'il a débloqué. */
    talkedToNpcIds: [] as string[],
    /** Verdict de fin quand le joueur n'est jamais sorti. */
    lockVerdict: null as string | null,
    lockRecap: [] as string[],
    conversationHistory: [] as Array<{ role: 'user' | 'assistant'; content: string }>,
    /** Dernière commande jouée, pour pouvoir relancer un tour qui a échoué. */
    lastCommand: null as string | null,
    lastMode: null as import('~/types/scene').TurnMode | null,
    turnError: null as string | null,
  }),

  getters: {
    lastNarrativeEntry: (state) =>
      state.narrativeHistory[state.narrativeHistory.length - 1] ?? null,
    isInputDisabled: (state) =>
      state.playingSubState === 'narrative_streaming' ||
      state.playingSubState === 'npc_dialogue',
  },

  actions: {
    setScreen(screen: GameScreen) {
      this.currentScreen = screen
    },

    setPlayingSubState(subState: PlayingSubState) {
      this.playingSubState = subState
    },

    setLastCommand(input: string) {
      this.lastCommand = input
    },

    setLastMode(mode: import('~/types/scene').TurnMode | null) {
      this.lastMode = mode
    },

    setTurnError(message: string) {
      this.turnError = message
      // Un tour en échec ne doit jamais laisser la saisie verrouillée.
      this.playingSubState = 'awaiting_input'
    },

    clearTurnError() {
      this.turnError = null
    },

    /** Retire l'entrée en cours de rédaction quand le tour a échoué. */
    removeLastNarrativeEntry() {
      this.narrativeHistory.pop()
    },

    addNarrativeEntry(type: NarrativeEntryType, text: string, npcName?: string) {
      this.narrativeHistory.push({
        id: `entry_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        type,
        text,
        npcName,
        timestamp: Date.now(),
      })
    },

    updateLastNarrativeEntry(textChunk: string) {
      const last = this.narrativeHistory[this.narrativeHistory.length - 1]
      if (last) {
        last.text += textChunk
      }
    },

    setSceneImage(url: string) {
      this.currentSceneImageUrl = url
      this.sceneImageError = null
    },

    startSceneImage() {
      this.sceneImageLoading = true
      this.sceneImageError = null
    },

    failSceneImage(message: string) {
      this.sceneImageLoading = false
      this.sceneImageError = message
    },

    finishSceneImage() {
      this.sceneImageLoading = false
    },

    setActiveNpc(npcId: string | null) {
      this.activeNpcId = npcId
    },

    incrementTurn(playerInput: string, aiResponse: string) {
      this.turnCount++
      this.conversationHistory.push({ role: 'user', content: playerInput })
      this.conversationHistory.push({ role: 'assistant', content: aiResponse })
      if (this.conversationHistory.length > 12) {
        this.conversationHistory = this.conversationHistory.slice(-12)
      }
    },

    /** Un échange de plus avec le détenteur de l'objet. */
    recordKeyItemExchange() {
      this.keyItemExchanges++
    },

    receiveKeyItem() {
      this.hasKeyItem = true
    },

    recordNpcTalk(npcId: string) {
      if (!this.talkedToNpcIds.includes(npcId)) this.talkedToNpcIds.push(npcId)
    },

    /** Le joueur a trop traîné : la partie se ferme sur un constat. */
    lockGame(verdict: string, recap: string[]) {
      this.lockVerdict = verdict
      this.lockRecap = recap
      this.playingSubState = 'awaiting_input'
      this.currentScreen = 'locked'
    },

    triggerPaywall() {
      this.paywallTriggered = true
      this.currentScreen = 'paywall'
    },

    resetGame() {
      this.currentScreen = 'login'
      this.playingSubState = 'awaiting_input'
      this.narrativeHistory = []
      this.turnCount = 0
      this.currentSceneImageUrl = null
      this.sceneImageLoading = false
      this.sceneImageError = null
      this.activeNpcId = null
      this.paywallTriggered = false
      this.hasKeyItem = false
      this.keyItemExchanges = 0
      this.talkedToNpcIds = []
      this.lockVerdict = null
      this.lockRecap = []
      this.conversationHistory = []
      this.lastCommand = null
      this.lastMode = null
      this.turnError = null
    },
  },
})
