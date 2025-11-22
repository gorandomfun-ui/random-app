import { createHash } from 'crypto'

import { getDbSafe } from '@/lib/random/data'
import { createFactDocument } from '@/lib/random/facts'
import { createJokeDocument } from '@/lib/random/jokes'
import { createQuoteDocument } from '@/lib/random/quotes'

export type AiContentType = 'joke' | 'fact' | 'quote'

export type AiRawEntry = {
  type?: AiContentType | string
  text?: string
  author?: string
  lang?: string
  tags?: string[] | string
  model?: string
  source?: string
  provider?: string
  disclaimer?: string
}

export type NormalizedAiEntry = {
  type: AiContentType
  text: string
  author?: string
  lang?: string
  tags: string[]
  model?: string
  source?: string
  provider?: string
  disclaimer?: string
}

export type AiImportOptions = {
  dryRun?: boolean
}

export type AiImportResult = {
  ok: boolean
  scanned: number
  imported: number
  updated: number
  skipped: number
  duplicates: number
  errors: string[]
  sample: NormalizedAiEntry[]
  dryRun: boolean
}

const SUPPORTED_TYPES: AiContentType[] = ['joke', 'fact', 'quote']

function isSupportedType(value: unknown): value is AiContentType {
  if (typeof value !== 'string') return false
  return SUPPORTED_TYPES.includes(value as AiContentType)
}

function normalizeTags(value: unknown): string[] {
  if (!value) return []
  if (typeof value === 'string') {
    return value
      .split(/[;,]/)
      .map((entry) => entry.trim())
      .filter(Boolean)
  }
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

function normalizeLang(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return undefined
  return trimmed
}

function normalizeAuthor(value: unknown, fallback = 'ChatGPT'): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed || fallback
}

export function normalizeAiEntries(input: unknown): { entries: NormalizedAiEntry[]; errors: string[] } {
  const errors: string[] = []
  if (!Array.isArray(input)) {
    return { entries: [], errors: ['Le JSON doit être un tableau de contenus.'] }
  }

  const entries: NormalizedAiEntry[] = []
  input.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      errors.push(`Entrée #${index + 1}: format invalide.`)
      return
    }
    const record = raw as AiRawEntry
    if (!isSupportedType(record.type)) {
      errors.push(`Entrée #${index + 1}: type invalide (attendu joke|fact|quote).`)
      return
    }
    const text = typeof record.text === 'string' ? record.text.trim() : ''
    if (!text) {
      errors.push(`Entrée #${index + 1}: texte manquant.`)
      return
    }
    const lang = normalizeLang(record.lang)
    const tags = normalizeTags(record.tags)
    const base: NormalizedAiEntry = {
      type: record.type,
      text,
      author: record.type === 'quote' ? normalizeAuthor(record.author) : undefined,
      lang,
      tags,
      model: typeof record.model === 'string' ? record.model.trim() || undefined : undefined,
      source: typeof record.source === 'string' ? record.source.trim() || undefined : undefined,
      provider: typeof record.provider === 'string' ? record.provider.trim() || undefined : undefined,
      disclaimer: typeof record.disclaimer === 'string' ? record.disclaimer.trim() || undefined : undefined,
    }
    entries.push(base)
  })

  return { entries, errors }
}

function defaultDisclaimer(source?: string): string {
  return source ? `Généré par IA – ${source}` : 'Contenu généré par IA'
}

async function upsertAiContent(entry: NormalizedAiEntry, dryRun = false): Promise<'inserted' | 'updated' | 'skipped' | 'dry'> {
  const db = await getDbSafe()
  if (!db) throw new Error('Impossible de se connecter à la base MongoDB.')

  const hash = createHash('sha1').update(`${entry.type}:${entry.lang ?? ''}:${entry.text}`).digest('hex')
  const baseProvider = entry.provider || 'ai'
  const sourceName = entry.source || 'ChatGPT'
  const common = {
    type: entry.type,
    text: entry.text,
    provider: `${baseProvider}-${entry.type}`,
    source: { name: sourceName },
    tags: entry.tags,
    lang: entry.lang,
    hash,
    variant: 'ai',
    ai: {
      source: entry.source || 'ChatGPT',
      model: entry.model,
      generatedAt: new Date().toISOString(),
    },
    disclaimer: entry.disclaimer || defaultDisclaimer(entry.source || entry.model),
  }

  let payload: Record<string, unknown> | null = null

  if (entry.type === 'joke') {
    const document = createJokeDocument({
      text: entry.text,
      provider: `${baseProvider}-${entry.type}`,
      source: { name: sourceName },
      tags: entry.tags,
    })
    if (!document) return 'skipped'
    payload = { ...document, ...common }
  } else if (entry.type === 'fact') {
    const document = createFactDocument({
      text: entry.text,
      provider: `${baseProvider}-${entry.type}`,
      source: { name: sourceName },
      tags: entry.tags,
    })
    if (!document) return 'skipped'
    payload = { ...document, ...common, variant: 'ai' }
  } else if (entry.type === 'quote') {
    const document = createQuoteDocument({
      text: entry.text,
      author: entry.author,
      provider: `${baseProvider}-${entry.type}`,
      source: { name: sourceName },
      tags: entry.tags,
    })
    if (!document) return 'skipped'
    payload = { ...document, ...common, author: entry.author }
  }

  if (!payload) return 'skipped'

  if (dryRun) return 'dry'

  const res = await db.collection('items').updateOne(
    { type: entry.type, hash },
    {
      $set: {
        ...payload,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date(), rand: Math.random() },
    },
    { upsert: true },
  )

  if (res.upsertedCount && res.upsertedCount > 0) return 'inserted'
  if (res.modifiedCount && res.modifiedCount > 0) return 'updated'
  return 'skipped'
}

export async function importAiContent(input: unknown, options: AiImportOptions = {}): Promise<AiImportResult> {
  const { entries, errors } = normalizeAiEntries(input)
  const seenHashes = new Set<string>()

  let imported = 0
  let updated = 0
  let skipped = 0
  let duplicates = 0

  if (!entries.length) {
  return {
    ok: errors.length === 0,
    scanned: 0,
    imported,
    updated,
    skipped,
    duplicates,
    errors,
    sample: [],
    dryRun: Boolean(options.dryRun),
  }
  }

  for (const entry of entries) {
    const hash = createHash('sha1').update(`${entry.type}:${entry.lang ?? ''}:${entry.text}`).digest('hex')
    if (seenHashes.has(hash)) {
      duplicates += 1
      continue
    }
    seenHashes.add(hash)

    try {
      const result = await upsertAiContent(entry, options.dryRun)
      if (result === 'inserted') imported += 1
      else if (result === 'updated') updated += 1
      else if (result === 'dry') {
        // nothing to record beyond scanned count
      } else skipped += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`Erreur lors de l'import de «${entry.text.slice(0, 80)}…»: ${message}`)
    }
  }

  return {
    ok: errors.length === 0,
    scanned: entries.length,
    imported,
    updated,
    skipped,
    duplicates,
    errors,
    sample: entries.slice(0, 5),
    dryRun: Boolean(options.dryRun),
  }
}
