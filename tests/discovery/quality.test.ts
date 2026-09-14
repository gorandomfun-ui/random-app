import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildProfile, SIGNAL_VERSION } from '../../lib/discovery/profile'
import { candidateFromRow, canonicalMediaKey } from '../../lib/discovery/catalog'
import { composeWave, relation, WaveSession } from '../../lib/discovery/waves'
import { assignEditorial } from '../../lib/discovery/editorial'
import { newSession, planDraw, commitDraw, pickPool, type Intent } from '../../lib/discovery/pool'
import { parseSession } from '../../lib/discovery/sessionCodec'
import { seeded } from '../../lib/discovery/random'
import type { Candidate, SourceMetadata } from '../../lib/discovery/types'

const now = Date.UTC(2026, 8, 13)
const candidate = (key: string, title: string, extra: Partial<Candidate<string>> = {}): Candidate<string> => ({
  key, type: 'video', provider: 'youtube', stock: false, available: true, payload: key,
  profile: buildProfile({ title }), ...extra,
})
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/quality-pairs.json', import.meta.url), 'utf8')) as {
  name: string; provenance: string; anchor: SourceMetadata; neighbor: SourceMetadata; related: boolean
}[]
for (const row of fixtures) test(`semantic regression: ${row.name}`, () => {
  assert.equal(Boolean(relation(buildProfile(row.anchor), buildProfile(row.neighbor))), row.related)
})

test('new ingestion profiles ignore metadata spam and retain real title evidence', () => {
  const clean = buildProfile({ title: 'Psychological Facts About Love and Crushes' })
  const noisy = buildProfile({ title: 'Psychological Facts About Love and Crushes',
    description: 'Facts about relationships.\nTags: football, cooking, gameplay, art, science, music, anime, food, sport, cinema\nfootball cooking gameplay',
    tags: ['football', 'cooking', 'gameplay'] })
  assert.deepEqual(noisy.practices, clean.practices)
  assert.equal(relation(buildProfile({ title: 'UCF vs. #6 Texas Tech football' }), noisy), null)
  assert.ok(buildProfile({ title: 'UCF vs. #6 Texas Tech football' }).titleTokens?.includes('texas'))
})
test('legacy profiles are refreshed for sampled rows without changing the stored document', () => {
  const old = { version: 2, tokens: ['football', 'cooking'], practices: ['football'], entities: [], themes: ['sport'], family: 'sport', evidence: 'described' }
  const row = { _id: 'old', type: 'video', provider: 'youtube', discoveryVersion: 2, discoveryProfile: old,
    sourceMetadata: { title: 'Psychological facts about love', tags: ['football'] } }
  const snapshot = structuredClone(row), result = candidateFromRow(row, 'old', now)
  assert.equal(result.profile.signalVersion, SIGNAL_VERSION)
  assert.deepEqual(result.profile.practices, [])
  assert.deepEqual(row, snapshot)
})
test('unverifiable legacy profiles cannot revive weak editorial or Wave matches', () => {
  const old = { ...buildProfile({ title: 'football championship' }), signalVersion: undefined }
  assert.equal(relation(old, buildProfile({ title: 'football championship' })), null)
  const assigned = assignEditorial([candidate('neighbor', 'football championship')], [{
    ownerId: 'owner', contentKey: 'ref', familyId: 'sport', active: true, type: 'video', version: 2, profile: old,
  }], 'owner')
  assert.deepEqual(assigned.candidates[0].editorialFamilies, [])
})
test('Giphy variants share identity; unknown image variants are preserved; old history still blocks repeats', () => {
  const one = 'https://media0.giphy.com/media/b5Hcaz7EPz26I/giphy.gif?cid=a&rid=giphy.gif'
  const two = 'https://media2.giphy.com/media/b5Hcaz7EPz26I/200w.gif?cid=b'
  const three = 'https://giphy.com/gifs/food-cooking-b5Hcaz7EPz26I'
  const ids = [one, two, three].map(url => canonicalMediaKey({ type: 'image', url }))
  assert.equal(new Set(ids).size, 1)
  assert.equal(canonicalMediaKey({ type: 'image', url: 'https://media.giphy.com/media/v1.public-meta/b5Hcaz7EPz26I/giphy.gif' }), ids[0])
  assert.notEqual(canonicalMediaKey({ type: 'image', url: 'https://example.invalid/image?id=1' }),
    canonicalMediaKey({ type: 'image', url: 'https://example.invalid/image?id=2' }))
  assert.equal(canonicalMediaKey({ type: 'image', url: 'https://media.tenor.com/abcAAAAC/tenor.gif?x=1' }),
    canonicalMediaKey({ type: 'image', url: 'https://media.tenor.com/abcAAAAC/tenor.webp?x=2' }))
  assert.notEqual(canonicalMediaKey({ type: 'image', url: 'https://tenor.com/view/one' }),
    canonicalMediaKey({ type: 'image', url: 'https://tenor.com/view/two' }))
  const state = parseSession({ ...newSession(1), recent: [{ key: `image:${one}`, type: 'image', stock: false, family: 'food' }] })!
  assert.equal(state.recent[0].key, ids[0])
  assert.equal(pickPool([candidate(ids[0], 'cooking', { type: 'image' })], planDraw(state, 'image'), state, seeded(1), now), null)
})
test('trend and owner priorities remain influences; neither makes the other unreachable', () => {
  const state = newSession(1)
  const ticket: Intent = { ...planDraw(state, 'video'), mode: 'cool', branch: 'editorial', lane: 'trend', allowDirectReference: true }
  const old = candidate('old', 'stone carving', { editorialFamilies: ['craft'] })
  const trend = candidate('trend', 'guitar performance', { trendObservedAt: now - 60000 })
  const random = seeded(1)
  const choices = Array.from({ length: 200 }, () => pickPool([old, trend], ticket, state, random, now, { craft: 5 })!)
  assert.ok(choices.some(c => c.item.key === 'trend') && choices.some(c => c.item.key === 'old'))
  assert.ok(choices.filter(c => c.item.key === 'trend').every(c => c.selection?.servedLane === 'trend'))
  assert.ok(choices.filter(c => c.item.key === 'old').every(c => c.selection?.reasons.includes('requested-lane-balanced')))
})
test('recent means a real upload date; absent, future or old dates are not fabricated', () => {
  const state = newSession(1), ticket: Intent = { ...planDraw(state, 'video'), branch: 'autonomous', lane: 'recent' }
  const items = [candidate('missing', 'stone carving'), candidate('future', 'stone carving', { publishedAt: now + 86400000 }),
    candidate('old', 'stone carving', { publishedAt: now - 365 * 86400000 }), candidate('recent', 'stone carving', { publishedAt: now - 86400000 })]
  assert.equal(pickPool(items, ticket, state, seeded(1), now)?.item.key, 'recent')
  const fallback = pickPool(items.slice(0, 3), ticket, state, seeded(1), now)!
  assert.equal(fallback.selection?.servedLane, 'any')
  assert.ok(fallback.fallback)
})
test('clear AI narrative repetition is discouraged but never banned from sparse pools', () => {
  let state = newSession(20)
  const first = candidate('first', 'AI romance story')
  state = commitDraw(state, planDraw(state, 'video'), first)
  const repeat = candidate('repeat', 'AI generated romance story'), other = candidate('other', 'guitar performance')
  const ticket: Intent = { ...planDraw(state, 'video'), branch: 'autonomous', lane: 'described' }
  let repeats = 0
  for (let seed = 0; seed < 1000; seed++) repeats += Number(pickPool([repeat, other], ticket, state, seeded(seed), now)?.item.key === 'repeat')
  assert.ok(repeats > 0 && repeats < 400, `${repeats}/1000 repetitions`)
  assert.equal(pickPool([repeat], ticket, state, seeded(1), now)?.item.key, 'repeat')
})
test('replacements still give exactly three related items and at most two images', () => {
  const anchor = candidate('anchor', 'Stone carving workshop')
  const items = [candidate('v1', 'Stone carving'), candidate('v2', 'Stone carving'),
    ...[1, 2, 3].map(i => candidate(`i${i}`, 'Stone carving', { type: 'image' as const })),
    candidate('bad', 'How do you know why they smile?', { type: 'joke' })]
  const wave = new WaveSession(anchor, items), first = wave.next()!
  wave.displayed(first.key); wave.revokeLast(first.key)
  const shown: Candidate[] = []
  for (let i = 0; i < 3; i++) { const next = wave.next()!; assert.ok(next); shown.push(next); wave.displayed(next.key) }
  assert.ok(shown.filter(x => x.type === 'image').length <= 2)
  assert.ok(shown.every(x => relation(anchor.profile, x.profile)))
  assert.equal(wave.next(), null)
  assert.equal(composeWave(anchor, items.filter(x => x.type !== 'video')).ready, false)
})
