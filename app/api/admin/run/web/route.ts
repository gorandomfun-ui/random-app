export const runtime = 'nodejs'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const q = (body?.q || '').toString()
    const per = Number(body?.per || 10)
    const pages = Number(body?.pages || 3)

    const url = new URL(req.url)
    const target = `${url.origin}/api/ingest/web?key=${encodeURIComponent(process.env.ADMIN_INGEST_KEY || '')}&q=${encodeURIComponent(q)}&per=${per}&pages=${pages}`
    const res = await fetch(target, { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'run web failed' }, { status: 500 })
  }
}
