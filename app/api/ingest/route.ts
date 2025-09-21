// app/api/ingest/route.ts
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Charge le module db de façon robuste et renvoie une instance de DB. */
async function loadDb() {
  // ⬇️ adapte ce chemin si ton db.ts n'est pas dans /lib
  const mod: any = await import('@/lib/db').catch(() => ({}))

  if (typeof mod.getDb === 'function') {
    return await mod.getDb()
  }
  if (typeof mod.default === 'function') {
    // default export = fonction qui renvoie la DB
    return await mod.default()
  }
  if (typeof mod.connectToDatabase === 'function') {
    const res = await mod.connectToDatabase()
    // support both { db } or a db directly
    return res?.db ?? res
  }

  throw new Error(
    "lib/db must export one of: `getDb()`, `default()`, or `connectToDatabase()`"
  )
}

function isAuthorized(req: Request) {
  // Optionnel: protège avec une clé (query ?key=... ou header x-admin-ingest-key)
  const url = new URL(req.url)
  const key =
    url.searchParams.get('key') || req.headers.get('x-admin-ingest-key') || ''
  const expected = process.env.ADMIN_INGEST_KEY || ''
  return expected ? key === expected : true
}

export async function GET(req: Request) {
  try {
    let db
    try {
      db = await loadDb()
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Missing or invalid MONGO_URI / MONGODB_URI' },
        { status: 500 }
      )
    }
    await db.command?.({ ping: 1 }) // no-op si pas supporté
    return NextResponse.json({ ok: true, db: db.databaseName ?? 'unknown' })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    let db
    try {
      db = await loadDb()
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Missing or invalid MONGO_URI / MONGODB_URI' },
        { status: 500 }
      )
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, any>

    const doc = {
      ...body,
      _ingestedAt: new Date(),
      _source: 'api/ingest',
    }

    const coll = db.collection?.('ingest') ?? (await db.collection('ingest')) // compat légère
    const res = await coll.insertOne(doc)

    return NextResponse.json({ ok: true, id: res.insertedId })
  } catch (e: any) {
    console.error('INGEST error:', e)
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
