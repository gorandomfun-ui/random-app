export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { recordDailyUsage } from '@/lib/metrics/usage'
import { selectImage } from '@/lib/random/images'
import { selectVideo } from '@/lib/random/videos'
import { selectQuote } from '@/lib/random/quotes'
import { selectFact } from '@/lib/random/facts'
import { selectJoke } from '@/lib/random/jokes'
import { selectWeb } from '@/lib/random/web'
import type { ItemType } from '@/lib/random/types'

type UsageLang = 'en' | 'fr' | 'de' | 'jp' | 'unknown'

type ImageResult = Awaited<ReturnType<typeof selectImage>>
type VideoResult = Exclude<Awaited<ReturnType<typeof selectVideo>>, null>
type QuoteResult = Exclude<Awaited<ReturnType<typeof selectQuote>>, null>
type FactResult = Exclude<Awaited<ReturnType<typeof selectFact>>, null>
type JokeResult = Exclude<Awaited<ReturnType<typeof selectJoke>>, null>
type WebResult = Exclude<Awaited<ReturnType<typeof selectWeb>>, null>

type RandomItem = ImageResult | VideoResult | QuoteResult | FactResult | JokeResult | WebResult

const DEFAULT_TYPES: ItemType[] = ['image', 'quote', 'fact', 'joke', 'video', 'web']
const SUPPORTED_LANGS = new Set<UsageLang>(['en', 'fr', 'de', 'jp'])

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

async function getItemForType(type: ItemType): Promise<RandomItem | null> {
  switch (type) {
    case 'image':
      return await selectImage()
    case 'video':
      return (await selectVideo()) ?? null
    case 'quote':
      return (await selectQuote()) ?? null
    case 'fact':
      return (await selectFact()) ?? null
    case 'joke':
      return (await selectJoke()) ?? null
    case 'web':
      return (await selectWeb()) ?? null
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

async function respondWithItem(item: RandomItem, lang: UsageLang) {
  await recordDailyUsage({ type: item.type, lang, provider: resolveProvider(item) })
  return NextResponse.json({ item })
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const lang = parseLang(searchParams.get('lang'))
    const types = parseTypes(searchParams.get('types'))

    for (const type of types) {
      const item = await getItemForType(type)
      if (item) {
        return await respondWithItem(item, lang)
      }
    }

    const fallback = await selectImage()
    return await respondWithItem(fallback, lang)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
