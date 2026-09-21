export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

import { getDatabase } from '@/lib/mongodb'
import { composeWave, loadAnchor } from '@/lib/v3/wave/find'
import { normalizeWaveDocument, type WaveDocument } from '@/lib/random/waveEngine'

/**
 * The Wave: three contents linked to the one on screen.
 *
 * No AI at click, no precomputed links — the labels are read live, so a
 * content tagged this morning is already part of its subject's Waves.
 */

type Payload = {
  itemId?: unknown
  excludeKeys?: unknown
  lang?: unknown
}

const LANGS = new Set(['en', 'fr', 'de', 'es', 'jp'])
function parseLang(value: unknown): string {
  const lang = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return LANGS.has(lang) ? lang : 'en'
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
      return NextResponse.json({ items: [], level: 5, reason: 'rien à lier' })
    }

    const { items, spares, level } = await composeWave(db, loaded.anchor, itemId, parseExcludes(body?.excludeKeys), {
      lang: parseLang(body?.lang),
    })
    const chosenIds = items.map((item) => item.id)
    // The spares went through the same rules as the three: the interface may
    // substitute one for a content it cannot show or saw a moment ago.
    const spareIds = spares.map((item) => item.id)

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
      engine: 'narrow-first',
      // Which commit answered: Vercel sets this on every deployment, so what
      // runs in production is never again a matter of guessing.
      build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
      level,
      chosen: chosenIds.length,
      tookMs: Date.now() - started,
    })
  } catch (error) {
    console.error('[v3/wave] échec', error)
    return NextResponse.json({ items: [], level: 3, error: 'indisponible' }, { status: 500 })
  }
}
