export const runtime = 'nodejs'
import { NextResponse } from 'next/server'

type FactsRunRequest = { n?: number; sites?: string }

export async function POST(req: Request) {
  const rawBody = await req.json().catch(() => ({} as unknown))
  const body: FactsRunRequest = typeof rawBody === 'object' && rawBody !== null
    ? (rawBody as FactsRunRequest)
    : {}
  const key = (process.env.ADMIN_INGEST_KEY || '').trim()
  if (!key) return NextResponse.json({ error: 'missing ADMIN_INGEST_KEY' }, { status: 500 })

  const n = Math.max(1, Math.min(500, Number(body.n || 60)))
  const sites = (body.sites || 'useless,numbers,cat,meow,dog')

  const url = new URL('/api/ingest/facts', req.url)
  url.search = new URLSearchParams({ key, n:String(n), sites }).toString()

  try {
    const res = await fetch(url, { cache:'no-store', headers: { 'x-admin-ingest-key': key } })
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
    const message = error instanceof Error ? error.message : 'proxy fetch failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
