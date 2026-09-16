import test from 'node:test'
import assert from 'node:assert/strict'

import { adminRequestKind, isAdminRequest } from '@/lib/auth/adminAuth'

const ADMIN_KEY = 'admin-key-for-tests-0123456789'
const CRON_SECRET = 'cron-secret-for-tests-9876543210'

function request(init: { headers?: Record<string, string>; url?: string } = {}): Request {
  return new Request(init.url ?? 'https://example.test/api/ingest/videos', {
    headers: init.headers ?? {},
  })
}

function withEnv(env: Record<string, string | undefined>, run: () => void): void {
  const previous: Record<string, string | undefined> = {}
  for (const [name, value] of Object.entries(env)) {
    previous[name] = process.env[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  try {
    run()
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

test('refuses everything when ADMIN_INGEST_KEY is empty', () => {
  withEnv({ ADMIN_INGEST_KEY: '', CRON_SECRET }, () => {
    assert.equal(isAdminRequest(request()), false)
    assert.equal(isAdminRequest(request({ headers: { 'x-admin-ingest-key': '' } })), false)
    assert.equal(
      isAdminRequest(request({ headers: { authorization: `Bearer ${CRON_SECRET}` } })),
      false,
      'the cron secret alone must not open an installation with no admin key',
    )
  })
})

test('accepts the admin key only in the x-admin-ingest-key header', () => {
  withEnv({ ADMIN_INGEST_KEY: ADMIN_KEY, CRON_SECRET: undefined }, () => {
    assert.equal(isAdminRequest(request({ headers: { 'x-admin-ingest-key': ADMIN_KEY } })), true)
    assert.equal(adminRequestKind(request({ headers: { 'x-admin-ingest-key': ADMIN_KEY } })), 'admin-key')
    assert.equal(isAdminRequest(request({ headers: { 'x-admin-ingest-key': `${ADMIN_KEY} ` } })), true)
    assert.equal(isAdminRequest(request({ headers: { 'x-admin-ingest-key': 'wrong' } })), false)
    assert.equal(
      isAdminRequest(request({ headers: { 'x-admin-ingest-key': `${ADMIN_KEY}x` } })),
      false,
      'a longer key must not be accepted by a prefix comparison',
    )
  })
})

test('refuses the key passed as a URL parameter', () => {
  withEnv({ ADMIN_INGEST_KEY: ADMIN_KEY, CRON_SECRET: undefined }, () => {
    const url = `https://example.test/api/ingest/videos?key=${encodeURIComponent(ADMIN_KEY)}`
    assert.equal(isAdminRequest(request({ url })), false)
  })
})

test('never trusts x-vercel-cron or the user agent', () => {
  withEnv({ ADMIN_INGEST_KEY: ADMIN_KEY, CRON_SECRET: undefined }, () => {
    assert.equal(isAdminRequest(request({ headers: { 'x-vercel-cron': '1' } })), false)
    assert.equal(isAdminRequest(request({ headers: { 'user-agent': 'vercel-cron/1.0' } })), false)
    assert.equal(
      isAdminRequest(request({ headers: { 'x-vercel-cron': '1', 'x-admin-ingest-key': 'wrong' } })),
      false,
    )
  })
})

test('accepts the cron secret as a bearer token when both secrets are set', () => {
  withEnv({ ADMIN_INGEST_KEY: ADMIN_KEY, CRON_SECRET }, () => {
    assert.equal(adminRequestKind(request({ headers: { authorization: `Bearer ${CRON_SECRET}` } })), 'cron-secret')
    assert.equal(adminRequestKind(request({ headers: { authorization: `bearer ${CRON_SECRET}` } })), 'cron-secret')
    assert.equal(isAdminRequest(request({ headers: { authorization: `Bearer wrong` } })), false)
    assert.equal(isAdminRequest(request({ headers: { authorization: CRON_SECRET } })), false)
  })
})

test('an admin key that equals the cron secret is still recognised as the admin key', () => {
  withEnv({ ADMIN_INGEST_KEY: ADMIN_KEY, CRON_SECRET: ADMIN_KEY }, () => {
    assert.equal(adminRequestKind(request({ headers: { 'x-admin-ingest-key': ADMIN_KEY } })), 'admin-key')
  })
})
