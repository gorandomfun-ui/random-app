// app/api/ingest/route.ts
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type InsertResult = { insertedId: unknown }

type CollectionLike = {
  insertOne: (doc: Record<string, unknown>) => Promise<InsertResult> | InsertResult
}

type DbLike = {
  collection: (name: string) => Promise<CollectionLike> | CollectionLike
  command?: (payload: Record<string, unknown>) => Promise<unknown> | unknown
  databaseName?: string
}

type DbModule = {
  getDb?: () => Promise<DbLike>
  default?: () => Promise<DbLike>
  connectToDatabase?: () => Promise<DbLike | { db?: DbLike }>
}

function isPromise<T>(value: Promise<T> | T): value is Promise<T> {
  return typeof (value as Promise<T>)?.then === 'function'
}

async function resolveCollection(db: DbLike, name: string): Promise<CollectionLike> {
  if (typeof db.collection !== 'function') {
    throw new Error('Database instance does not expose a collection() method')
  }
  const maybeCollection = db.collection(name)
  return isPromise(maybeCollection) ? await maybeCollection : maybeCollection
}

/** Charge le module db de façon robuste et renvoie une instance de DB. */
async function loadDb(): Promise<DbLike> {
  const mod = (await import('@/lib/db').catch(() => ({}))) as DbModule

  if (typeof mod.getDb === 'function') {
    return await mod.getDb()
  }
  if (typeof mod.default === 'function') {
    return await mod.default()
  }
  if (typeof mod.connectToDatabase === 'function') {
    const res = await mod.connectToDatabase()
    return ('db' in (res ?? {})) && res && typeof res === 'object' ? (res as { db?: DbLike }).db ?? (res as DbLike) : (res as DbLike)
  }

  throw new Error('lib/db must export one of: `getDb()`, `default()`, or `connectToDatabase()`')
}

function isAuthorized(req: Request) {
  // Optionnel: protège avec une clé (query ?key=... ou header x-admin-ingest-key)
  const url = new URL(req.url)
  const key =
    url.searchParams.get('key') || req.headers.get('x-admin-ingest-key') || ''
  const expected = process.env.ADMIN_INGEST_KEY || ''
  return expected ? key === expected : true
}

export async function GET() {
  try {
    let db: DbLike
    try {
      db = await loadDb()
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Missing or invalid MONGO_URI / MONGODB_URI' },
        { status: 500 }
      )
    }
    const pingResult = db.command?.({ ping: 1 })
    if (isPromise(pingResult)) await pingResult
    return NextResponse.json({ ok: true, db: db.databaseName ?? 'unknown' })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    let db: DbLike
    try {
      db = await loadDb()
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Missing or invalid MONGO_URI / MONGODB_URI' },
        { status: 500 }
      )
    }

    const rawBody = await req.json().catch(() => ({} as unknown))
    const body = typeof rawBody === 'object' && rawBody !== null ? (rawBody as Record<string, unknown>) : {}

    const doc = {
      ...body,
      _ingestedAt: new Date(),
      _source: 'api/ingest',
    }

    const coll = await resolveCollection(db, 'ingest')
    const inserted = await coll.insertOne(doc)

    return NextResponse.json({ ok: true, id: inserted.insertedId })
  } catch (error: unknown) {
    console.error('INGEST error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
