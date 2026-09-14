import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildProfile } from '../../lib/discovery/profile'
import { composeWave, relation, WaveSession } from '../../lib/discovery/waves'
import { candidateFromRow } from '../../lib/discovery/catalog'
import { pickPool, planDraw, commitDraw, newSession } from '../../lib/discovery/pool'
import { parseSession } from '../../lib/discovery/sessionCodec'
import { seeded } from '../../lib/discovery/random'
import { assignEditorial } from '../../lib/discovery/editorial'
import { fetchMetadata } from '../../lib/discovery/metadataRepair'
import type { Candidate } from '../../lib/discovery/types'

const now = Date.UTC(2026, 8, 13)
const live = JSON.parse(readFileSync(new URL('./fixtures/provider-metadata.json', import.meta.url), 'utf8'))
const make = (key: string, title: string, extra: Partial<Candidate> = {}): Candidate => ({
  key, type: 'video', provider: 'youtube', stock: false, available: true, payload: key, profile: buildProfile({ title }), ...extra,
})
test('real Dailymotion duplicated metadata is one repetition group, not a trustworthy subject or a verified duplicate', () => {
  const a = buildProfile(live[0]), b = buildProfile(live[1])
  assert.equal(a.metadataQuality, 'unverified')
  assert.equal(a.metadataCluster, b.metadataCluster)
  assert.ok(a.metadataCluster)
  assert.equal(relation(a, b), null)
  assert.equal(candidateFromRow({ type: 'video', provider: 'dailymotion', videoId: live[0].id, sourceMetadata: live[0] }, null, now).duplicateKey, undefined)
  const legacy = candidateFromRow({ type: 'video', provider: 'dailymotion', discoveryProvenance: 'legacy-source-fields',
    sourceMetadata: { description: live[0].description } }, null, now)
  assert.equal(legacy.profile.metadataCluster, a.metadataCluster)
  assert.equal(legacy.profile.metadataQuality, 'unverified')
  const useful = buildProfile({ legacyUnverified: true, description: 'Stone carving in my garden.' })
  assert.ok(relation(useful, buildProfile({ title: 'Stone carving tools' })))
})
test('the real Japanese park title is not the South Park cartoon, while a video/quiz/art trio is available', () => {
  const anchor = make('anchor', 'walking tour GIF by South Park', { type: 'image' })
  assert.equal(relation(anchor.profile, buildProfile(live[2])), null)
  const items = [make('scene', 'South Park classroom scene'), make('quiz', 'Who is Cartman in South Park?', { type: 'fact', quiz: true }),
    make('art', 'South Park fan art', { type: 'image' }), make('park', live[2].title)]
  const plan = composeWave(anchor, items)
  assert.ok(plan.ready)
  assert.deepEqual(new Set(plan.trio.map(x => x.type)), new Set(['video', 'fact', 'image']))
  assert.ok(plan.trio.every(x => x.key !== 'park'))
})
test('real incidental words cannot connect a speedrun to a joke or a sports GIF to a TV advertisement', () => {
  assert.equal(relation(buildProfile({ title: 'He thought he could beat me speedrunning every game so I embarrassed him' }),
    buildProfile({ title: 'Chuck Norris once embarrassed him and thought every game was easy.' })), null)
  assert.equal(relation(buildProfile({ title: 'a full time advertisement for prescot cables fc shows a group of players huddled together' }),
    buildProfile({ title: 'Original 1983 Star Wars Arcade Home Release TV Commercial' })), null)
  assert.ok(relation(buildProfile({ title: 'He thought he could beat me speedrunning every game so I embarrassed him' }),
    buildProfile({ title: '🔥 RAREST SPEEDRUN VILLAGE SEED IN MCPE 1.20! 🤯 #shorts' })))
})
test('format adjectives cannot become invented main names; unknown artists still have an exact subject', () => {
  assert.equal(buildProfile({ title: '1983 Rare Atari Commercial & MTV' }).subject?.primary?.key, 'entity:atari')
  assert.equal(buildProfile({ title: 'Sport Soccer GIF by Manchester United' }).subject?.primary?.key, 'entity:manchester united')
  const pottery = buildProfile({ title: 'Live Pottery Replay - Hairy Potter Makes Some Bowls!' })
  assert.ok(relation(pottery, buildProfile({ title: 'Pottery wheel techniques' })))
  const unknown = buildProfile({ title: 'Zora Valentic backstage' })
  assert.ok(relation(unknown, buildProfile({ title: 'Zora Valentic collection' })))
  assert.equal(relation(unknown, buildProfile({ title: 'Addison Rae backstage' })), null)
  assert.equal(relation(buildProfile({ title: 'Johnny Hallyday motorcycle desert road trip' }), buildProfile({ title: 'Motorcycle desert road trip' })), null)
})
test('copied metadata lowers affinity without a new temporary exclusion; sparse fallback stays immediate', () => {
  let state = newSession(8)
  const old = make('first', live[0].title, { profile: buildProfile(live[0]) })
  state = commitDraw(state, planDraw(state, 'video'), old)
  state = parseSession(JSON.parse(JSON.stringify(state)))!
  const repeated = make('second', live[1].title, { profile: buildProfile(live[1]), editorialFamilies: ['animation'] })
  const fresh = make('fresh', 'New independent game speedrun', { publishedAt: now })
  const ticket = { ...planDraw(state, 'video'), branch: 'editorial' as const, lane: 'unknown' as const }
  const choices = Array.from({ length: 300 }, (_, i) => pickPool([repeated, fresh], ticket, state, seeded(i), now, { animation: 5 })?.item.key)
  assert.ok(choices.includes('second') && choices.includes('fresh'), 'both remain eligible; no disguised session exclusion')
  assert.equal(pickPool([repeated], ticket, state, seeded(1), now)?.item.key, 'second')
  assert.equal(pickPool([fresh], { ...ticket, lane: 'recent' }, state, seeded(1), now)?.item.key, 'fresh')
})
test('generic metadata can still be explored but does not spread owner affinity', () => {
  const profile = buildProfile(live[0]), neighbor = make('second', '', { profile: buildProfile(live[1]) })
  const assigned = assignEditorial([neighbor], [{ ownerId: 'owner', contentKey: 'first', familyId: 'music', type: 'video', active: true, version: 2, profile }], 'owner')
  assert.deepEqual(assigned.candidates[0].editorialFamilies, [])
})
test('an exact image remains eligible beyond the original forty-item exclusion window', () => {
  let state = newSession(3)
  const image = make('repeated-image', 'Pottery sculpture', { type: 'image' })
  state = commitDraw(state, planDraw(state, 'image'), image)
  for (let i = 0; i < 60; i++) state = commitDraw(state, planDraw(state, 'video'), make(`v${i}`, `Football match ${i}`))
  assert.ok(!state.recent.some(x => x.key === image.key))
  const other = make('fresh-image', 'Robot sculpture', { type: 'image' })
  const ticket = { ...planDraw(state, 'image'), lane: 'any' as const }
  const choices = Array.from({ length: 100 }, (_, i) => pickPool([image, other], ticket, state, seeded(i), now)?.item.key)
  assert.ok(choices.includes(image.key) && choices.includes(other.key))
  assert.equal(pickPool([image], ticket, state, seeded(1), now)?.item.key, image.key)
})
test('200 draws preserve exploration and keep copied uploads spaced without banning them', () => {
  const items = [...Array.from({ length: 300 }, (_, i) => make(`copy:${i}`, '', { profile: buildProfile(live[0]) })),
    ...Array.from({ length: 300 }, (_, i) => make(`other:${i}`, ['pottery', 'speedrunning', 'football', 'robotics', 'guitar', 'skateboarding'][i % 6] + ` workshop ${i}`))]
  let state = newSession(4), copies = 0, lastCopy = -100, minimumGap = 200
  const rng = seeded(9), started = performance.now()
  for (let i = 0; i < 200; i++) {
    const ticket = { ...planDraw(state, 'video'), branch: 'autonomous' as const, lane: 'any' as const }
    const next = pickPool(items, ticket, state, rng, now)
    assert.ok(next)
    if (next.item.profile.metadataCluster) { copies++; minimumGap = Math.min(minimumGap, i - lastCopy); lastCopy = i }
    state = commitDraw(state, ticket, next.item)
  }
  assert.ok(copies > 0 && copies < 50, `${copies}/200 from a 50% copied-metadata catalogue`)
  console.log(JSON.stringify({ copies, minimumGap, hardSpacingRule: false }))
  assert.ok(performance.now() - started < 10000, 'bounded in-memory selection')
})
test('metadata lookups batch existing IDs, preserve the supplied source title and reject foreign IDs', async () => {
  let called = 0
  const request = (async input => {
    const url = new URL(String(input)); called++
    assert.equal(url.pathname, '/youtube/v3/videos')
    assert.equal(url.searchParams.get('id'), 'aaaaaaaaaaa,bbbbbbbbbbb')
    return Response.json({ items: [
      { id: 'aaaaaaaaaaa', snippet: { title: 'Small homemade performance', channelId: 'creator', categoryId: '10', publishedAt: '2026-09-10T00:00:00Z' }, statistics: { viewCount: '10' } },
      { id: 'foreign-id', snippet: { title: 'Wrong item' } },
    ] })
  }) as typeof fetch
  const rows = await fetchMetadata('youtube', ['aaaaaaaaaaa', 'bbbbbbbbbbb'], 'test-only', new AbortController().signal, request)
  assert.equal(called, 1); assert.equal(rows.length, 1); assert.equal(rows[0].viewCount, 10); assert.equal(rows[0].channelId, 'creator')
})
test('Wave replacement maintains format diversity and never silently fills three images', () => {
  const anchor = make('a', 'Johnny Hallyday official music video')
  const items = [make('v1', 'Johnny Hallyday collection'), make('v2', 'Johnny Hallyday cover'),
    make('v3', 'Johnny Hallyday interview'), ...[1, 2, 3].map(i => make(`i${i}`, 'Johnny Hallyday caricature', { type: 'image' as const }))]
  const wave = new WaveSession(anchor, items), first = wave.next()!
  wave.failed(first.key)
  const shown: Candidate[] = []
  for (let i = 0; i < 3; i++) { const next = wave.next(); assert.ok(next); shown.push(next); wave.displayed(next.key) }
  assert.ok(shown.some(x => x.type === 'video')); assert.ok(shown.filter(x => x.type === 'image').length <= 2)
})
