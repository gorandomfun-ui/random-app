/**
 * The protections of 18 October, read without the site: the preview's public
 * addresses, the YouTube verdict on age and countries, a game table's places
 * per address.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { PLACES_PER_ADDRESS, placeEntry, type WorldEntry } from '../../lib/games/table'
import { isPublicAddress } from '../../lib/submissions/metadata'
import { youtubeVerdict } from '../../lib/v3/videoAvailability'

test('the link preview reaches the public internet only', () => {
  for (const ip of ['8.8.8.8', '151.101.1.140', '2a00:1450:4007:80e::200e']) assert.equal(isPublicAddress(ip), true, ip)
  for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.3.4', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.1.2.3', 'not-an-ip']) {
    assert.equal(isPublicAddress(ip), false, ip)
  }
})

test("YouTube's verdict: age-restricted is gone for every embed, a country's block is only recorded", () => {
  const ok = { items: [{ status: { embeddable: true, privacyStatus: 'public' } }] }
  assert.deepEqual(youtubeVerdict(ok), { checked: true, available: true })
  assert.deepEqual(youtubeVerdict({ items: [] }), { checked: true, available: false, reason: 'not-found' })
  assert.deepEqual(youtubeVerdict({ items: [{ status: { embeddable: true, privacyStatus: 'public' }, contentDetails: { contentRating: { ytRating: 'ytAgeRestricted' } } }] }), { checked: true, available: false, reason: 'age-restricted' })
  const blocked = { items: [{ status: { embeddable: true, privacyStatus: 'public' }, contentDetails: { regionRestriction: { blocked: ['DE'] } } }] }
  assert.deepEqual(youtubeVerdict(blocked, 'DE'), { checked: true, available: true, regionBlocked: 'DE' })
  assert.deepEqual(youtubeVerdict(blocked, 'FR'), { checked: true, available: true })
  const allowed = { items: [{ status: { embeddable: true, privacyStatus: 'public' }, contentDetails: { regionRestriction: { allowed: ['JP'] } } }] }
  assert.deepEqual(youtubeVerdict(allowed, 'FR'), { checked: true, available: true, regionBlocked: 'FR' })
  assert.deepEqual(youtubeVerdict(allowed, null), { checked: true, available: true })
})

test("a game's table: one address keeps its best few places, the others keep theirs", () => {
  const entry = (runId: string, score: number, who?: string): WorldEntry => ({ runId, name: 'X', score, level: 3, won: false, at: score, ...(who ? { who } : {}) })
  let table: WorldEntry[] = [entry('honest-1', 500, 'a'), entry('honest-2', 400, 'b'), entry('old', 300)]
  for (let run = 0; run < 10; run += 1) table = placeEntry(table, entry(`cheat-${run}`, 1000 + run, 'cheat'))
  assert.equal(table.filter((e) => e.who === 'cheat').length, PLACES_PER_ADDRESS)
  assert.deepEqual(table.filter((e) => e.who === 'cheat').map((e) => e.score), [1009, 1008, 1007])
  assert.ok(['honest-1', 'honest-2', 'old'].every((runId) => table.some((e) => e.runId === runId)), 'the others stay')
  // a run sent again replaces itself
  table = placeEntry(table, entry('honest-2', 450, 'b'))
  assert.equal(table.filter((e) => e.runId === 'honest-2').length, 1)
  assert.equal(table.find((e) => e.runId === 'honest-2')?.score, 450)
})
