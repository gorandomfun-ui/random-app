export const runtime = 'nodejs'
import { NextResponse } from 'next/server'
import { adminAuthHeaders, adminUnauthorizedBody, isAdminRequest } from '@/lib/auth/adminAuth'

type QuotesRunRequest = { pages?: number; sites?: string }

export async function POST(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json(adminUnauthorizedBody(), { status: 401 })
  }

  const rawBody = await req.json().catch(() => ({} as unknown))
  const body: QuotesRunRequest = typeof rawBody === 'object' && rawBody !== null ? (rawBody as QuotesRunRequest) : {}
  const key = (process.env.ADMIN_INGEST_KEY || '').trim()
  if (!key) return NextResponse.json({ error: 'missing ADMIN_INGEST_KEY' }, { status: 500 })

  const pages = Math.max(1, Math.min(20, Number(body.pages || 3)))
  const sites  = (body.sites || 'toscrape,typefit,passiton')

  const url = new URL('/api/ingest/quotes', req.url)
  url.search = new URLSearchParams({ pages:String(pages), sites }).toString()

  try {
    const res = await fetch(url, { cache:'no-store', headers: adminAuthHeaders() })
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
