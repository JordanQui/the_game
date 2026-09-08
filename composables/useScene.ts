import type { SceneTextResponse } from '~/types/scene'
import type { UserProfile } from '~/types/user'
import type { JournalEntry, CarriedItem } from '~/utils/journal'
import { useGameStore } from '~/stores/game'
import { usePlayerStore } from '~/stores/player'
import { useImageGen } from '~/composables/useImageGen'

/** La génération de scène tourne autour de 15-20 s ; au-delà, c'est perdu. */
const SCENE_TEXT_TIMEOUT_MS = 90_000

/**
 * Orchestre le pipeline découplé.
 *
 * Le texte arrive en ~20 s et la scène est jouable immédiatement ; l'image
 * arrive ~25 s plus tard et se glisse au-dessus du texte sans bloquer. Les
 * deux appels ne doivent jamais être fusionnés : ensemble ils dépassent
 * n'importe quel timeout serverless.
 */
/**
 * La scène en cours, gardée par le navigateur.
 *
 * Recharger la page relançait une génération — donc consommait le quota, donc
 * envoyait le joueur au paywall dès son deuxième chargement. Or son monde
 * existe déjà : on le remet en place au lieu de le repayer.
 */
const SCENE_KEY = 'tg_scene'

/**
 * La mémoire du navigateur.
 *
 * `localStorage` et non `sessionStorage` : la partie ne dure pas une visite.
 * Le droit d'accès ouvert par le paiement court sur huit jours et la position
 * voyage dans un cookie de même durée — une mémoire qui mourait avec l'onglet
 * faisait revenir le joueur du lendemain à la bonne scène mais sans son
 * monde : ni profil, ni journal, ni inventaire. La scène se régénérait alors
 * pour un inconnu, et c'est le poste de dépense le plus cher du jeu.
 *
 * Elle ne quitte JAMAIS la machine du joueur : rien n'est enregistré côté
 * serveur, qui ne tient aucune base. Elle s'efface avec les données du site, en
 * repartant de zéro depuis l'accueil, ou d'elle-même passé la fenêtre — c'est
 * ce que dit maintenant l'avertissement affiché avant la connexion.
 *
 * L'accès peut lever : navigation privée, cookies refusés. On régénérera.
 */
function memory(): Storage | null {
  if (!import.meta.client) return null
  try { return window.localStorage } catch { return null }
}

/**
 * Combien de temps le navigateur retient une partie.
 *
 * Alignée sur la fenêtre payante, comme le cookie de position : la mémoire ne
 * doit pas survivre au droit qui permet de s'en servir.
 */
function memoryDays(): number {
  return (useRuntimeConfig().public.memoryDays as number) || 8
}

/**
 * Identifiant du build en cours.
 *
 * Nuxt le régénère à chaque compilation : il change donc à chaque déploiement.
 * C'est le repère le plus sûr pour jeter une scène gardée en session — plus sûr
 * qu'une empreinte du script, puisqu'il couvre aussi les changements de code.
 */
function currentBuild(): string {
  return useRuntimeConfig().app.buildId
}

/**
 * Empreinte du script servi par ce serveur.
 *
 * Calculée dans `nuxt.config.ts`, qui lit déjà `game/script.json` pour en tirer
 * la palette d'accueil et la liste des scènes.
 */
function currentFingerprint(): string {
  return useRuntimeConfig().public.scriptFingerprint as string
}

/**
 * @param expectedId la scène attendue, quand on en vise une précise.
 *
 * Sans ce contrôle, une reprise pouvait reposer la scène d'un autre onglet :
 * la position vient d'un cookie partagé par tout le navigateur, la scène gardée
 * appartient à un onglet. Le cookie disait « l'étage », l'onglet gardait
 * « l'auberge », et le joueur repartait du comptoir sans rien comprendre.
 */
function readStoredScene(expectedId?: string): SceneTextResponse | null {
  try {
    const raw = memory()?.getItem(SCENE_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw) as SceneTextResponse

    if (expectedId && stored.scene_id !== expectedId) {
      forgetStoredScene()
      return null
    }

    // Le jeu a été redéployé depuis : cette scène ne le reflète plus. Sans ce
    // contrôle, un déploiement restait invisible pour tout joueur ayant déjà
    // une scène en session — on croyait livrer sans effet.
    if (stored.build_id !== currentBuild()) {
      forgetStoredScene()
      return null
    }

    // Le SCRIPT a changé : consignes, seuils, schéma de génération. Le build,
    // lui, peut être resté le même — en développement il ne bouge pas d'un
    // rechargement à l'autre. Sans cette seconde comparaison, corriger un
    // prompt n'avait aucun effet visible tant que l'onglet gardait sa scène :
    // on rechargeait, on retrouvait exactement la même, et on croyait que la
    // correction n'avait pas pris.
    if (stored.script_fingerprint !== currentFingerprint()) {
      forgetStoredScene()
      return null
    }
    return stored
  } catch {
    return null
  }
}

function storeScene(scene: SceneTextResponse): void {
  try {
    memory()?.setItem(SCENE_KEY, JSON.stringify({ ...scene, build_id: currentBuild() }))
  } catch {
    // Stockage plein ou refusé : on régénérera, c'est tout.
  }
}

/**
 * Ce que le joueur emporte, et qui doit survivre à la fermeture du navigateur.
 *
 * Sans ça, revenir en pleine partie ramenait la scène en cours mais effaçait
 * tout ce qui l'avait précédée : la scène suivante serait alors née comme si le
 * joueur venait de nulle part.
 */
const CARRY_KEY = 'tg_carry'

interface Carry {
  journal: JournalEntry[]
  inventory: Array<{
    id: string; label: string; from?: string
    kind: 'key' | 'lore'; color?: string
  }>
  decrypted: string[]
  augmentation: boolean
  primerSeen: boolean
  /**
   * Le profil du joueur, tel que Meta l'a donné et que le classifieur l'a rangé.
   *
   * Il n'y était pas, et un rechargement le perdait : la scène suivante
   * repartait alors du personnage de démonstration, dans un monde qui n'était
   * plus le sien. C'est la seule donnée personnelle de cette mémoire — elle
   * reste sur la machine du joueur, et disparaît avec le reste de la partie.
   */
  profile?: UserProfile | null
  /** Date de la dernière écriture. Au-delà de la fenêtre, tout est oublié. */
  saved_at?: number
}

function storeCarry(carry: Carry): void {
  try {
    memory()?.setItem(CARRY_KEY, JSON.stringify({ ...carry, saved_at: Date.now() }))
  } catch {
    // Stockage plein ou refusé : on régénérera.
  }
}

function readStoredCarry(): Carry | null {
  try {
    const raw = memory()?.getItem(CARRY_KEY)
    if (!raw) return null
    const carry = JSON.parse(raw) as Carry

    // Passée la fenêtre, la partie s'efface d'elle-même — le profil Meta avec.
    // La scène part en même temps : la garder sans le journal ni l'inventaire
    // ferait reprendre dans un monde amnésique.
    if (carry.saved_at && Date.now() - carry.saved_at > memoryDays() * 86_400_000) {
      forgetRun()
      return null
    }
    return carry
  } catch {
    return null
  }
}

/** Le nom retenu par ce navigateur, s'il y en a un. Pour l'accueil. */
export function rememberedPlayerName(): string | null {
  return readStoredCarry()?.profile?.identity.name ?? null
}

export function forgetStoredScene(): void {
  try { memory()?.removeItem(SCENE_KEY) } catch { /* sans conséquence */ }
}

/**
 * Oublie la partie entière : la scène ET ce qui la traversait.
 *
 * Pour le joueur qui repart de zéro depuis l'accueil, et pour lui seul.
 * `forgetStoredScene` ne suffit pas : sans ce coup de balai, on repartait à
 * l'auberge avec le journal, l'inventaire et l'augmentation de la partie
 * précédente — une première scène jouée par quelqu'un qui avait déjà tout.
 */
export function forgetRun(): void {
  forgetStoredScene()
  try { memory()?.removeItem(CARRY_KEY) } catch { /* sans conséquence */ }
}

/**
 * `?fresh=1` demandé dans l'URL.
 *
 * Il vaut dans TOUS les environnements : il jette la scène gardée par le navigateur.
 * Seul son relais vers l'API reste réservé au développement, où il pilote les
 * mocks sur disque — en production, une scène neuve se paie de toute façon.
 */
function wantsFresh(): boolean {
  if (!import.meta.client) return false
  return Boolean(useRoute().query.fresh)
}

function freshQuery(): Record<string, string> {
  if (!import.meta.dev || !wantsFresh()) return {}
  return { fresh: '1' }
}

export function useScene() {
  const gameStore = useGameStore()
  const playerStore = usePlayerStore()
  const { generateSceneImage } = useImageGen()

  const scene = ref<SceneTextResponse | null>(null)
  const isLoadingText = ref(false)
  const error = ref<string | null>(null)
  const interfacePalette = useInterfacePalette()
  /** Quota gratuit épuisé : ce n'est pas une panne, c'est une invitation à payer. */
  const quotaExhausted = ref(false)

  /**
   * Ce que le joueur emporte d'une scène à l'autre, tel qu'il part au serveur.
   *
   * Un objet dont l'épreuve n'a pas été passée reste anonyme : le joueur ne
   * connaît pas son nom, la scène ne doit donc pas le prononcer.
   */
  function carried(): CarriedItem[] {
    return gameStore.inventory.map(o => ({
      id: o.id,
      label: o.label,
      decrypted: gameStore.decryptedObjectIds.includes(o.id),
      from: o.from,
      kind: o.kind,
      color: o.color,
    }))
  }

  /**
   * Sauvegarde ce qui appartient à la PARTIE, pas à la scène.
   *
   * Sans ça, un rechargement de page ramenait la scène mais reprenait le
   * joueur son augmentation et tout ce qu'il portait.
   */
  function saveCarry() {
    storeCarry({
      journal: playerStore.journal,
      inventory: gameStore.inventory,
      decrypted: gameStore.decryptedObjectIds,
      augmentation: gameStore.hasAugmentation,
      primerSeen: gameStore.primerSeen,
      profile: playerStore.profile,
    })
  }

  function restoreCarry() {
    const carry = readStoredCarry()
    if (!carry) return
    if (!playerStore.journal.length) playerStore.journal = carry.journal ?? []
    if (!gameStore.inventory.length) gameStore.inventory = carry.inventory ?? []
    if (!gameStore.decryptedObjectIds.length) gameStore.decryptedObjectIds = carry.decrypted ?? []
    if (carry.augmentation) gameStore.hasAugmentation = true
    if (carry.primerSeen) gameStore.primerSeen = true
    if (!playerStore.profile && carry.profile) playerStore.setProfile(carry.profile)
  }

  /** Phase 1. Bloquant : sans texte, pas de scène. */
  async function loadSceneText(sceneId?: string, user?: UserProfile) {
    isLoadingText.value = true
    error.value = null
    quotaExhausted.value = false

    // AVANT toute chose, et quel que soit le chemin pris ensuite. Ce n'était
    // fait que si une scène était trouvée en mémoire : après un rechargement où
    // la scène se régénère, l'inventaire y restait sans que
    // personne aille le chercher, et le joueur perdait son augmentation et ses
    // cartes sans comprendre pourquoi.
    restoreCarry()

    // En développement, on dispose de tout ce que le jeu prévoit : sans ça,
    // tester une scène tardive demanderait de rejouer toutes les précédentes.
    // `devInventory` vaut null en production, la ligne y est donc inerte.
    if (import.meta.dev) {
      gameStore.equipFromScript(useRuntimeConfig().public.devInventory as never)
    }

    // Rechargement de page : la scène est déjà là, on la repose telle quelle.
    const stored = wantsFresh() ? null : readStoredScene(sceneId)
    if (stored) {
      scene.value = stored
      // Un rechargement de page repart d'une racine CSS neuve : sans ceci, la
      // scène revenait à ses couleurs mais l'habillage restait magenta.
      interfacePalette.applyScene(stored)
      playerStore.setScene(stored)
      gameStore.addNarrativeEntry('narration', stored.scene_text)
      gameStore.setPlayingSubState('awaiting_input')
      isLoadingText.value = false
      return stored
    }

    try {
      const res = await $fetch<SceneTextResponse>('/api/scene/text', {
        method: 'POST',
        query: freshQuery(),
        // `user ?? profil restauré` : sur une reprise, l'appelant n'a encore
        // rien en main — c'est `restoreCarry` juste au-dessus qui vient de
        // remettre le profil en place.
        body: {
          sceneId,
          user: user ?? playerStore.profile ?? undefined,
          journal: playerStore.journal,
          carried: carried(),
        },
        signal: AbortSignal.timeout(SCENE_TEXT_TIMEOUT_MS),
      })
      scene.value = res
      // L'habillage prend les couleurs de la scène, si elle le demande.
      interfacePalette.applyScene(res)
      storeScene(res)
      saveCarry()
      playerStore.setScene(res)
      gameStore.addNarrativeEntry('narration', res.scene_text)
      gameStore.setPlayingSubState('awaiting_input')
      return res
    } catch (err) {
      // 429 : le quota gratuit est atteint. On ne montre pas d'erreur, on
      // propose la suite.
      if ((err as { statusCode?: number })?.statusCode === 429) {
        quotaExhausted.value = true
        return null
      }

      const aborted = err instanceof DOMException && err.name === 'TimeoutError'
      // Sur un 502, `err.message` ne dit que « 502 Bad Gateway » : la raison
      // réelle — troncature, JSON invalide, scène refusée par la validation —
      // voyage dans `data.statusMessage`. Sans elle, une panne de génération
      // est indiscernable d'une autre.
      const reason = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
      error.value = aborted
        ? 'Le monde a mis trop de temps à se dessiner.'
        : reason || (err instanceof Error ? err.message : 'Impossible de charger la scène')
      return null
    } finally {
      isLoadingText.value = false
    }
  }

  /**
   * Phase 2. Non bloquant : on joue déjà pendant que l'image se dessine.
   * Une scène à illustration figée saute l'étape — rien n'est généré, donc
   * rien n'est facturé, et l'image est là immédiatement.
   */
  function loadSceneImage(res: SceneTextResponse) {
    if (res.static_image) {
      gameStore.setSceneImage(res.static_image)
      gameStore.finishSceneImage()
      return Promise.resolve(res.static_image)
    }

    // Déjà obtenue pour cette scène : ne pas repayer un remontage ou un renvoi.
    if (gameStore.currentSceneImageUrl) {
      return Promise.resolve(gameStore.currentSceneImageUrl)
    }

    return generateSceneImage({
      sceneId: res.scene_id,
      placeName: res.place.name,
      palette: res.palette,
      decor: res.decor,
    })
  }

  /** Le flux complet : texte d'abord, image ensuite, sans attendre. */
  async function enterScene(sceneId?: string, user?: UserProfile) {
    const res = await loadSceneText(sceneId, user)
    if (res) void loadSceneImage(res)
    return res
  }

  /** La commande du joueur touche-t-elle la porte ? */
  function hitsPaywall(input: string): boolean {
    const s = scene.value
    if (!s) return false
    if (gameStore.turnCount < s.paywall.min_turns_before_trigger) return false
    const lower = input.toLowerCase()
    return s.paywall.exit_keywords.some(kw => lower.includes(kw))
  }

  return { scene, isLoadingText, error, quotaExhausted, loadSceneText, loadSceneImage, enterScene, hitsPaywall }
}
