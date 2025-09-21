export const runtime = 'nodejs'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const body = await req.json().catch(()=> ({})) as { pages?: number; sites?: string }
  const key = (process.env.ADMIN_INGEST_KEY || '').trim()
  if (!key) return NextResponse.json({ error: 'missing ADMIN_INGEST_KEY' }, { status: 500 })

  const pages = Math.max(1, Math.min(20, Number(body.pages || 3)))
  const sites  = (body.sites || 'toscrape,typefit,passiton')

  const url = new URL('/api/ingest/quotes', req.url)
  url.search = new URLSearchParams({ key, pages:String(pages), sites }).toString()

  try {
    const res = await fetch(url, { cache:'no-store', headers: { 'x-admin-ingest-key': key } })
    const text = await res.text()
    let data: any; try { data = JSON.parse(text) } catch { data = { error: text || 'unknown error' } }
    return NextResponse.json(data, { status: res.status })
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'proxy fetch failed' }, { status: 500 })
  }
}
