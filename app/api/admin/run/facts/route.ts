export const runtime = 'nodejs'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const body = await req.json().catch(()=> ({})) as { n?: number; sites?: string }
  const key = (process.env.ADMIN_INGEST_KEY || '').trim()
  if (!key) return NextResponse.json({ error: 'missing ADMIN_INGEST_KEY' }, { status: 500 })

  const n = Math.max(1, Math.min(500, Number(body.n || 60)))
  const sites = (body.sites || 'useless,numbers,cat,meow,dog')

  const url = new URL('/api/ingest/facts', req.url)
  url.search = new URLSearchParams({ key, n:String(n), sites }).toString()

  try {
    const res = await fetch(url, { cache:'no-store', headers: { 'x-admin-ingest-key': key } })
    const text = await res.text()
    let data: any; try { data = JSON.parse(text) } catch { data = { error: text || 'unknown error' } }
    return NextResponse.json(data, { status: res.status })
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'proxy fetch failed' }, { status: 500 })
  }
}
