import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProfile } from '../../lib/discovery/profile'
import { profileFromRow } from '../../lib/discovery/catalog'
import { createSubjectSearches } from '../../lib/discovery/subjectExploration'
import { focusMatchesVideo, youtubePageLoader, type DiscoveryTask } from '../../lib/discovery/exploration'
import { ProviderQuotaError, providerError } from '../../lib/discovery/providerErrors'
import { relation } from '../../lib/discovery/waves'
import { requestWavePlan } from '../../lib/discovery/clientRequest'

test('unchanged algorithm version cannot hide a corrected source snapshot', () => {
  const sourceMetadata = { title: 'Nora Legrand interview' }
  const old = buildProfile({ title: 'South Park GIF' })
  const row = { sourceMetadata, discoveryVersion: 2, discoveryProfile: old }
  const profile = profileFromRow(row)
  assert.equal(profile.subject?.primary?.key, 'entity:nora legrand')
  assert.notEqual(profile.sourceRevision, old.sourceRevision)
  assert.equal(row.discoveryProfile, old)
})
test('title-led topics seed curation even without a named person; no visitor data is used', () => {
  for (const title of ['Guitar in the garden', 'Cooking with my grandfather', 'Stop motion sculpture', 'Astronomy on a rooftop']) {
    const specs = createSubjectSearches(buildProfile({ title }), { ownerId: 'owner', referenceKey: title }, Date.UTC(2026, 8, 14), 0)
    assert.equal(specs.length, 2, title)
    assert.ok(specs[0].focus?.subject.kind === 'topic', title)
  }
})
test('unregistered film titles and product codes retain their concrete subject', () => {
  for (const [a, b, bad] of [
    ['Les Fugitifs (1986) bande annonce', 'Les Fugitifs : les coulisses', 'Une nouvelle bande annonce'],
    ['R36S handheld installation guide', 'R36S review', 'Other handheld console'],
    ['1983 Rare Atari Commercial & MTV', 'Atari console collection', 'MTV music countdown'],
    ['Roblox gameplay', 'Roblox speedrun', 'Minecraft gameplay'],
    ['Booba clip officiel', 'Booba interview', 'Johnny Hallyday clip officiel'],
  ]) {
    assert.ok(relation(buildProfile({ title: a }), buildProfile({ title: b })), a)
    assert.equal(relation(buildProfile({ title: a }), buildProfile({ title: bad })), null, a)
  }
})
test('subject evidence for owner ingestion rejects the same real park/cartoon homonym as Waves', () => {
  const profile = buildProfile({ title: 'walking tour GIF by South Park' })
  const focus = createSubjectSearches(profile, { ownerId: 'owner', referenceKey: 'giphy:one' }, Date.now(), 0)[0].focus
  const raw = { provider: 'dailymotion' as const, videoId: 'dailymotion:x9tw03a', url: 'https://www.dailymotion.com/video/x9tw03a' }
  assert.equal(focusMatchesVideo({ ...raw, title: '【VR散歩65】大阪市内の秋の風景 うめきた広場～うめきた公園(サウスパーク)＜Insta360 X5＞' }, focus), false)
  assert.ok(focusMatchesVideo({ ...raw, title: 'South Park miniature made by a fan' }, focus))
})
test('YouTube details are batched once, retain tiny accounts and reject explicitly non-embeddable videos', async () => {
  const urls: URL[] = [], permits: string[] = []
  const loader = youtubePageLoader('TEST_KEY', async input => {
    const u = new URL(String(input)); urls.push(u)
    if (u.pathname.endsWith('/search')) return Response.json({ items: ['aaaaaaaaaaa', 'bbbbbbbbbbb'].map(id => ({
      id: { videoId: id }, snippet: { title: 'Nora Legrand home recording', channelId: 'creator' } })) })
    assert.equal(u.pathname, '/youtube/v3/videos')
    return Response.json({ items: ['aaaaaaaaaaa', 'bbbbbbbbbbb'].map(id => ({ id,
      snippet: { title: 'Nora Legrand home recording', publishedAt: '2026-09-01', channelId: 'creator' },
      statistics: { viewCount: '7' }, status: { embeddable: id === 'aaaaaaaaaaa', privacyStatus: 'public' } })) })
  })
  const spec = createSubjectSearches(buildProfile({ title: 'Nora Legrand interview' }), { ownerId: 'o', referenceKey: 'r' }, Date.now(), 0)[0]
  const result = await loader({ _id: 't', spec, depth: 0, pages: 0 } as DiscoveryTask, new AbortController().signal,
    async bucket => { permits.push(bucket); return true })
  assert.deepEqual(permits, ['search', 'other']); assert.equal(urls.length, 2)
  assert.equal(urls[1].searchParams.get('id'), 'aaaaaaaaaaa,bbbbbbbbbbb')
  assert.equal(result.videos.length, 1); assert.equal(result.videos[0].viewCount, 7)
})
test('a details quota failure preserves successfully retrieved search results', async () => {
  const spec = createSubjectSearches(buildProfile({ title: 'Nora Legrand' }), { ownerId: 'o', referenceKey: 'r' }, Date.now(), 0)[0]
  const loader = youtubePageLoader('TEST_KEY', async input => new URL(String(input)).pathname.endsWith('/search')
    ? Response.json({ items: [{ id: { videoId: 'aaaaaaaaaaa' }, snippet: { title: 'Nora Legrand interview' } }] })
    : Response.json({ error: { errors: [{ reason: 'quotaExceeded' }] } }, { status: 403 }))
  const result = await loader({ _id: 't', spec, depth: 0, pages: 0 } as DiscoveryTask, new AbortController().signal, async () => true)
  assert.equal(result.videos.length, 1); assert.equal(result.remoteOtherExhausted, true)
})
test('403 permission denial is not confused with quota, and errors contain no secret URL', async () => {
  assert.ok(await providerError(Response.json({ error: { errors: [{ reason: 'quotaExceeded' }] } }, { status: 403 }), 'youtube', 'search') instanceof ProviderQuotaError)
  const error = await providerError(Response.json({ error: { errors: [{ reason: 'forbidden' }], message: 'secret-url' } }, { status: 403 }), 'youtube', 'search')
  assert.equal(error.message, 'youtube-status-403'); assert.ok(!(error instanceof ProviderQuotaError))
})
test('a transient incomplete Wave is retried once; real absence is returned immediately', async () => {
  let calls = 0
  const request = (async () => ++calls === 1
    ? Response.json({ available: false }, { status: 503, headers: { 'Retry-After': '1' } })
    : Response.json({ available: true })) as typeof fetch
  const response = await requestWavePlan({ anchorId: 'example' }, new AbortController().signal, request)
  assert.equal(calls, 2); assert.deepEqual(await response.json(), { available: true })
  calls = 0
  await requestWavePlan({}, new AbortController().signal, (async () => {
    calls++; return Response.json({ available: false })
  }) as typeof fetch)
  assert.equal(calls, 1)
})
test('leaving a Wave during the retry delay cancels the next request', async () => {
  const controller = new AbortController(); let calls = 0
  const pending = requestWavePlan({}, controller.signal, (async () => {
    calls++; setTimeout(() => controller.abort(new Error('left-content')), 10)
    return Response.json({}, { status: 503, headers: { 'Retry-After': '1' } })
  }) as typeof fetch)
  await assert.rejects(pending, /left-content/)
  assert.equal(calls, 1)
})
