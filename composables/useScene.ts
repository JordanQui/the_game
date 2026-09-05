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
 * La scène de l'onglet en cours.
 *
 * Recharger la page relançait une génération — donc consommait le quota, donc
 * envoyait le joueur au paywall dès son deuxième chargement. Or son monde
 * existe déjà : on le remet en place au lieu de le repayer.
 *
 * `sessionStorage` plutôt que `localStorage` : la scène appartient à cette
 * visite-là, pas à ce navigateur pour toujours.
 */
const SCENE_KEY = 'tg_scene'

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

function readStoredScene(): SceneTextResponse | null {
  if (!import.meta.client) return null
  try {
    const raw = sessionStorage.getItem(SCENE_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw) as SceneTextResponse

    // Le jeu a été redéployé depuis : cette scène ne le reflète plus. Sans ce
    // contrôle, un déploiement restait invisible pour tout joueur ayant déjà
    // une scène en session — on croyait livrer sans effet.
    if (stored.build_id !== currentBuild()) {
      forgetStoredScene()
      return null
    }
    return stored
  } catch {
    return null
  }
}

function storeScene(scene: SceneTextResponse): void {
  if (!import.meta.client) return
  try {
    sessionStorage.setItem(SCENE_KEY, JSON.stringify({ ...scene, build_id: currentBuild() }))
  } catch {
    // Stockage plein ou refusé : on régénérera, c'est tout.
  }
}

/**
 * Le journal survit au rechargement, comme la scène.
 *
 * Sans ça, recharger la page en pleine partie ramenait la scène en cours mais
 * effaçait tout ce qui l'avait précédée : la scène suivante serait alors née
 * comme si le joueur venait de nulle part.
 */
const CARRY_KEY = 'tg_carry'

interface Carry {
  journal: JournalEntry[]
  inventory: Array<{ id: string; label: string; from?: string }>
  decrypted: string[]
  augmentation: boolean
}

function storeCarry(carry: Carry): void {
  if (!import.meta.client) return
  try { sessionStorage.setItem(CARRY_KEY, JSON.stringify(carry)) } catch { /* on régénérera */ }
}

function readStoredCarry(): Carry | null {
  if (!import.meta.client) return null
  try {
    const raw = sessionStorage.getItem(CARRY_KEY)
    return raw ? JSON.parse(raw) as Carry : null
  } catch {
    return null
  }
}

export function forgetStoredScene(): void {
  if (!import.meta.client) return
  try { sessionStorage.removeItem(SCENE_KEY) } catch { /* sans conséquence */ }
}

/**
 * `?fresh=1` demandé dans l'URL.
 *
 * Il vaut dans TOUS les environnements : il jette la scène gardée en session.
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
    })
  }

  function restoreCarry() {
    const carry = readStoredCarry()
    if (!carry) return
    if (!playerStore.journal.length) playerStore.journal = carry.journal ?? []
    if (!gameStore.inventory.length) gameStore.inventory = carry.inventory ?? []
    if (!gameStore.decryptedObjectIds.length) gameStore.decryptedObjectIds = carry.decrypted ?? []
    if (carry.augmentation) gameStore.hasAugmentation = true
  }

  /** Phase 1. Bloquant : sans texte, pas de scène. */
  async function loadSceneText(sceneId?: string, user?: UserProfile) {
    isLoadingText.value = true
    error.value = null
    quotaExhausted.value = false

    // AVANT toute chose, et quel que soit le chemin pris ensuite. Ce n'était
    // fait que si une scène était trouvée en session : après un rechargement où
    // la scène se régénère, l'inventaire restait dans sessionStorage sans que
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
    const stored = wantsFresh() ? null : readStoredScene()
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
        body: { sceneId, user, journal: playerStore.journal, carried: carried() },
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
