export const runtime = 'nodejs'

import { NextResponse } from 'next/server'

import { getDatabase } from '@/lib/mongodb'
import { COOL_SOURCES, DEFAULT_BAG, NICHE_SOURCES, type CoolSource, type NicheSource } from '@/lib/v3/cool/bag'
import { drawStart, type StartType } from '@/lib/v3/cool/start'
import { normalizeWaveDocument, type WaveDocument } from '@/lib/random/waveEngine'

/**
 * One cool content, drawn live, for a look in the browser:
 * /api/v3/cool?type=image&source=trend — or source=music for one niche. The
 * live random draws the same way, through /api/discovery/random, with the
 * session's bag choosing the source.
 */

type Payload = { excludeIds?: unknown; type?: unknown; source?: unknown }

function parseExcludes(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string').slice(0, 300)
}

const parseType = (value: unknown): StartType => (value === 'image' ? 'image' : 'video')

function parseSource(value: unknown): { source: CoolSource; niche?: NicheSource } {
  if (typeof value === 'string' && NICHE_SOURCES.includes(value as NicheSource)) return { source: 'niche', niche: value as NicheSource }
  if (typeof value === 'string' && COOL_SOURCES.includes(value as CoolSource)) return { source: value as CoolSource }
  return { source: DEFAULT_BAG[Math.floor(Math.random() * DEFAULT_BAG.length)] }
}

async function draw(type: StartType, { source, niche }: { source: CoolSource; niche?: NicheSource }, excludeIds: string[]) {
  const started = Date.now()
  try {
    const db = await getDatabase()
    const drawn = await drawStart(db, { type, source, niche, excludeIds })
    const row = drawn?.rows[0]
    if (!drawn || !row) return NextResponse.json({ items: [], reason: 'rien à tirer', asked: source, tookMs: Date.now() - started })
    const item = normalizeWaveDocument(row as WaveDocument)
    return NextResponse.json({
      items: item ? [item] : [],
      engine: 'cool-draw',
      build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
      id: String(row._id),
      source: drawn.source,
      asked: drawn.asked,
      ...(drawn.niche ? { niche: drawn.niche } : {}),
      fallback: drawn.fallback,
      popularity: (row.v3 as { popularity?: string } | undefined)?.popularity ?? 'unknown',
      tookMs: Date.now() - started,
    })
  } catch (error) {
    console.error('[v3/cool] échec', error)
    return NextResponse.json({ items: [], error: 'indisponible' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Payload | null
  return draw(parseType(body?.type), parseSource(body?.source), parseExcludes(body?.excludeIds))
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  return draw(parseType(url.searchParams.get('type')), parseSource(url.searchParams.get('source')), [])
}
