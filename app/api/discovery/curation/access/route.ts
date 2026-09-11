import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { bodyOf } from '@/lib/discovery/handlers'
import { CURATOR_COOKIE, CURATOR_TTL, createCuratorToken, curatorConfigured, curatorRateKey, matchesCuratorSecret, sameOrigin } from '@/lib/discovery/curatorAuth'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const failure = (status: number) => NextResponse.json({ error: 'Access unavailable' }, { status })
export async function POST(req: Request) {
  if (!sameOrigin(req)) return failure(403)
  if (!curatorConfigured()) return failure(503)
  try {
    const db = await getDb(), now = Date.now()
    const _id = curatorRateKey(req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local', Math.floor(now / 900000))
    const attempt = await db.collection<{ _id: string; count: number; expires: Date }>('discovery_access_attempts_v2').findOneAndUpdate(
      { _id }, { $inc: { count: 1 }, $setOnInsert: { expires: new Date(now + 900000) } }, { upsert: true, returnDocument: 'after', maxTimeMS: 1000 })
    if (!attempt || attempt.count > 10) return failure(429)
    const body = await bodyOf(req)
    if (!matchesCuratorSecret(body?.secret)) return failure(401)
    const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
    response.cookies.set(CURATOR_COOKIE, createCuratorToken(), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: CURATOR_TTL })
    return response
  } catch { return failure(503) }
}
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return failure(403)
  const response = NextResponse.json({ ok: true })
  response.cookies.set(CURATOR_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 0 })
  return response
}
