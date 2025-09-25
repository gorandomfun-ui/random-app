export const runtime = 'nodejs'
import { NextResponse } from 'next/server'

type WebRunRequest = { q?: string; per?: number | string; pages?: number | string }

export async function POST(req: Request) {
  try {
    const key = (process.env.ADMIN_INGEST_KEY || '').trim()
    if (!key) return NextResponse.json({ error: 'missing ADMIN_INGEST_KEY' }, { status: 500 })

    const rawBody = await req.json().catch(() => ({} as unknown))
    const body: WebRunRequest = typeof rawBody === 'object' && rawBody !== null ? (rawBody as WebRunRequest) : {}

    const q = typeof body.q === 'string' ? body.q : ''
    const perRaw = typeof body.per === 'number' ? body.per : typeof body.per === 'string' ? Number(body.per) : NaN
    const per = Number.isFinite(perRaw) ? Math.max(1, Math.min(10, perRaw)) : 10
    const pagesRaw = typeof body.pages === 'number' ? body.pages : typeof body.pages === 'string' ? Number(body.pages) : NaN
    const pages = Number.isFinite(pagesRaw) ? Math.max(1, Math.min(10, pagesRaw)) : 3

    const url = new URL('/api/ingest/web', req.url)
    url.search = new URLSearchParams({
      key,
      q,
      per: String(per),
      pages: String(pages),
    }).toString()

    const res = await fetch(url, { cache: 'no-store', headers: { 'x-admin-ingest-key': key } })
    const text = await res.text()
    let payload: unknown
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { error: text || 'unknown error' }
    }
    const responseBody = typeof payload === 'object' && payload !== null ? payload : { data: payload }
    return NextResponse.json(responseBody, { status: res.status })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'run web failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
