// app/api/ingest/route.ts
import { NextResponse } from 'next/server'
import clientPromise from '../../../lib/db'

const KEY = process.env.ADMIN_INGEST_KEY
const DB_NAME = process.env.MONGO_DB_NAME || 'random'
const COLLECTION = process.env.MONGO_COLLECTION || 'contents'

export async function POST(req: Request) {
  // Sécurité: clé d’admin
  const incoming = req.headers.get('x-admin-key') || ''
  if (!KEY || incoming !== KEY) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  }

  let data: any
  try {
    data = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_JSON' }, { status: 400 })
  }

  if (!Array.isArray(data) || data.length === 0) {
    return NextResponse.json({ ok: false, error: 'EMPTY_PAYLOAD' }, { status: 400 })
  }

  try {
    const client = await clientPromise
    const db = client.db(DB_NAME)
    const col = db.collection(COLLECTION)

    const docs = data.map((d: any) => ({
      type: d.type,
      lang: d.lang ?? 'en',
      text: d.text,
      author: d.author,
      url: d.url,
      thumbUrl: d.thumbUrl,
      width: d.width,
      height: d.height,
      source: d.source,
      tags: d.tags ?? [],
      nsfw: !!d.nsfw,
      createdAt: d.createdAt ? new Date(d.createdAt) : new Date(),
      fetchedAt: d.fetchedAt ? new Date(d.fetchedAt) : null,
    }))

    const res = await col.insertMany(docs)
    return NextResponse.json({ ok: true, insertedCount: res.insertedCount }, { status: 200 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ ok: false, error: 'DB_ERROR' }, { status: 500 })
  }
}
