export const runtime = 'nodejs'

import { NextResponse } from 'next/server'

import {
  EFFECTS_TEST_COOKIE,
  EFFECTS_TEST_COOKIE_MAX_AGE,
  getEffectsTestAccessToken,
  isEffectsTestConfigured,
  matchesEffectsTestPassword,
} from '@/lib/effectsTestAccess'
import { checkRateLimit } from '@/lib/utils/rate-limit'

export async function POST(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  if (!checkRateLimit(`effects-test-access:${forwardedFor}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many attempts' }, { status: 429 })
  }
  if (!isEffectsTestConfigured()) {
    return NextResponse.json({ error: 'Test access is not configured' }, { status: 503 })
  }

  const body = await request.json().catch(() => null) as { password?: unknown } | null
  if (!matchesEffectsTestPassword(body?.password)) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const token = getEffectsTestAccessToken()
  if (!token) {
    return NextResponse.json({ error: 'Test access is not configured' }, { status: 503 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set({
    name: EFFECTS_TEST_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: EFFECTS_TEST_COOKIE_MAX_AGE,
    path: '/random/effects-test',
  })
  return response
}
