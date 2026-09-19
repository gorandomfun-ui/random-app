export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

import { getDatabase } from '@/lib/mongodb'
import { findCandidates, loadAnchor } from '@/lib/v3/wave/find'
import { buildWave } from '@/lib/v3/wave/select'

/**
 * The Wave: three contents linked to the one on screen.
 *
 * No AI at click, no precomputed links — the labels are read live, so a
 * content tagged this morning is already part of its subject's Waves.
 */

type Payload = {
  itemId?: unknown
  excludeKeys?: unknown
}

function parseId(value: unknown): ObjectId | null {
  if (typeof value !== 'string' || !ObjectId.isValid(value.trim())) return null
  return new ObjectId(value.trim())
}

function parseExcludes(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string').slice(0, 200)
}

export async function POST(request: Request) {
  const started = Date.now()
  try {
    const body = (await request.json().catch(() => null)) as Payload | null
    const itemId = parseId(body?.itemId)
    if (!itemId) {
      return NextResponse.json({ error: 'itemId invalide' }, { status: 400 })
    }

    const db = await getDatabase()
    const loaded = await loadAnchor(db, itemId)
    if (!loaded) {
      // An item with no labels yet simply has no Wave; that is not an error.
      return NextResponse.json({ items: [], level: 3, reason: 'non-étiqueté' })
    }

    const candidates = await findCandidates(db, loaded.anchor, itemId)
    const { items, level } = buildWave(loaded.anchor, candidates, parseExcludes(body?.excludeKeys))

    return NextResponse.json({
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        level: item.level,
        angle: item.v3.angle,
        universe: item.v3.universe,
        popularity: item.v3.popularity,
      })),
      level,
      tookMs: Date.now() - started,
    })
  } catch (error) {
    console.error('[v3/wave] échec', error)
    return NextResponse.json({ items: [], level: 3, error: 'indisponible' }, { status: 500 })
  }
}
