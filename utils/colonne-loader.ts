import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Colonne } from '~/types/colonne'

const cache = new Map<string, Colonne>()

export async function loadColonne(colonneId: string): Promise<Colonne> {
  if (cache.has(colonneId)) {
    return cache.get(colonneId)!
  }

  const filePath = resolve(process.cwd(), 'game', `${colonneId}.colonne.json`)

  let raw: string
  try {
    raw = await readFile(filePath, 'utf-8')
  } catch {
    throw new Error(`Colonne file not found: ${colonneId}`)
  }

  let colonne: Colonne
  try {
    colonne = JSON.parse(raw) as Colonne
  } catch {
    throw new Error(`Invalid JSON in colonne file: ${colonneId}`)
  }

  if (!colonne.id || !colonne.meta || !colonne.levels?.length) {
    throw new Error(`Colonne file missing required fields: ${colonneId}`)
  }

  cache.set(colonneId, colonne)
  return colonne
}

export function getPromptByPath(colonne: Colonne, path: string): string {
  const parts = path.split('.')
  let current: unknown = colonne

  for (const part of parts) {
    if (current === null || typeof current !== 'object') {
      throw new Error(`Invalid path "${path}" in colonne "${colonne.id}"`)
    }
    const idx = parseInt(part, 10)
    if (!isNaN(idx)) {
      current = (current as unknown[])[idx]
    } else {
      current = (current as Record<string, unknown>)[part]
    }
  }

  if (typeof current !== 'string') {
    throw new Error(`Path "${path}" does not resolve to a string in colonne "${colonne.id}"`)
  }

  return current
}
