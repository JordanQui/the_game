import { defineStore } from 'pinia'
import type { GameScreen, PlayingSubState, NarrativeEntry, NarrativeEntryType } from '~/types/game'

export const useGameStore = defineStore('game', {
  state: () => ({
    currentScreen: 'init' as GameScreen,
    /**
     * La scène à construire ensuite.
     *
     * `null` = celle du départ. Renseignée quand on saute directement à une
     * scène, ce que fait la commande `#scene<n>`.
     */
    pendingSceneId: null as string | null,
    playingSubState: 'awaiting_input' as PlayingSubState,
    narrativeHistory: [] as NarrativeEntry[],
    turnCount: 0,
    currentSceneImageUrl: null as string | null,
    sceneImageLoading: false,
    sceneImageError: null as string | null,
    activeNpcId: null as string | null,
    paywallTriggered: false,
    /** Tours réellement facturés au modèle. Les réponses locales n'y entrent pas. */
    modelTurnsUsed: 0,
    /** Dépense cumulée de la scène, en dollars, d'après l'usage réel rapporté. */
    spentUsd: 0,
    /** Objet-clé DE LA SCÈNE EN COURS : sans lui, la sortie reste fermée. */
    hasKeyItem: false,
    /**
     * L'augmentation, acquise une fois pour toutes à l'auberge.
     *
     * Elle ne se confond pas avec l'objet-clé : celui-ci change à chaque scène
     * — une carte d'accès, une fréquence — et se perd en la quittant. La
     * faculté de lire le nom des choses, elle, ne se rend pas. Les avoir
     * confondues faisait qu'on arrivait à la scène 2 sans pouvoir rien lire,
     * y compris les objets ramassés juste avant.
     */
    hasAugmentation: false,
    /** Échanges déjà eus avec le détenteur de l'objet, une fois informé. */
    keyItemExchanges: 0,
    /** Un autre habitué a mis le joueur sur la piste de l'objet. */
    informedAboutItem: false,
    /** L'objet est proposé : il reste au joueur à le récupérer. */
    pendingKeyItem: false,
    /**
     * L'outil en main.
     *
     * `eye` lit les identités des gens, `lens` analyse les objets scellés —
     * cette dernière n'est disponible qu'une fois l'augmentation obtenue.
     * Le curseur, sur desktop, prend la forme de l'outil actif.
     */
    activeTool: 'eye' as 'eye' | 'lens',
    /**
     * Posture de lecture déclarée par le joueur.
     *
     * Assis, on tient le téléphone incliné vers soi ; allongé, on le tient
     * presque à l'horizontale au-dessus du visage. Le tangage neutre n'est pas
     * le même, et sans ce réglage la visée devient pénible dans l'une des deux
     * positions — l'oeil bute en haut ou en bas de l'écran.
     */
    posture: 'assis' as 'assis' | 'allonge',
    /** Le panneau de réglages est ouvert. */
    settingsOpen: false,
    /**
     * Le joueur est en train de taper.
     *
     * Sur mobile, l'oeil suit le téléphone en permanence : pendant qu'on écrit,
     * la main bouge, l'oeil balaie le texte et déclenche des noms — donc du son
     * — sans qu'on l'ait voulu. On le met en veille le temps de la saisie.
     */
    typing: false,
    /** L'oeil gyroscopique est actif. Sur desktop, la souris le remplace. */
    eyeActive: false,
    /** Position de l'oeil, en fraction de l'écran. Au repos, en haut. */
    eyePos: { x: 0.5, y: 0.25 },
    /** Le nom en cours de lecture. Le reste du texte s'efface pendant ce temps. */
    revealing: null as string | null,
    /**
     * Une épreuve d'analyse est demandée.
     *
     * Posée ici plutôt que remontée par événement : la demande vient soit de la
     * souris, soit de l'oeil gyroscopique, et ces deux chemins n'ont aucun
     * composant en commun.
     */
    pendingChallenge: false,
    /** Lecture refusée : tout le texte se brouille un instant. */
    readDenied: false,
    /**
     * Objets dont l'épreuve a été réussie : leur nom est lisible.
     * Vaut pour toute la partie — on ne redemande pas au joueur de refaire un
     * test qu'il a déjà passé.
     */
    decryptedObjectIds: [] as string[],
    /**
     * Ce que le joueur porte, depuis le début de la partie.
     *
     * L'inventaire ne se vide PAS en changeant de scène : un objet ramassé à
     * l'auberge peut être ce qui débloque le troisième étage. C'est l'historique
     * du chat qui en tient lieu à l'écran, mais la liste, elle, est ici.
     */
    inventory: [] as Array<{
      id: string
      label: string
      from?: string
      /**
       * Ce que l'objet fait.
       *
       * `key` : il OUVRE — carte d'accès, code, fréquence. Il sert à franchir
       * une porte ou à déverrouiller un terminal, ici ou plusieurs scènes plus
       * loin. `lore` : il ÉCLAIRE — il ne débloque rien, il approfondit la
       * quête et rapproche le joueur de ce qu'il doit finir par comprendre.
       */
      kind: 'key' | 'lore'
      /** Sa couleur, pour une carte. C'est par elle que le joueur la reconnaît. */
      color?: string
    }>,
    /** PNJ à qui le joueur a déjà parlé — ce qu'il a débloqué. */
    talkedToNpcIds: [] as string[],
    /**
     * Nombre d'échanges par personnage.
     *
     * Un PNJ qui livre ce qu'il sait à la première réplique n'a pas de
     * consistance : il faut lui avoir parlé deux ou trois fois. C'est ce
     * compteur qui décide quand il s'ouvre.
     */
    npcExchanges: {} as Record<string, number>,
    /** La scène a été dénouée : les personnages sont venus au joueur. */
    resolved: false,
    conversationHistory: [] as Array<{ role: 'user' | 'assistant'; content: string }>,
    /** Dernière commande jouée, pour pouvoir relancer un tour qui a échoué. */
    lastCommand: null as string | null,
    lastMode: null as import('~/types/scene').TurnMode | null,
    /**
     * Effets du moment tiré au dernier tour.
     *
     * Retenus pour la relance : sans eux, une remise dont le tour a échoué se
     * rejouait sans jamais tendre l'objet, et la scène restait sans sortie.
     */
    lastEffects: [] as import('~/utils/storylets').StoryletEffect[],
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

    setLastEffects(effects: import('~/utils/storylets').StoryletEffect[]) {
      this.lastEffects = effects
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

    recordModelTurn() {
      this.modelTurnsUsed++
    },

    /** Ajoute le coût d'un appel, calculé sur les tokens réellement consommés. */
    recordSpend(promptTokens: number, completionTokens: number, inPer1m: number, outPer1m: number) {
      this.spentUsd += (promptTokens * inPer1m + completionTokens * outPer1m) / 1_000_000
    },

    /** Un échange de plus avec le détenteur de l'objet. */
    recordKeyItemExchange() {
      this.keyItemExchanges++
    },

    markInformedAboutItem() {
      this.informedAboutItem = true
    },

    /** Le détenteur tend l'objet. Le joueur doit encore le prendre. */
    offerKeyItem() {
      this.pendingKeyItem = true
    },

    setPosture(posture: 'assis' | 'allonge') {
      this.posture = posture
    },

    toggleSettings() {
      this.settingsOpen = !this.settingsOpen
    },

    setTool(tool: 'eye' | 'lens') {
      // La loupe n'existe pas tant que l'augmentation n'a pas été obtenue.
      if (tool === 'lens' && !this.hasAugmentation) return
      this.activeTool = tool
      this.revealing = null
    },

    setTyping(typing: boolean) {
      this.typing = typing
      // Ce qui était en cours de lecture s'arrête net : sans ça, la note du
      // dernier nom survolé continuerait pendant toute la saisie.
      if (typing) this.revealing = null
    },

    setEyeActive(active: boolean) {
      this.eyeActive = active
      if (!active) this.revealing = null
    },

    setEyePos(pos: { x: number; y: number }) {
      this.eyePos = pos
    },

    /**
     * Rien n'est mémorisé ici volontairement : le joueur doit retenir le nom.
     * C'est le coeur de la mécanique, pas un oubli.
     */
    setRevealing(name: string | null) {
      this.revealing = name
    },

    /**
     * Le joueur tente de lire sans l'oeil. Rien ne se révèle : au contraire,
     * tout le texte se brouille — c'est la réponse du système, pas un message.
     */
    denyRead() {
      this.readDenied = true
      setTimeout(() => { this.readDenied = false }, 700)
    },

    /**
     * Charge l'inventaire complet déclaré par le script.
     *
     * Développement seulement. Les noms viennent du script et ne sont jamais
     * générés : d'une session à l'autre ce sont les mêmes, et on peut tester
     * une scène tardive sans rejouer les précédentes. `pickUp` dédoublonne par
     * identifiant, donc l'appeler à chaque scène est sans effet de bord.
     */
    equipFromScript(kit: {
      augmentation?: boolean
      items?: Array<{
        id: string; label: string; kind: 'key' | 'lore'
        color?: string; from?: string; decrypted?: boolean
      }>
    } | null): number {
      if (!kit?.items?.length) return 0
      if (kit.augmentation) this.hasAugmentation = true
      let added = 0
      for (const o of kit.items) {
        const before = this.inventory.length
        this.pickUp(o.id, o.label, o.from, o.kind, o.color || undefined)
        if (this.inventory.length > before) added++
        if (o.decrypted) this.markDecrypted(o.id)
      }
      return added
    },

    requestChallenge() {
      this.pendingChallenge = true
    },

    clearChallenge() {
      this.pendingChallenge = false
    },

    markDecrypted(id: string) {
      if (!this.decryptedObjectIds.includes(id)) this.decryptedObjectIds.push(id)
    },

    /**
     * @param from le lieu du ramassage, pour qu'une scène suivante puisse y renvoyer.
     * @param kind `key` s'il ouvre quelque chose, `lore` s'il éclaire la quête.
     */
    pickUp(
      id: string, label: string, from?: string,
      kind: 'key' | 'lore' = 'lore', color?: string,
    ) {
      if (this.inventory.some(o => o.id === id)) return
      this.inventory.push({ id, label, from, kind, color })
    },

    /**
     * @param grantsAugmentation vrai quand l'objet-clé de la scène EST
     * l'augmentation — c'est le cas de l'auberge, et d'elle seule.
     */
    /**
     * @param item l'objet-clé ramassé. Il ENTRE DANS L'INVENTAIRE : une carte
     * d'accès sert souvent plusieurs scènes plus loin, et elle disparaissait
     * avec sa scène — seul un booléen survivait, sans nom ni trace.
     */
    collectKeyItem(
      grantsAugmentation = false,
      item?: { id?: string; name: string; from?: string; color?: string },
    ) {
      this.hasKeyItem = true
      this.pendingKeyItem = false
      if (grantsAugmentation) this.hasAugmentation = true
      if (item?.name) {
        this.pickUp(
          item.id || `cle_${this.inventory.length + 1}`, item.name, item.from, 'key', item.color)
      }
    },

    recordNpcTalk(npcId: string) {
      if (!this.talkedToNpcIds.includes(npcId)) this.talkedToNpcIds.push(npcId)
      this.npcExchanges[npcId] = (this.npcExchanges[npcId] ?? 0) + 1
    },

    markResolved() {
      this.resolved = true
    },

    triggerPaywall() {
      this.paywallTriggered = true
      this.currentScreen = 'paywall'
    },

    /**
     * Repart sur une scène neuve, sans quitter la partie.
     *
     * Efface ce qui appartenait à la scène précédente — tours, dialogue,
     * objet-clé, personnages rencontrés.
     *
     * GARDE ce qui appartient à la PARTIE : le profil, le journal, la dépense,
     * l'augmentation, l'inventaire et les objets déjà déchiffrés. Le joueur
     * arrive dans une scène avec ce qu'il a récupéré dans les précédentes —
     * c'est souvent ce qui en résout le puzzle.
     */
    startNewScene(sceneId: string | null) {
      this.pendingSceneId = sceneId
      this.playingSubState = 'awaiting_input'
      this.narrativeHistory = []
      this.turnCount = 0
      this.currentSceneImageUrl = null
      this.sceneImageLoading = false
      this.sceneImageError = null
      this.activeNpcId = null
      this.hasKeyItem = false
      this.keyItemExchanges = 0
      this.informedAboutItem = false
      this.pendingKeyItem = false
      this.talkedToNpcIds = []
      this.npcExchanges = {}
      this.resolved = false
      this.conversationHistory = []
      this.lastCommand = null
      this.lastMode = null
      this.lastEffects = []
      this.turnError = null
      this.pendingChallenge = false
    },

    resetGame() {
      this.pendingSceneId = null
      // Une partie neuve ne garde ni faculté, ni objets, ni noms déchiffrés :
      // sans ça, le joueur suivant commençait avec l'inventaire du précédent.
      this.hasAugmentation = false
      this.inventory = []
      this.decryptedObjectIds = []
      this.activeTool = 'eye'
      this.currentScreen = 'login'
      this.playingSubState = 'awaiting_input'
      this.narrativeHistory = []
      this.turnCount = 0
      this.currentSceneImageUrl = null
      this.sceneImageLoading = false
      this.sceneImageError = null
      this.activeNpcId = null
      this.paywallTriggered = false
      this.modelTurnsUsed = 0
      this.spentUsd = 0
      this.hasKeyItem = false
      this.keyItemExchanges = 0
      this.informedAboutItem = false
      this.pendingKeyItem = false
      this.talkedToNpcIds = []
      this.npcExchanges = {}
      this.resolved = false
      this.conversationHistory = []
      this.lastCommand = null
      this.lastMode = null
      this.lastEffects = []
      this.turnError = null
    },
  },
})
