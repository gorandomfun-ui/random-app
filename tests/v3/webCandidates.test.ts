import assert from 'node:assert/strict'
import test from 'node:test'

import { previewObjectName, siteKey, storedForms } from '../../lib/v3/web/candidates'
import { cseDay } from '../../lib/v3/web/cseQuota'
import { WORLD_PLACES, worldWebQueries } from '../../lib/v3/web/worldQueries'

test('the same site however it was written, and every form a stored item may carry', () => {
  assert.equal(siteKey('https://www.Plomberie-Ngando.cm/'), 'plomberie-ngando.cm')
  assert.equal(siteKey('http://plomberie-ngando.cm'), 'plomberie-ngando.cm')
  assert.equal(siteKey('https://lessmilk.com/almost-pong/'), 'lessmilk.com/almost-pong')
  assert.equal(siteKey('ftp://x.cm/'), null)
  const forms = storedForms('https://plomberie-ngando.cm/')
  assert.ok(forms.includes('https://www.plomberie-ngando.cm/'))
  assert.ok(forms.includes('http://plomberie-ngando.cm'))
  assert.equal(previewObjectName('https://www.x.cm/'), previewObjectName('http://x.cm'))
  assert.match(previewObjectName('https://x.cm/'), /^previews\/[0-9a-f]{40}\.jpg$/)
})

test("Google's day starts at midnight in California", () => {
  assert.equal(cseDay(new Date('2026-09-28T06:59:00Z')), '2026-09-27')
  assert.equal(cseDay(new Date('2026-09-28T07:01:00Z')), '2026-09-28')
})

test('the searches go around the world before any place comes back, one in four curious', () => {
  let seed = 1
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  const queries = worldWebQueries(WORLD_PLACES, random)
  assert.equal(queries.length, WORLD_PLACES)
  assert.ok(new Set(queries.map((query) => `${query.gl}:${query.lr ?? ''}`)).size >= WORLD_PLACES - 12, 'places drawn without repeat')
  assert.equal(queries.filter((query) => !query.lr).length, Math.floor(WORLD_PLACES / 4))
  assert.ok(queries.every((query) => query.q.trim().split(' ').length >= 2))
  assert.ok(queries.some((query) => query.gl === 'cm') || worldWebQueries(200, random).some((query) => query.gl === 'cm'))
})
