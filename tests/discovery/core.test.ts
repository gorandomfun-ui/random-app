import test from 'node:test'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { buildProfile, tokensOf } from '../../lib/discovery/profile'
import { buildVideoDocument } from '../../lib/ingest/videoDocument'
import { videoDiscoveryFields } from '../../lib/ingest/discoveryMetadata'
import { candidateFromRow, canonicalMediaKey } from '../../lib/discovery/catalog'
import { newSession, planDraw, commitDraw, pickPool, recordWave, ReservationQueue } from '../../lib/discovery/pool'
import { composeWave, relation, WaveSession } from '../../lib/discovery/waves'
import { assignEditorial } from '../../lib/discovery/editorial'
import { seeded } from '../../lib/discovery/random'
import { taskId, youtubePageLoader, type DiscoveryTask } from '../../lib/discovery/exploration'
import { createSearchSeeds } from '../../lib/discovery/seeds'
import { DiscoveryController } from '../../lib/discovery/controller'
import { parseSession, randomHandler } from '../../lib/discovery/handlers'
import type { Candidate, Format } from '../../lib/discovery/types'

const NOW = Date.UTC(2026, 8, 9)
function item(key: string, title = 'stone carving workshop', type: Format = 'video', extra: Partial<Candidate<string>> = {}): Candidate<string> {
  return { key, type, provider: 'youtube', stock: false, available: true, profile: buildProfile({ title }), payload: key, ...extra }
}
test('query changes never change source qualification, tags, keywords or tone', () => {
  const base = { videoId: 'abcdefghijk', url: 'https://youtu.be/abcdefghijk', provider: 'youtube' as const, title: 'Kitchen recording 17' }
  const a = buildVideoDocument({ ...base, contextQueries: ['weird rare vintage funny punk concert'] })!
  const b = buildVideoDocument({ ...base, contextQueries: ['mainstream sport'] })!
  assert.deepEqual(a.discoveryProfile, b.discoveryProfile)
  assert.deepEqual(a.tags, b.tags); assert.deepEqual(a.keywords, b.keywords); assert.equal(a.tone, b.tone)
  assert.notDeepEqual(a.discoveryQueries, b.discoveryQueries)
})
test('sparse homemade metadata is retained without inventing coolness', () => {
  const doc = buildVideoDocument({ videoId: 'abcdefghijk', url: 'https://youtu.be/abcdefghijk', provider: 'youtube', title: '00017', contextQueries: ['amazing performance'] })!
  assert.ok(doc); assert.equal(doc.discoveryProfile?.evidence, 'unknown')
  assert.equal(doc.discoveryProfile?.family, 'unknown')
})
test('only actual trend observations count and upload date is independent', () => {
  const fields = videoDiscoveryFields({ provider: 'youtube', title: 'guitar', publishedAt: '2010-01-01', contextQueries: ['trending now'] })
  assert.equal(fields.trendObservedAt, undefined)
  assert.equal(fields.publishedAt?.getUTCFullYear(), 2010)
  assert.equal(videoDiscoveryFields({ provider: 'youtube', publishedAt: 'nonsense' }).publishedAt, undefined)
})
test('Unicode is retained and titles from Reddit do not masquerade as source metadata', () => {
  assert.ok(tokensOf('日本の陶芸 мастерская مستكشف').some(x => /[\u3040-\u9fff]/.test(x)))
  assert.ok(tokensOf('мастерская').includes('мастерская'))
  assert.deepEqual(videoDiscoveryFields({ provider: 'reddit-youtube', title: 'rare punk' }).discoveryProfile.tokens, [])
})
test('legacy contaminated tags do not open Wave relations', () => {
  const legacy = candidateFromRow({ _id: 'a', type: 'video', tags: ['stone', 'carving'], keywords: ['stone carving'], title: 'random' }, 'a', NOW)
  assert.equal(relation(item('anchor').profile, legacy.profile), null)
})
test('normalisation respects actual runtime-block field and provider status', () => {
  assert.equal(candidateFromRow({ type: 'video', obsoleteVideoRuntimeBlockedUntil: new Date(NOW + 10000) }, 'a', NOW).available, false)
  assert.equal(candidateFromRow({ type: 'video', sourceStatus: { embeddable: false } }, 'a', NOW).available, false)
  assert.equal(candidateFromRow({ type: 'image', url: 'https://images.pexels.com/photo/1.jpg' }, 'a', NOW).stock, true)
})
test('same YouTube video has one identity across URLs and Reddit provider', () => {
  const a = canonicalMediaKey({ type: 'video', provider: 'reddit-youtube', videoId: 'abcdefghijk' })
  const b = canonicalMediaKey({ type: 'video', url: 'https://www.youtube.com/watch?v=abcdefghijk&t=42' })
  assert.equal(a, b)
})
test('text slots are independent, count towards ten, and consume no visual bag', () => {
  let state = newSession(3)
  for (let i = 0; i < 10; i++) {
    const ticket = planDraw(state, 'quote')
    assert.equal(ticket.mode, 'random'); state = commitDraw(state, ticket, item(`q${i}`, 'text', 'quote'))
  }
  assert.equal(state.displayed, 10); assert.equal(state.coolTickets, 0); assert.equal(state.visuals, 0)
})
test('failed prefetch rolls back successors and only displayed items advance counters', () => {
  const queue = new ReservationQueue<string>(newSession(8))
  for (let i = 0; i < 3; i++) queue.reserve(planDraw(queue.projected, 'video'), item(`v${i}`))
  assert.equal(queue.committed.displayed, 0); assert.equal(queue.projected.displayed, 3)
  queue.displayed('v0'); queue.failed('v1')
  assert.equal(queue.committed.displayed, 1); assert.equal(queue.length, 0); assert.equal(queue.projected.displayed, 1)
  const stale = planDraw(queue.projected, 'video')
  queue.reset(recordWave(queue.committed, item('wave')))
  assert.throws(() => queue.reserve(stale, item('v4')), /Stale/)
  assert.equal(queue.committed.displayed, 1)
})
test('hard stock exclusion survives every cool/general fallback before forty', () => {
  const stock = item('stock', 'guitar', 'image', { stock: true, provider: 'pixabay' })
  let state = newSession(44)
  for (let i = 0; i < 40; i++) {
    const ticket = planDraw(state, 'image')
    assert.equal(ticket.allowStock, false)
    assert.equal(pickPool([stock], ticket, state, seeded(i), NOW), null)
    state = commitDraw(state, ticket, item(`normal${i}`, 'guitar', 'image'))
  }
})
test('an overwhelmingly large family does not dominate a family-first draw', () => {
  const candidates = Array.from({ length: 900 }, (_, i) => item(`game${i}`, 'gameplay'))
  for (const title of ['guitar', 'football', 'pottery', 'cooking', 'trailer', 'astronomy', 'robotics', 'advertisement', 'punk']) {
    candidates.push(item(title, title))
  }
  const random = seeded(91), state = { ...newSession(1), displayed: 50 }
  const ticket = { ...planDraw(state, 'video'), mode: 'random' as const, branch: 'general' as const, lane: 'any' as const }
  let gaming = 0
  for (let i = 0; i < 4000; i++) if (pickPool(candidates, ticket, state, random, NOW)?.item.profile.family === 'gaming') gaming++
  assert.ok(gaming / 4000 < .2, `${gaming}/4000 gaming`)
})
test('public engagement scores have no effect on V2 selection', () => {
  const candidates = Array.from({ length: 30 }, (_, i) => item(`${i}`, i % 2 ? 'guitar' : 'pottery'))
  const state = newSession(18), ticket = planDraw(state, 'video')
  const a = pickPool(candidates, ticket, state, seeded(42), NOW)
  const b = pickPool(candidates.map(x => Object.assign({}, x, { likeCount: 1e9, showWeight: 1e9, quality: 1e9 })), ticket, state, seeded(42), NOW)
  assert.equal(a?.item.key, b?.item.key)
})
test('500 sessions of 100 Randoms keep stock, repetition and mode invariants', () => {
  const started = performance.now(), random = seeded(77)
  const candidates = Array.from({ length: 200 }, (_, i) => item(`c${i}`, ['pottery', 'guitar', 'gameplay', 'football'][i % 4], i % 3 ? 'video' : 'image',
    { stock: i % 13 === 0, authorKey: `author${i % 37}` }))
  let displays = 0
  for (let session = 0; session < 500; session++) {
    let state = newSession(session), mixed = 0, coolMixed = 0
    for (let draw = 0; draw < 100; draw++) {
      const type = draw % 10 === 9 ? 'quote' : draw % 3 === 0 ? 'image' : 'video'
      const ticket = planDraw(state, type)
      if (draw < 10 && type !== 'quote') assert.equal(ticket.mode, 'cool')
      if (draw >= 10 && type !== 'quote') { mixed++; coolMixed += Number(ticket.mode === 'cool') }
      const pool = type === 'quote' ? [item(`q${session}:${draw}`, 'text', 'quote')] : candidates
      const selected = pickPool(pool, ticket, state, random, NOW)
      assert.ok(selected)
      if (selected.item.stock) assert.ok(draw >= 40 && ticket.mode === 'random')
      state = commitDraw(state, ticket, selected.item)
      assert.ok(state.visualHistory.slice(-20).filter(x => x.stock).length <= 1)
      displays++
    }
    assert.ok(Math.abs(coolMixed - mixed / 2) <= 5)
  }
  console.log(JSON.stringify({ simulation: 'pool', sessions: 500, displays, durationMs: Math.round(performance.now() - started) }))
})
test('Waves reject generic weird/retro similarity and retain a verifiable subject', () => {
  assert.equal(relation(buildProfile({ title: 'weird rare retro vintage' }), buildProfile({ title: 'weird rare retro vintage' })), null)
  assert.ok(relation(buildProfile({ title: 'Addison Rae concert Prague' }), buildProfile({ title: 'Addison Rae fan recording Boston' })))
  assert.equal(relation(buildProfile({ title: 'stone carving' }), buildProfile({ title: 'football champions' })), null)
})
test('Waves compose three with a video even when many images rank above it', () => {
  const anchor = item('a'), images = Array.from({ length: 30 }, (_, i) => item(`i${i}`, 'stone carving workshop', 'image'))
  const plan = composeWave(anchor, [...images, item('v', 'stone carving')])
  assert.ok(plan.ready)
  assert.equal(plan.trio.length, 3); assert.equal(plan.trio.filter(x => x.type === 'image').length, 2)
  assert.ok(plan.trio.every(x => plan.relations[x.key].reasons.length))
})
test('three images or an unrelated quiz are not an acceptable Wave fallback', () => {
  const anchor = item('a'), images = [1, 2, 3].map(i => item(`i${i}`, 'stone carving', 'image'))
  assert.equal(composeWave(anchor, images).ready, false)
  assert.equal(composeWave(anchor, [...images, item('quiz', 'football', 'fact', { quiz: true })]).ready, false)
})
test('series and duplicate identities are hard exclusions, repeated authors are soft', () => {
  const anchor = item('a'), candidates = [1, 2, 3].map(i => item(`v${i}`, 'stone carving', 'video', { seriesKey: 'verified-series' }))
  assert.equal(composeWave(anchor, candidates).ready, false)
  assert.equal(composeWave(anchor, candidates.map(x => ({ ...x, seriesKey: undefined, authorKey: 'same-author' }))).ready, true)
})
test('Wave replacement recomposes after failures and never drifts from the original anchor', () => {
  const anchor = item('a'), candidates = [item('v1'), item('v2'), item('v3'), item('i1', 'stone carving', 'image'), item('i2', 'stone carving', 'image')]
  const session = new WaveSession(anchor, candidates)
  const first = session.next()!; session.displayed(first.key)
  const broken = session.next()!; session.failed(broken.key)
  const replacement = session.next()!
  assert.ok(replacement); assert.notEqual(replacement.key, broken.key)
  assert.ok(relation(anchor.profile, replacement.profile)); session.displayed(replacement.key)
  const last = session.next()!; session.displayed(last.key)
  assert.equal(session.next(), null); assert.equal(session.displayedCount, 3)
})
test('private owner references are reversible, scoped, and not needed for the autonomous fallback', () => {
  const items = [item('ref'), item('similar'), item('other', 'football')]
  const refs = [{ ownerId: 'owner', contentKey: 'ref', familyId: 'craft-direction', active: true, profile: items[0].profile, type: 'video' as const, version: 1 }]
  const assigned = assignEditorial(items, refs, 'owner')
  assert.deepEqual(assigned.candidates[1].editorialFamilies, ['craft-direction'])
  assert.deepEqual(assignEditorial(items, refs, 'another').referenceCounts, {})
  const removed = assignEditorial(items, refs.map(x => ({ ...x, active: false })), 'owner')
  assert.deepEqual(removed.candidates[0].editorialFamilies, [])
  const state = newSession(12), ticket = { ...planDraw(state, 'video'), mode: 'cool' as const, branch: 'editorial' as const }
  assert.equal(pickPool(removed.candidates, ticket, state, seeded(5), NOW)?.branch, 'autonomous')
})
test('search tasks keep stable identity, dates, language and ordering across pages', async () => {
  const spec = { kind: 'search' as const, query: 'local television', language: 'ja', order: 'relevance' as const, after: '2008-01-01T00:00:00.000Z', before: '2009-01-01T00:00:00.000Z' }
  assert.equal(taskId(spec), taskId({ ...spec }))
  assert.notEqual(taskId(spec), taskId({ ...spec, language: 'fr' }))
  const requests: URL[] = []
  const load = youtubePageLoader('FAKE_TEST_KEY', (async input => {
    requests.push(new URL(String(input)))
    return Response.json({ items: [], nextPageToken: 'PAGE2' })
  }) as typeof fetch)
  const task = { _id: taskId(spec), spec, depth: 0 } as DiscoveryTask
  await load(task, new AbortController().signal, async () => true)
  await load({ ...task, cursor: 'PAGE2' }, new AbortController().signal, async () => true)
  for (const param of ['q', 'order', 'publishedAfter', 'publishedBefore', 'relevanceLanguage']) assert.equal(requests[0].searchParams.get(param), requests[1].searchParams.get(param))
  assert.equal(requests[1].searchParams.get('pageToken'), 'PAGE2')
  await assert.rejects(load(task, new AbortController().signal, async () => false), /quota-exhausted/)
  assert.equal(requests.length, 2)
})
test('playlist publication dates and authors refer to the video, not to the playlist', async () => {
  const load = youtubePageLoader('FAKE_TEST_KEY', (async () => Response.json({ items: [{
    snippet: { title: 'recording', channelId: 'playlist-owner', videoOwnerChannelId: 'video-owner', publishedAt: '2026-01-01' },
    contentDetails: { videoId: 'abcdefghijk', videoPublishedAt: '2009-01-01' },
  }] })) as typeof fetch)
  const page = await load({ _id: 'p', depth: 2, spec: { kind: 'playlist', playlistId: 'p' } } as DiscoveryTask, new AbortController().signal, async () => true)
  assert.equal(page.videos[0].publishedAt, '2009-01-01'); assert.equal(page.videos[0].channelId, 'video-owner')
})
test('seed portfolio varies language, topics and years without changing a result profile', () => {
  const seeds = createSearchSeeds(seeded(7), NOW, 40)
  assert.ok(new Set(seeds.filter(x => x.kind === 'search').map(x => x.language)).size >= 4)
  assert.ok(seeds.every(x => x.kind !== 'search' || new Date(x.after) < new Date(x.before)))
})

test('text identity ignores database ID and public popularity', () => {
  const a = canonicalMediaKey({ _id: 'a', type: 'joke', text: 'A small joke.' })
  const b = canonicalMediaKey({ _id: 'b', type: 'joke', text: 'A  small joke.', likeCount: 100 })
  assert.equal(a, b)
})
test('an obsolete async response cannot reserve a Random after language or Wave changes', async () => {
  const controller = new DiscoveryController<string>(newSession(41))
  let resolve!: (value: Candidate<string>) => void
  const pending = controller.prepare('video', () => new Promise(done => { resolve = done }))
  controller.invalidate(); resolve(item('late'))
  assert.equal(await pending, null); assert.equal(controller.snapshot().displayed, 0)
})
test('disabled routes never call the database and malformed state fails validation', async () => {
  let accesses = 0
  const handler = randomHandler({ enabled: () => false, getDb: async () => { accesses++; return null }, decode: () => null })
  assert.equal((await handler(new Request('https://test.invalid', { method: 'POST', body: '{}' }))).status, 404)
  assert.equal(accesses, 0)
  assert.ok(parseSession(newSession(3)))
  assert.equal(parseSession({ ...newSession(3), recent: new Array(41).fill({}) }), null)
  assert.equal(parseSession({ ...newSession(3), visuals: 10, displayed: 0 }), null)
})
test('30 varied anchors compose bounded, related trios, never three images', () => {
  const started = performance.now()
  const titles = ['stone carving workshop', 'Addison Rae fan recording', 'skateboarding ollie garage', 'independent pottery studio', 'astronomy telescope garden']
  for (let i = 0; i < 30; i++) {
    const anchor = item(`anchor${i}`, titles[i % titles.length])
    const candidates = Array.from({ length: 100 }, (_, j) => item(`${i}:${j}`, titles[(j + i) % titles.length], j % 2 ? 'image' : 'video'))
    const plan = composeWave(anchor, candidates)
    assert.ok(plan.ready)
    assert.ok(plan.trio.filter(x => x.type === 'image').length <= 2)
    assert.ok(plan.trio.every(x => relation(anchor.profile, x.profile)))
  }
  console.log(JSON.stringify({ simulation: 'waves', anchors: 30, durationMs: Math.round(performance.now() - started) }))
})
