export const runtime = 'nodejs'

import { NextResponse } from 'next/server'

import { findWaveTrail } from '@/lib/random/waveEngine'
import { selectFact } from '@/lib/random/facts'
import { hasWaveSignal, sanitizeWaveHint, type WaveSimilarityHint } from '@/lib/random/wave'
import type { ItemType } from '@/lib/random/types'

const WAVE_TYPES: ItemType[] = ['image', 'video', 'web', 'quote', 'joke', 'fact']

type WaveRequest = {
  anchor?: Partial<WaveSimilarityHint>
  anchorId?: string
  lang?: 'en' | 'fr' | 'de' | 'es' | 'jp'
  excludeIds?: string[]
  limit?: number
  types?: ItemType[]
  factVariant?: 'quiz' | 'text'
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as WaveRequest
    const anchor = sanitizeWaveHint(body.anchor || {})
    if (!hasWaveSignal(anchor)) {
      return NextResponse.json({ error: 'Missing similarity signal' }, { status: 400 })
    }
    let items = await findWaveTrail({
      anchor,
      anchorId: typeof body.anchorId === 'string' ? body.anchorId : undefined,
      lang: body.lang || 'en',
      excludeIds: Array.isArray(body.excludeIds) ? body.excludeIds.filter((value): value is string => typeof value === 'string') : [],
      limit: typeof body.limit === 'number' ? body.limit : 10,
      types: Array.isArray(body.types) ? body.types.filter((type): type is ItemType => WAVE_TYPES.includes(type)) : WAVE_TYPES,
      factVariant: body.factVariant === 'quiz' || body.factVariant === 'text' ? body.factVariant : undefined,
    })
    if (!items.length && body.factVariant === 'quiz') {
      const excluded = new Set(Array.isArray(body.excludeIds) ? body.excludeIds : [])
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const fact = await selectFact({ lang: body.lang || 'en' })
        if (!fact || fact.variant !== 'quiz') continue
        if (fact._id && excluded.has(fact._id)) continue
        items = [fact]
        break
      }
    }
    return NextResponse.json({ items })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
