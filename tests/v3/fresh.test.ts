import assert from 'node:assert/strict'
import test from 'node:test'

import { capForeignSketches, capUniverses, FRESH_PLAN, FRESH_SPACING, FRESH_UNIVERSE_MAX, interleave, isAiMade, isFreshFormat, pickBucket, type FreshBucket, type FreshEntry } from '../../lib/v3/fresh/plan'

const entry = (videoId: string, bucket: FreshBucket, region: string, rank: number, views = 0, channel?: string): FreshEntry =>
  ({ id: videoId.padStart(24, '0'), videoId, bucket, region, rank, views, channel })

test('the day asks for a thousand videos, the places and the kinds of video both', () => {
  assert.equal(FRESH_PLAN.reduce((sum, plan) => sum + plan.quota, 0), 1000)
  assert.equal(Math.max(...FRESH_PLAN.map((plan) => plan.quota)), FRESH_PLAN.find((plan) => plan.bucket === 'world')?.quota, 'the world is still the biggest zone')
  assert.equal(FRESH_PLAN.find((plan) => plan.bucket === 'music')?.category, '10')
  for (const [bucket, category] of [['sport', '17'], ['animals', '15'], ['science', '28'], ['howto', '26'], ['people', '22'], ['autos', '2'], ['film', '1']]) {
    assert.equal(FRESH_PLAN.find((plan) => plan.bucket === bucket)?.category, category, bucket)
  }
})

test('music and gaming keep to their share of the list, the extra leaving from the end of each zone', () => {
  const zone = (bucket: FreshBucket, universes: string[]) => universes.map((universe, index) => ({ ...entry(`${bucket}${index}`, bucket, 'XX', index), universe }))
  const picked = new Map<FreshBucket, FreshEntry[]>([
    ['world', zone('world', ['music', 'music', 'sport', 'music', 'music'])],
    ['fun', zone('fun', ['humor-memes', 'music', 'gaming', 'gaming', 'gaming'])],
  ])
  const capped = capUniverses(picked, { music: 0.25, gaming: 0.15 })
  const all = [...capped.values()].flat()
  assert.ok(all.filter((item) => item.universe === 'music').length <= 2, 'a quarter of ten')
  assert.ok(all.filter((item) => item.universe === 'gaming').length <= 1)
  assert.deepEqual(capped.get('world')!.slice(0, 2).map((item) => item.videoId), ['world0', 'world1'], 'the best placed stay')
  assert.ok(all.some((item) => item.universe === 'sport') && all.some((item) => item.universe === 'humor-memes'), 'the others untouched')
})

test('a still album cover or a long gaming session does not open a feed', () => {
  assert.equal(isFreshFormat({ channelTitle: 'Mavo - Topic', universe: 'music', duration: 'PT3M' }), false)
  assert.equal(isFreshFormat({ channelTitle: 'Wisp', universe: 'gaming', duration: 'PT34M' }), false)
  assert.equal(isFreshFormat({ channelTitle: 'Wisp', universe: 'gaming', duration: 'PT9M' }), true)
  assert.equal(isFreshFormat({ channelTitle: 'Concert Hall', universe: 'music', duration: 'PT1H2M' }), true, 'only gaming sessions are cut for length')
})

test('a zone by rank lets every country bring its own; the world takes the biggest', () => {
  const europe = FRESH_PLAN.find((plan) => plan.bucket === 'europe')!
  const picked = pickBucket([entry('fr1', 'europe', 'FR', 1), entry('fr0', 'europe', 'FR', 0), entry('de0', 'europe', 'DE', 0), entry('de1', 'europe', 'DE', 1)], { ...europe, quota: 3 }, new Set())
  assert.deepEqual(picked.map((pick) => pick.videoId), ['fr0', 'de0', 'fr1'])
  const world = FRESH_PLAN.find((plan) => plan.bucket === 'world')!
  const taken = new Set<string>(['big'])
  const top = pickBucket([entry('small', 'world', 'US', 0, 10), entry('big', 'world', 'IN', 1, 1_000_000), entry('mid', 'world', 'BR', 2, 5000)], world, taken)
  assert.deepEqual(top.map((pick) => pick.videoId), ['mid', 'small'], 'the biggest first, and nothing taken twice')
})

const index0Shared = (bucket: FreshBucket) => FRESH_PLAN.findIndex((plan) => plan.bucket === bucket) < 5

test('the day\'s order: zones take turns by quota, never the same channel within ten', () => {
  const buckets = new Map<FreshBucket, FreshEntry[]>()
  for (const plan of FRESH_PLAN) {
    // One channel shared by the first video of five zones: sixteen zones start the list, the shared ones must still be ten apart.
    const shared = index0Shared(plan.bucket)
    buckets.set(plan.bucket, Array.from({ length: plan.quota / 10 }, (_, index) => entry(`${plan.bucket}-${index}`, plan.bucket, 'XX', index, 0, index === 0 && shared ? 'same-channel' : `${plan.bucket}-c${index}`)))
  }
  const order = interleave(buckets)
  assert.equal(order.length, 100)
  for (let index = 0; index < order.length; index += 1) {
    const window = order.slice(Math.max(0, index - FRESH_SPACING + 1), index + 1).filter((pick) => pick.channel === 'same-channel')
    assert.ok(window.length <= 1, `channel repeated at ${index}`)
  }
  const firstFifty = order.slice(0, 50)
  const world = firstFifty.filter((pick) => pick.bucket === 'world').length
  const usa = firstFifty.filter((pick) => pick.bucket === 'usa').length
  assert.ok(world >= usa * 1.5, `world ${world}, usa ${usa}`)
  assert.equal(new Set(order.slice(0, 9).map((pick) => pick.bucket)).size, 9, 'the first nine come from nine zones')
})

test('no more than four of one universe within ten: the charts are mostly music, the list should not be', () => {
  const buckets = new Map<FreshBucket, FreshEntry[]>()
  for (const plan of FRESH_PLAN) {
    buckets.set(plan.bucket, Array.from({ length: plan.quota / 10 }, (_, index) => ({ ...entry(`${plan.bucket}-${index}`, plan.bucket, 'XX', index, 0, `${plan.bucket}-c${index}`), universe: index % 3 === 2 ? 'sport' : index % 3 === 1 ? 'gaming' : 'music' })))
  }
  const order = interleave(buckets)
  for (let index = 0; index + 10 <= 60; index += 1) {
    const music = order.slice(index, index + 10).filter((pick) => pick.universe === 'music').length
    assert.ok(music <= FRESH_UNIVERSE_MAX, `${music} music in ten at ${index}`)
  }
})

test('what its channel or title says is made by AI stays off the fresh list', () => {
  assert.ok(isAiMade('ILARION-AI-STUDIO', '„ისგუ ნაცად მი“/isgu nacad mi'))
  assert.ok(isAiMade('Some Channel', 'Epic battle (AI generated)'))
  assert.ok(isAiMade('Sora Clips', 'made with Sora'))
  assert.ok(!isAiMade('Troye Sivan', 'Troye Sivan - Party (Official Music Video)'))
  assert.ok(!isAiMade('Wired', 'How AI is changing hospitals'), 'a report about AI is not made by AI')
  assert.ok(!isAiMade('Mountain Air Studio', 'Faith and Mountains'))
})

test('when YouTube says no, the day\'s earlier chart reads rebuild the zones', async () => {
  const { observedFound } = await import('../../lib/v3/fresh/plan')
  const found = observedFound([
    { videoId: 'a1', title: 'A', viewCount: 10, discoveryQueries: ['youtube:trending:ng'] },
    { videoId: 'a2', title: 'B', viewCount: 99, discoveryQueries: ['youtube:trending:ng'] },
    { videoId: 'm1', title: 'Song', viewCount: 5, discoveryQueries: ['youtube:trending:us:10'] },
    { videoId: 'u1', title: 'US', viewCount: 7, discoveryQueries: ['youtube:trending:us'] },
    { videoId: 'x', title: 'Search', discoveryQueries: ['marimba en vivo'] },
  ])
  const zones = (id: string) => found.filter((entry) => entry.raw.videoId === id).map((entry) => entry.bucket).sort()
  assert.deepEqual(zones('a2'), ['africa'])
  assert.equal(found.find((entry) => entry.raw.videoId === 'a2')?.rank, 0, 'the most viewed first when the chart order is gone')
  assert.deepEqual(zones('m1'), ['music'])
  assert.deepEqual(zones('u1'), ['usa', 'world'])
  assert.deepEqual(zones('x'), [])
})

test('views of the day: what a video gained since the count taken about a day ago', async () => {
  const { dailyViews, rankByDaily } = await import('../../lib/v3/fresh/plan')
  const HOUR = 3_600_000, now = Date.UTC(2026, 8, 28, 7, 5)
  assert.equal(dailyViews([{ at: now - 24 * HOUR, views: 1_000_000 }], 1_300_000, now), 300_000)
  assert.equal(dailyViews([{ at: now - 18 * HOUR, views: 1_000 }], 1_900, now), 1_200, 'brought to a whole day')
  assert.equal(dailyViews([{ at: now - 2 * HOUR, views: 10 }], 20, now), null, 'too recent to say')
  assert.equal(dailyViews([{ at: now - 60 * HOUR, views: 10 }], 20, now), null, 'too old to say')
  assert.equal(dailyViews([{ at: now - 30 * HOUR, views: 5 }, { at: now - 23 * HOUR, views: 50 }], 150, now), Math.round(100 * 24 / 23), 'the count closest to a day ago')
  // A giant that gains little falls behind a smaller video that exploded today.
  const ranked = rankByDaily([
    { bucket: 'europe' as const, region: 'FR', daily: 20_000, videoId: 'giant' },
    { bucket: 'europe' as const, region: 'FR', daily: 900_000, videoId: 'star' },
    { bucket: 'europe' as const, region: 'DE', daily: 5, videoId: 'de' },
  ])
  assert.deepEqual(ranked.filter((entry) => entry.region === 'FR').sort((a, b) => a.rank - b.rank).map((entry) => entry.videoId), ['star', 'giant'])
  assert.equal(ranked.find((entry) => entry.videoId === 'de')?.rank, 0)
})

test('spoken sketches from countries most visitors do not understand keep a share of the list, not the list', () => {
  const zone = (bucket: FreshBucket, region: string, universes: string[]) => universes.map((universe, index) => ({ ...entry(`${bucket}${region}${index}`, bucket, region, index), universe }))
  const picked = new Map<FreshBucket, FreshEntry[]>([
    ['fun', [...zone('fun', 'ID', ['humor-memes', 'humor-memes', 'humor-memes', 'humor-memes']), ...zone('fun', 'US', ['humor-memes'])]],
    ['animals', zone('animals', 'BR', ['nature-animals', 'nature-animals', 'nature-animals', 'nature-animals', 'nature-animals'])],
  ])
  const capped = capForeignSketches(picked, 0.1)
  assert.equal(capped.get('fun')!.filter((item) => item.region === 'ID').length, 1, 'one in ten of a list of ten')
  assert.equal(capped.get('fun')!.filter((item) => item.region === 'US').length, 1, 'a sketch in a shared language stays')
  assert.equal(capped.get('animals')!.length, 5, 'a dog from Brazil needs no words')
})
