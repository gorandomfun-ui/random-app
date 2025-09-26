import fs from 'node:fs/promises'
import path from 'node:path'

export type VideoKeywordDictionary = {
  energies?: string[]
  subjects?: string[]
  formats?: string[]
  locales?: string[]
  eras?: string[]
  extras?: string[]
}

let cached: VideoKeywordDictionary | null = null

async function readDictionary(): Promise<VideoKeywordDictionary> {
  if (cached) return cached
  const filePath = path.resolve(process.cwd(), 'lib/ingest/keywords/videos.json')
  const raw = await fs.readFile(filePath, 'utf8')
  const parsed = JSON.parse(raw) as VideoKeywordDictionary | null
  cached = parsed || {}
  return cached
}

function toArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0)
}

function pickOne(list: string[]): string | undefined {
  if (!list.length) return undefined
  const index = Math.floor(Math.random() * list.length)
  return list[index]
}

function buildTokens(parts: Array<string | undefined | null>): string {
  return parts
    .flatMap((part) => {
      if (!part) return []
      const trimmed = part.trim()
      return trimmed ? [trimmed] : []
    })
    .join(' ')
    .trim()
}

export async function loadVideoKeywordDictionary(): Promise<Required<VideoKeywordDictionary>> {
  const dict = await readDictionary()
  return {
    energies: toArray(dict.energies),
    subjects: toArray(dict.subjects),
    formats: toArray(dict.formats),
    locales: toArray(dict.locales),
    eras: toArray(dict.eras),
    extras: toArray(dict.extras),
  }
}

export function buildVideoQueries(dict: Required<VideoKeywordDictionary>, count: number): string[] {
  const results = new Set<string>()
  const fallbackPool = [...dict.subjects]
  const maxAttempts = Math.max(count * 12, 40)
  let attempts = 0

  while (results.size < count && attempts < maxAttempts) {
    attempts += 1

    const energy = Math.random() < 0.8 ? pickOne(dict.energies) : undefined
    const era = Math.random() < 0.6 ? pickOne(dict.eras) : undefined
    const subject = pickOne(dict.subjects)
    if (!subject) continue
    const format = Math.random() < 0.9 ? pickOne(dict.formats) : undefined
    const locale = Math.random() < 0.65 ? pickOne(dict.locales) : undefined
    const extra = Math.random() < 0.45 ? pickOne(dict.extras) : undefined

    const localePart = locale ? `${locale} scene` : undefined
    const tokens = buildTokens([
      energy,
      era,
      subject,
      format,
      localePart,
      extra,
    ])

    if (!tokens) continue
    results.add(tokens)
  }

  if (results.size < count && fallbackPool.length) {
    for (const subject of fallbackPool) {
      if (results.size >= count) break
      const fallbackQuery = buildTokens([pickOne(dict.energies), subject, pickOne(dict.formats)])
      if (fallbackQuery) results.add(fallbackQuery)
    }
  }

  if (results.size < count && dict.extras.length) {
    for (const extra of dict.extras) {
      if (results.size >= count) break
      const fallbackQuery = buildTokens([pickOne(dict.energies), extra, pickOne(dict.formats)])
      if (fallbackQuery) results.add(fallbackQuery)
    }
  }

  const final = Array.from(results)
  if (!final.length) {
    return ['weird archive footage', 'retro craft tutorial'].slice(0, count)
  }
  return final.slice(0, count)
}
