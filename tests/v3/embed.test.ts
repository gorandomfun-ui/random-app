import test from 'node:test'
import assert from 'node:assert/strict'

import { checkEmbeddable, embedVerdict, frameAncestorsAllow } from '@/lib/v3/web/embed'

const headers = (entries: Record<string, string>) => ({ get: (name: string) => entries[name.toLowerCase()] ?? null })
const page = (extra: Record<string, string> = {}, url = 'https://example.org/page') => ({ status: 200, headers: headers({ 'content-type': 'text/html; charset=utf-8', ...extra }), url })

test('les en-têtes enregistrés → verdict', () => {
  assert.deepEqual(embedVerdict(page()), { embeddable: true, url: 'https://example.org/page' })
  assert.equal(embedVerdict(page({ 'x-frame-options': 'DENY' })).embeddable, false)
  assert.equal((embedVerdict(page({ 'x-frame-options': 'SAMEORIGIN' })) as { reason: string }).reason, 'x-frame-options')
  assert.equal((embedVerdict(page({ 'content-security-policy': "default-src 'self'; frame-ancestors 'self'" })) as { reason: string }).reason, 'frame-ancestors')
  assert.equal(embedVerdict(page({ 'content-security-policy': "frame-ancestors *" })).embeddable, true)
  assert.equal(embedVerdict(page({ 'content-security-policy': "frame-ancestors 'self' https://www.gorandom.fun" })).embeddable, true, 'Random est nommé')
  assert.equal(embedVerdict(page({ 'content-security-policy': "frame-ancestors 'none'" })).embeddable, false)
  assert.equal(embedVerdict(page({ 'content-security-policy': "default-src 'self'" })).embeddable, true, 'une CSP sans frame-ancestors ne bloque pas le cadre')
  assert.equal(embedVerdict(page({ 'content-security-policy-report-only': "frame-ancestors 'none'" })).embeddable, true, 'report-only ne bloque rien')
  assert.equal((embedVerdict(page({}, 'http://example.org/page')) as { reason: string }).reason, 'http-only')
  assert.equal((embedVerdict(page({ 'content-type': 'application/pdf' })) as { reason: string }).reason, 'not-html')
  assert.equal((embedVerdict(page({ 'content-type': 'image/png' })) as { reason: string }).reason, 'not-html')
  assert.equal((embedVerdict({ status: 403, headers: headers({}), url: 'https://example.org' }) as { reason: string }).reason, 'not-ok')
  assert.equal(frameAncestorsAllow("frame-ancestors *.gorandom.fun"), true)
  assert.equal(frameAncestorsAllow("frame-ancestors https://other.example"), false)
})

test('un site en http seul est refusé ; son jumeau https, quand il répond, est gardé à sa place', async () => {
  const answers: Record<string, { status: number; headers: Record<string, string> }> = {
    'http://old.example/': { status: 200, headers: { 'content-type': 'text/html' } },
    'https://old.example/': { status: 200, headers: { 'content-type': 'text/html' } },
    'http://only.example/': { status: 200, headers: { 'content-type': 'text/html' } },
  }
  const request = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const answer = answers[url]
    if (!answer) throw new Error('unreachable')
    return { status: answer.status, url, headers: headers(answer.headers), body: null } as unknown as Response
  }) as typeof fetch
  assert.deepEqual(await checkEmbeddable('http://old.example/', { request }), { embeddable: true, url: 'https://old.example/' })
  assert.deepEqual(await checkEmbeddable('http://only.example/', { request }), { embeddable: false, reason: 'http-only', url: 'http://only.example/' })
  assert.deepEqual(await checkEmbeddable('https://down.example/', { request }), { embeddable: false, reason: 'request-failed' })
})
