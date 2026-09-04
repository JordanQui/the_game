import { createHash } from 'node:crypto'

/**
 * Enregistrement et rejeu des générations, en développement uniquement.
 *
 * Une scène coûte ~2,6 centimes, son image ~6,5. Sur une journée de mise au
 * point où l'on relance l'expérience trente fois, on paie trente fois la même
 * chose. Ici, la première génération est écrite sur disque et les suivantes la
 * rejouent : gratuit, et instantané.
 *
 * Tout est conditionné à `import.meta.dev`. En production ces fonctions sont
 * inertes et n'écrivent jamais rien — Vercel a de toute façon un système de
 * fichiers en lecture seule.
 *
 * Pour régénérer pour de vrai, charger la page avec `?fresh=1`.
 */

const DIR = '.mocks'

/** Une empreinte par scène et par joueur : deux profils, deux mocks. */
export function mockKey(sceneId: string, seed: string): string {
  return createHash('sha256').update(`${sceneId}|${seed}`).digest('hex').slice(0, 16)
}

async function fsModule() {
  // Import dynamique : le module n'est jamais chargé hors développement.
  const [fs, path] = await Promise.all([import('node:fs/promises'), import('node:path')])
  return { fs, path }
}

function filePath(pathMod: typeof import('node:path'), kind: string, key: string): string {
  return pathMod.resolve(process.cwd(), DIR, `${kind}-${key}.json`)
}

export async function readMock<T>(kind: string, key: string): Promise<T | null> {
  if (!import.meta.dev) return null

  try {
    const { fs, path } = await fsModule()
    const raw = await fs.readFile(filePath(path, kind, key), 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    // Absent ou illisible : on régénère, c'est le comportement attendu.
    return null
  }
}

export async function writeMock(kind: string, key: string, value: unknown): Promise<void> {
  if (!import.meta.dev) return

  try {
    const { fs, path } = await fsModule()
    await fs.mkdir(path.resolve(process.cwd(), DIR), { recursive: true })
    await fs.writeFile(filePath(path, kind, key), JSON.stringify(value, null, 2), 'utf-8')
  } catch {
    // Un mock qu'on ne peut pas écrire ne doit jamais faire échouer un tour.
  }
}

/** `?fresh=1` force une vraie génération et réécrit le mock. */
export function wantsFresh(event: H3Event): boolean {
  const q = getQuery(event)
  return q.fresh === '1' || q.fresh === 'true'
}
