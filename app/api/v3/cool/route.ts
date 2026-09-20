export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

import { getDatabase } from '@/lib/mongodb'
import { composeCoolThread } from '@/lib/v3/cool/thread'
import { normalizeWaveDocument, type WaveDocument } from '@/lib/random/waveEngine'

/**
 * The cool pool: a thread of three — a content drawn live from the registers
 * or around a like, and two of its Wave neighbours, one proven content and
 * two discoveries among the three.
 */

type Payload = {
  excludeKeys?: unknown
}

function parseExcludes(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string').slice(0, 300)
}

async function thread(excludeKeys: string[]) {
  const started = Date.now()
  try {
    const db = await getDatabase()
    const composed = await composeCoolThread(db, { excludeKeys })
    if (!composed) {
      return NextResponse.json({ items: [], reason: 'rien à tirer' })
    }

    // The thread decides on labels alone; the interface needs something it can
    // show, so the full documents are read once the choice is made.
    const order = [composed.start.id, ...composed.neighbours.map((item) => item.id)]
    const docs = (await db
      .collection('items')
      .find({ _id: { $in: order.map((id) => new ObjectId(id)) } })
      .toArray()) as unknown as WaveDocument[]
    const byId = new Map(docs.map((doc) => [String(doc._id), doc]))
    const items = order
      .map((id) => byId.get(id))
      .map((doc) => (doc ? normalizeWaveDocument(doc) : null))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))

    return NextResponse.json({
      items,
      engine: 'cool-thread',
      build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
      start: { id: composed.start.id, source: composed.start.source, popularity: composed.start.popularity },
      neighbours: composed.neighbours.map((item) => ({
        id: item.id, type: item.type, level: item.level, popularity: item.v3.popularity,
      })),
      dose: { wanted: composed.wanted, dosed: composed.dosed },
      level: composed.start.level,
      attempts: composed.attempts,
      tookMs: Date.now() - started,
    })
  } catch (error) {
    console.error('[v3/cool] échec', error)
    return NextResponse.json({ items: [], error: 'indisponible' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Payload | null
  return thread(parseExcludes(body?.excludeKeys))
}

/** A thread with no memory, for a look in the browser. */
export async function GET() {
  return thread([])
}
