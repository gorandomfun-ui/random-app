export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { recordDailyUsage } from '@/lib/metrics/usage'
import type { ItemType, RandomSelectOptions, VideoPool } from '@/lib/random/types'
import { selectImage } from '@/lib/random/images'
import { selectVideo } from '@/lib/random/videos'
import { selectQuote } from '@/lib/random/quotes'
import { selectFact } from '@/lib/random/facts'
import { selectJoke } from '@/lib/random/jokes'
import { selectWeb } from '@/lib/random/web'

type UsageLang = 'en' | 'fr' | 'de' | 'jp' | 'es' | 'unknown'

type ImageResult = Awaited<ReturnType<typeof selectImage>>
type VideoResult = Exclude<Awaited<ReturnType<typeof selectVideo>>, null>
type QuoteResult = Exclude<Awaited<ReturnType<typeof selectQuote>>, null>
type FactResult = Exclude<Awaited<ReturnType<typeof selectFact>>, null>
type JokeResult = Exclude<Awaited<ReturnType<typeof selectJoke>>, null>
type WebResult = Exclude<Awaited<ReturnType<typeof selectWeb>>, null>

type RandomItem = ImageResult | VideoResult | QuoteResult | FactResult | JokeResult | WebResult

const DEFAULT_TYPES: ItemType[] = ['image', 'quote', 'fact', 'joke', 'video', 'web']
const SUPPORTED_LANGS = new Set<UsageLang>(['en', 'fr', 'de', 'jp', 'es'])

function parseLang(raw: string | null): UsageLang {
  if (!raw) return 'en'
  const normalized = raw.trim().toLowerCase() as UsageLang
  if (SUPPORTED_LANGS.has(normalized)) return normalized
  return 'unknown'
}

function parseTypes(param: string | null): ItemType[] {
  if (!param) return DEFAULT_TYPES.slice()
  const tokens = param
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean) as ItemType[]
  const allowed = new Set<ItemType>(DEFAULT_TYPES)
  const filtered = tokens.filter((token): token is ItemType => allowed.has(token))
  return filtered.length ? filtered : DEFAULT_TYPES.slice()
}

function parseStrongPool(searchParams: URLSearchParams): boolean {
  const pool = searchParams.get('pool')?.trim().toLowerCase()
  const strong = searchParams.get('strong')?.trim().toLowerCase()
  return pool === 'strong' || strong === '1' || strong === 'true'
}

function parseVideoPool(searchParams: URLSearchParams): VideoPool | undefined {
  const pool = searchParams.get('videoPool')?.trim().toLowerCase()
  if (pool === 'trending' || pool === 'fresh' || pool === 'retro' || pool === 'retro-ad') {
    return pool
  }
  return undefined
}

function parsePreview(searchParams: URLSearchParams): boolean {
  const preview = searchParams.get('preview')?.trim().toLowerCase()
  return preview === '1' || preview === 'true'
}

async function getItemForType(type: ItemType, options: RandomSelectOptions = {}): Promise<RandomItem | null> {
  switch (type) {
    case 'image':
      return await selectImage(options)
    case 'video':
      return (await selectVideo(options)) ?? null
    case 'quote':
      return (await selectQuote(options)) ?? null
    case 'fact':
      return (await selectFact(options)) ?? null
    case 'joke':
      return (await selectJoke(options)) ?? null
    case 'web':
      return (await selectWeb(options)) ?? null
    default:
      return null
  }
}

function resolveProvider(item: RandomItem): string | undefined {
  if (typeof (item as { provider?: unknown }).provider === 'string') {
    const provider = (item as { provider?: string }).provider?.trim()
    if (provider) return provider
  }

  if ('source' in item && item.source && typeof item.source === 'object') {
    const name = (item.source as { name?: string | null }).name
    if (typeof name === 'string' && name.trim()) return name.trim()
  }

  return undefined
}

async function respondWithItem(item: RandomItem, lang: UsageLang, { preview = false }: { preview?: boolean } = {}) {
  if (!preview) {
    await recordDailyUsage({ type: item.type, lang, provider: resolveProvider(item) })
  }
  return NextResponse.json({ item })
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const lang = parseLang(searchParams.get('lang'))
    const types = parseTypes(searchParams.get('types'))
    const options: RandomSelectOptions = {
      strong: parseStrongPool(searchParams),
      videoPool: parseVideoPool(searchParams),
    }
    const preview = parsePreview(searchParams)

    for (const type of types) {
      const item = await getItemForType(type, options)
      if (item) {
        return await respondWithItem(item, lang, { preview })
      }
    }

    const fallback = await selectImage()
    return await respondWithItem(fallback, lang, { preview })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
