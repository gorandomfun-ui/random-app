export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { logCronRun } from '@/lib/metrics/cron'

const CHILD_CRONS = [
  { name: 'cron:videos', path: '/api/cron/videos' },
  { name: 'cron:web', path: '/api/cron/web' },
]

function resolveBaseUrl() {
  const fromEnv = [
    process.env.CRON_SELF_BASE_URL,
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
  ].find((value) => typeof value === 'string' && value.trim().length > 0)
  return fromEnv?.trim().replace(/\/$/, '') || 'http://localhost:3000'
}

type ChildCronResult = {
  name: string
  path: string
  ok: boolean
  status: number
  body: unknown
  error?: string
}

async function invokeChild(path: string): Promise<ChildCronResult> {
  const baseUrl = resolveBaseUrl()
  const url = new URL(path, `${baseUrl}/`)
  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-cron-parent': 'cron:nightly',
      },
      cache: 'no-store',
    })

    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      body = await res.text()
    }

    const bodyIndicatesFailure = typeof body === 'object' && body !== null && 'ok' in body && (body as { ok?: unknown }).ok === false
    const ok = res.ok && !bodyIndicatesFailure
    return { name: path, path: url.pathname, ok, status: res.status, body }
  } catch (error: unknown) {
    return {
      name: path,
      path: new URL(path, 'http://localhost').pathname,
      ok: false,
      status: 0,
      body: null,
      error: error instanceof Error ? error.message : 'fetch failed',
    }
  }
}

export async function GET(req: Request) {
  const startedAt = new Date()
  const triggeredBy = req.headers.get('x-vercel-cron') ? 'cron' : 'manual'

  try {
    const results: ChildCronResult[] = []
    for (const child of CHILD_CRONS) {
      const result = await invokeChild(child.path)
      results.push({ ...result, name: child.name })
    }

    const finishedAt = new Date()
    const success = results.length === CHILD_CRONS.length && results.every((r) => r.ok)

    await logCronRun({
      name: 'cron:nightly',
      status: success ? 'success' : 'failure',
      startedAt,
      finishedAt,
      triggeredBy,
      details: {
        children: results.map((r) => ({
          name: r.name,
          status: r.status,
          ok: r.ok,
          error: r.error,
          body: typeof r.body === 'object' ? r.body : r.body ?? null,
        })),
      },
      error: success ? undefined : results.find((r) => !r.ok)?.error || 'child cron failed',
    })

    return NextResponse.json({
      ok: success,
      triggeredAt: finishedAt.toISOString(),
      results,
    }, { status: success ? 200 : 500 })
  } catch (error: unknown) {
    const finishedAt = new Date()
    await logCronRun({
      name: 'cron:nightly',
      status: 'failure',
      startedAt,
      finishedAt,
      triggeredBy,
      error: error instanceof Error ? error.message : 'nightly cron failed',
    })
    const message = error instanceof Error ? error.message : 'nightly cron failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
