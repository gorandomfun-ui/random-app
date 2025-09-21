export const runtime = 'nodejs'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const body = await req.json().catch(()=> ({})) as Record<string, any>
  const key = (process.env.ADMIN_INGEST_KEY || '').trim()
  if (!key) return NextResponse.json({ error: 'missing ADMIN_INGEST_KEY' }, { status: 500 })

  const params = new URLSearchParams()
  params.set('key', key)
  if (body.mode)      params.set('mode', String(body.mode))
  if (body.q)         params.set('q', String(body.q))
  if (body.per)       params.set('per', String(Math.max(1, Math.min(50, Number(body.per)))))
  if (body.pages)     params.set('pages', String(Math.max(1, Math.min(5, Number(body.pages)))))
  if (body.days)      params.set('days', String(Math.max(1, Math.min(365, Number(body.days)))))
  if (body.playlistId)params.set('playlistId', String(body.playlistId))
  if (body.channelId) params.set('channelId', String(body.channelId))
  if (body.reddit)    params.set('reddit', String(body.reddit))
  if (body.sub)       params.set('sub', String(body.sub))
  if (body.limit)     params.set('limit', String(Math.max(5, Math.min(100, Number(body.limit)))))

  const url = new URL('/api/ingest/videos', req.url)
  url.search = params.toString()

  try {
    const res = await fetch(url, { cache:'no-store', headers: { 'x-admin-ingest-key': key } })
    const text = await res.text()
    let data: any; try { data = JSON.parse(text) } catch { data = { error: text || 'unknown error' } }
    return NextResponse.json(data, { status: res.status })
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'proxy fetch failed' }, { status: 500 })
  }
}
