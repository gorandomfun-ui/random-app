export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

import { getDatabase } from '@/lib/mongodb'
import { findCandidates, loadAnchor } from '@/lib/v3/wave/find'
import { accepts, buildWave } from '@/lib/v3/wave/select'
import { normalizeWaveDocument, type WaveDocument } from '@/lib/random/waveEngine'

/**
 * The interface shows three contents and keeps a few in hand, in case one of
 * them turns out to be unplayable or was seen a moment ago. The three that the
 * Wave composed come first; the rest are only spares, in the order the levels
 * offered them.
 */
const RESERVES = 7

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

    const chosenIds = items.map((item) => item.id)

    // The spares go through the same rules as the three. They used not to, and
    // the interface — which falls back to them whenever one of the three cannot
    // be shown — ended up displaying three GIFs from a single archive.
    const kept = [...items]
    const excluded = new Set(chosenIds)
    const spareIds: string[] = []
    for (const candidate of candidates) {
      if (spareIds.length >= RESERVES) break
      if (!accepts(loaded.anchor, kept, candidate, excluded, 3)) continue
      kept.push(candidate)
      excluded.add(candidate.id)
      spareIds.push(candidate.id)
    }

    // The Wave decides on labels alone, but the interface needs something it can
    // actually show, so the full documents are read once the choice is made.
    const order = [...chosenIds, ...spareIds]
    const docs = (await db
      .collection('items')
      .find({ _id: { $in: order.map((id) => new ObjectId(id)) } })
      .toArray()) as unknown as WaveDocument[]

    const byId = new Map(docs.map((doc) => [String(doc._id), doc]))
    const shown = order
      .map((id) => byId.get(id))
      .map((doc) => (doc ? normalizeWaveDocument(doc) : null))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))

    return NextResponse.json({
      items: shown,
      level,
      chosen: chosenIds.length,
      tookMs: Date.now() - started,
    })
  } catch (error) {
    console.error('[v3/wave] échec', error)
    return NextResponse.json({ items: [], level: 3, error: 'indisponible' }, { status: 500 })
  }
}
