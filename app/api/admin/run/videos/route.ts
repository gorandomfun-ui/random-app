export const runtime = 'nodejs'
import { NextResponse } from 'next/server'

type VideosRunRequest = {
  mode?: string
  q?: string
  per?: number | string
  pages?: number | string
  days?: number | string
  playlistId?: string
  channelId?: string
  reddit?: string | boolean
  sub?: string
  limit?: number | string
}

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

const toStringValue = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

export async function POST(req: Request) {
  const rawBody = await req.json().catch(() => ({} as unknown))
  const body: VideosRunRequest = typeof rawBody === 'object' && rawBody !== null
    ? (rawBody as VideosRunRequest)
    : {}
  const key = (process.env.ADMIN_INGEST_KEY || '').trim()
  if (!key) return NextResponse.json({ error: 'missing ADMIN_INGEST_KEY' }, { status: 500 })

  const params = new URLSearchParams()
  params.set('key', key)
  const mode = toStringValue(body.mode)
  if (mode) params.set('mode', mode)

  const query = toStringValue(body.q)
  if (query) params.set('q', query)

  const per = toNumber(body.per)
  if (per !== null) params.set('per', String(Math.max(1, Math.min(50, per))))

  const pages = toNumber(body.pages)
  if (pages !== null) params.set('pages', String(Math.max(1, Math.min(5, pages))))

  const days = toNumber(body.days)
  if (days !== null) params.set('days', String(Math.max(1, Math.min(365, days))))

  const playlistId = toStringValue(body.playlistId)
  if (playlistId) params.set('playlistId', playlistId)

  const channelId = toStringValue(body.channelId)
  if (channelId) params.set('channelId', channelId)

  if (typeof body.reddit === 'string') {
    params.set('reddit', body.reddit)
  } else if (typeof body.reddit === 'boolean') {
    params.set('reddit', body.reddit ? '1' : '0')
  }

  const sub = toStringValue(body.sub)
  if (sub) params.set('sub', sub)

  const limit = toNumber(body.limit)
  if (limit !== null) params.set('limit', String(Math.max(5, Math.min(100, limit))))

  const url = new URL('/api/ingest/videos', req.url)
  url.search = params.toString()

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
