import test, { before } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Every route under /api/ingest, /api/cron, /api/tools and /api/admin must
 * refuse a request that carries no valid header, and must never echo key
 * material back to the caller.
 *
 * Only the refusal path is exercised here: it returns before any side effect,
 * so no quota is spent and nothing is written. The accepted path is covered
 * on `ingest/keywords/combo`, the one protected route that neither calls a
 * provider nor touches the database.
 */

const ADMIN_KEY = 'route-auth-test-key-0123456789'

process.env.ADMIN_INGEST_KEY = ADMIN_KEY
delete process.env.CRON_SECRET

// Several route modules open a Mongo client at import time. The refusal path
// never queries it, so the tests point the driver at an address nobody serves
// rather than at any real database, and give up on it quickly.
process.env.MONGO_URI = 'mongodb://127.0.0.1:1/random_route_auth_tests?serverSelectionTimeoutMS=50&connectTimeoutMS=50'
process.env.MONGODB_URI = process.env.MONGO_URI
process.env.MONGODB_DB = 'random_route_auth_tests'

// `lib/db` calls connect() as it loads; claim its rejection before any route
// module pulls it in, so failing to reach that address stays background noise
// instead of an unhandled rejection attributed to a passing test.
before(async () => {
  const mongoModule = (await import('@/lib/db')) as { default: Promise<unknown> }
  void mongoModule.default.catch(() => undefined)
})

type Method = 'GET' | 'POST' | 'DELETE'

type ProtectedRoute = {
  path: string
  module: string
  methods: Method[]
}

const PROTECTED_ROUTES: ProtectedRoute[] = [
  { path: '/api/ingest', module: '@/app/api/ingest/route', methods: ['GET', 'POST'] },
  { path: '/api/ingest/daily-auto', module: '@/app/api/ingest/daily-auto/route', methods: ['GET'] },
  { path: '/api/ingest/daily-auto/report', module: '@/app/api/ingest/daily-auto/report/route', methods: ['POST'] },
  { path: '/api/ingest/facts', module: '@/app/api/ingest/facts/route', methods: ['GET'] },
  { path: '/api/ingest/images', module: '@/app/api/ingest/images/route', methods: ['GET'] },
  { path: '/api/ingest/jokes', module: '@/app/api/ingest/jokes/route', methods: ['GET'] },
  { path: '/api/ingest/keywords/combo', module: '@/app/api/ingest/keywords/combo/route', methods: ['GET'] },
  { path: '/api/ingest/quotes', module: '@/app/api/ingest/quotes/route', methods: ['GET'] },
  { path: '/api/ingest/reddit', module: '@/app/api/ingest/reddit/route', methods: ['GET'] },
  { path: '/api/ingest/text-sources', module: '@/app/api/ingest/text-sources/route', methods: ['GET'] },
  { path: '/api/ingest/video-feeds', module: '@/app/api/ingest/video-feeds/route', methods: ['GET'] },
  { path: '/api/ingest/videos', module: '@/app/api/ingest/videos/route', methods: ['GET'] },
  { path: '/api/ingest/videos/retro', module: '@/app/api/ingest/videos/retro/route', methods: ['GET'] },
  { path: '/api/ingest/videos/trending', module: '@/app/api/ingest/videos/trending/route', methods: ['GET'] },
  { path: '/api/ingest/web', module: '@/app/api/ingest/web/route', methods: ['GET'] },
  { path: '/api/ingest/websearch', module: '@/app/api/ingest/websearch/route', methods: ['GET'] },
  { path: '/api/ingest/youtube', module: '@/app/api/ingest/youtube/route', methods: ['GET'] },
  { path: '/api/cron/daily-report', module: '@/app/api/cron/daily-report/route', methods: ['GET'] },
  { path: '/api/cron/images', module: '@/app/api/cron/images/route', methods: ['GET'] },
  { path: '/api/cron/videos', module: '@/app/api/cron/videos/route', methods: ['GET'] },
  { path: '/api/cron/wave-profiles', module: '@/app/api/cron/wave-profiles/route', methods: ['GET'] },
  { path: '/api/cron/web', module: '@/app/api/cron/web/route', methods: ['GET'] },
  { path: '/api/tools/images/obsolete', module: '@/app/api/tools/images/obsolete/route', methods: ['GET', 'DELETE'] },
  { path: '/api/tools/jokes/purge', module: '@/app/api/tools/jokes/purge/route', methods: ['POST'] },
  { path: '/api/tools/videos/obsolete', module: '@/app/api/tools/videos/obsolete/route', methods: ['GET', 'POST', 'DELETE'] },
  { path: '/api/admin/cache-stats', module: '@/app/api/admin/cache-stats/route', methods: ['GET'] },
  { path: '/api/admin/cron/status', module: '@/app/api/admin/cron/status/route', methods: ['GET'] },
  { path: '/api/admin/db-stats', module: '@/app/api/admin/db-stats/route', methods: ['GET'] },
  { path: '/api/admin/import/ai', module: '@/app/api/admin/import/ai/route', methods: ['POST'] },
  { path: '/api/admin/run/facts', module: '@/app/api/admin/run/facts/route', methods: ['POST'] },
  { path: '/api/admin/run/quotes', module: '@/app/api/admin/run/quotes/route', methods: ['POST'] },
  { path: '/api/admin/run/videos', module: '@/app/api/admin/run/videos/route', methods: ['POST'] },
  { path: '/api/admin/run/web', module: '@/app/api/admin/run/web/route', methods: ['POST'] },
]

/** Each of these must be refused; the label names the bypass being tried. */
const REFUSED_ATTEMPTS: Array<{ label: string; query?: string; headers?: Record<string, string> }> = [
  { label: 'no credential at all' },
  { label: 'key as a URL parameter', query: `key=${encodeURIComponent(ADMIN_KEY)}` },
  { label: 'x-vercel-cron header', headers: { 'x-vercel-cron': '1' } },
  { label: 'vercel-cron user agent', headers: { 'user-agent': 'vercel-cron/1.0' } },
  { label: 'wrong header value', headers: { 'x-admin-ingest-key': 'not-the-key' } },
  { label: 'bearer token while CRON_SECRET is unset', headers: { authorization: `Bearer ${ADMIN_KEY}` } },
]

function readFileSyncUtf8(file: string): string {
  return readFileSync(file, 'utf8')
}

function buildRequest(route: ProtectedRoute, method: Method, attempt: { query?: string; headers?: Record<string, string> }) {
  const url = `https://example.test${route.path}${attempt.query ? `?${attempt.query}` : ''}`
  const init: RequestInit = { method, headers: attempt.headers ?? {} }
  if (method === 'POST' || method === 'DELETE') {
    init.body = JSON.stringify({})
    init.headers = { ...(attempt.headers ?? {}), 'content-type': 'application/json' }
  }
  return new Request(url, init)
}

async function callHandler(route: ProtectedRoute, method: Method, request: Request): Promise<Response> {
  const loaded = (await import(route.module)) as Record<string, (req: Request) => Promise<Response>>
  const handler = loaded[method]
  assert.equal(typeof handler, 'function', `${route.path} must export ${method}`)
  return handler(request)
}

for (const route of PROTECTED_ROUTES) {
  for (const method of route.methods) {
    test(`${method} ${route.path} refuses every bypass and leaks no key`, async () => {
      for (const attempt of REFUSED_ATTEMPTS) {
        const request = buildRequest(route, method, attempt)
        const response = await callHandler(route, method, request)
        assert.equal(
          response.status,
          401,
          `${method} ${route.path} accepted a request with ${attempt.label}`,
        )
        const body = await response.text()
        assert.ok(
          !body.includes(ADMIN_KEY),
          `${method} ${route.path} echoed the admin key in its ${attempt.label} response`,
        )
        for (const forbidden of ['expectedKey', 'expectedPreview', 'providedPreview', 'expectedLength', 'providedLength']) {
          assert.ok(
            !body.includes(forbidden),
            `${method} ${route.path} disclosed "${forbidden}" in its ${attempt.label} response`,
          )
        }
      }
    })
  }
}

test('a correct x-admin-ingest-key header passes the gate', async () => {
  const route = PROTECTED_ROUTES.find((entry) => entry.path === '/api/ingest/keywords/combo')!
  const request = new Request(`https://example.test${route.path}`, {
    headers: { 'x-admin-ingest-key': ADMIN_KEY },
  })
  const response = await callHandler(route, 'GET', request)
  assert.equal(response.status, 200)
  const body = (await response.json()) as Record<string, unknown>
  assert.ok(Object.keys(body).length > 0, 'the route must return its payload once authenticated')
  assert.ok(!JSON.stringify(body).includes(ADMIN_KEY), 'a successful response must not carry the key either')
})

test('a correct bearer cron secret passes the gate once CRON_SECRET is set', async () => {
  const cronSecret = 'route-auth-test-cron-secret-42'
  process.env.CRON_SECRET = cronSecret
  try {
    const route = PROTECTED_ROUTES.find((entry) => entry.path === '/api/ingest/keywords/combo')!
    const request = new Request(`https://example.test${route.path}`, {
      headers: { authorization: `Bearer ${cronSecret}` },
    })
    const response = await callHandler(route, 'GET', request)
    assert.equal(response.status, 200)
  } finally {
    delete process.env.CRON_SECRET
  }
})

test('every handler in the protected areas is covered by this file', () => {
  const root = path.resolve(import.meta.dirname, '../..')
  const areas = ['app/api/ingest', 'app/api/cron', 'app/api/tools', 'app/api/admin']
  const handlerPattern = /export async function (GET|POST|PUT|PATCH|DELETE)\b/g

  const covered = new Set(
    PROTECTED_ROUTES.flatMap((route) => route.methods.map((method) => `${method} ${route.module}`)),
  )
  const missing: string[] = []

  for (const area of areas) {
    const areaRoot = path.join(root, area)
    for (const entry of readdirSync(areaRoot, { recursive: true, withFileTypes: true })) {
      if (entry.name !== 'route.ts') continue
      const absolute = path.join(entry.parentPath ?? entry.path, entry.name)
      const specifier = `@/${path.relative(root, absolute).replace(/\.ts$/, '')}`
      const source = readFileSyncUtf8(absolute)
      for (const match of source.matchAll(handlerPattern)) {
        const key = `${match[1]} ${specifier}`
        if (!covered.has(key)) missing.push(key)
      }
    }
  }

  assert.deepEqual(
    missing,
    [],
    'these handlers sit in a protected area but no test checks that they refuse anonymous callers',
  )
})
