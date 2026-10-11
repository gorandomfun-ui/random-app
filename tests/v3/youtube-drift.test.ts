import assert from 'node:assert/strict'
import test from 'node:test'

import type { LineContext } from '../../lib/v3/ingest/context'
import { run, uploadsOf, VIDEOS_PER_CHANNEL } from '../../lib/v3/ingest/lines/youtube-drift'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

test("a channel's uploads playlist is its id with UU for UC", () => {
  assert.equal(uploadsOf('UCabcdefghijklmnopqrstuv'), 'UUabcdefghijklmnopqrstuv')
  assert.equal(uploadsOf('x1abc'), null)
})

test('the YouTube drift: each channel read once, ten new uploads at most, two units a channel, through the doors, then admitted', async () => {
  const channel = 'UCabcdefghijklmnopqrstuv'
  const uploads = Array.from({ length: 50 }, (_, index) => `vid${String(index).padStart(8, '0')}`)
  const calls: string[] = []
  const http = (async (input: string | URL) => {
    const url = new URL(String(input))
    calls.push(url.pathname)
    if (url.pathname.endsWith('/playlistItems')) {
      assert.equal(url.searchParams.get('playlistId'), 'UUabcdefghijklmnopqrstuv')
      return json({ items: uploads.map((videoId) => ({ contentDetails: { videoId } })) })
    }
    if (url.pathname.endsWith('/videos')) {
      const ids = (url.searchParams.get('id') ?? '').split(',')
      assert.ok(ids.length <= VIDEOS_PER_CHANNEL, 'ten at most')
      assert.ok(!ids.includes('vid00000000'), 'not what the base holds')
      return json({ items: ids.map((id, index) => ({ id, snippet: { title: index === 0 ? 'LIVE NOW 24/7 stream' : `A small film about pottery number ${index}`, description: '', channelId: channel, channelTitle: 'potter', publishedAt: '2026-10-01T00:00:00Z', liveBroadcastContent: index === 0 ? 'live' : 'none' }, status: { embeddable: true, privacyStatus: 'public' }, statistics: { viewCount: '120' }, contentDetails: { duration: 'PT3M' } })) })
    }
    if (url.pathname.endsWith('/channels')) return json({ items: [{ id: channel, statistics: { videoCount: '300' } }] })
    throw new Error(`unexpected ${url}`)
  }) as typeof fetch
  const seenWrites: unknown[] = []
  const reserved: number[] = []
  const admitted: Array<{ videoId: string }> = []
  const collection = (name: string) => ({
    find: (filter: Record<string, unknown>) => ({ toArray: async () => (name === 'items' && filter.videoId ? [{ videoId: 'vid00000000' }] : []) }),
    countDocuments: async () => 0,
    bulkWrite: async (operations: unknown[]) => { if (name === 'yt_drift_channels_v4') seenWrites.push(...operations); return {} },
  })
  const ctx = {
    db: { collection } as unknown as LineContext['db'],
    line: 'youtube-drift', deadline: Date.now() + 600_000, timeLeft: () => 600_000, dryRun: false, cursor: null,
    quota: { reserve: async (units: number) => { reserved.push(units); return true } } as unknown as LineContext['quota'],
    admit: async (batch: { videos?: Array<{ videoId: string }> }) => { admitted.push(...(batch.videos ?? [])); return { scanned: batch.videos?.length ?? 0, inserted: batch.videos?.length ?? 0, duplicates: 0, rejected: {}, insertedIds: [] } },
    search: async () => undefined, log: () => undefined, http,
  } as unknown as LineContext
  const result = await run(ctx, { youtubeKey: 'k', random: () => 0.42, seeds: [{ channelId: channel, title: 'potter' }] })
  assert.equal(calls.filter((path) => path.endsWith('/playlistItems')).length, 1)
  assert.equal(calls.filter((path) => path.endsWith('/videos')).length, 1)
  assert.equal(admitted.length, VIDEOS_PER_CHANNEL - 1, 'the live one left at the door')
  assert.ok(admitted.every((video) => video.videoId !== 'vid00000000'))
  assert.equal(result.counters.inserted, VIDEOS_PER_CHANNEL - 1)
  assert.equal(result.counters.duplicates, 1)
  assert.equal(seenWrites.length, 1, 'the channel is remembered: a fortnight before it is read again')
  // A page, the details, the channel's size for the media windows: three units, each booked first.
  assert.equal(reserved.reduce((sum, units) => sum + units, 0), 3)
})

test('the YouTube drift stops cleanly when the day\'s units are spent', async () => {
  const ctx = {
    db: { collection: () => ({ find: () => ({ toArray: async () => [] }), countDocuments: async () => 0, bulkWrite: async () => ({}) }) } as unknown as LineContext['db'],
    line: 'youtube-drift', deadline: Date.now() + 600_000, timeLeft: () => 600_000, dryRun: false, cursor: null,
    quota: { reserve: async () => false } as unknown as LineContext['quota'],
    admit: async () => ({ scanned: 0, inserted: 0, duplicates: 0, rejected: {}, insertedIds: [] }),
    search: async () => undefined, log: () => undefined, http: (async () => { throw new Error('no call without units') }) as unknown as typeof fetch,
  } as unknown as LineContext
  const result = await run(ctx, { youtubeKey: 'k', seeds: [{ channelId: 'UCabcdefghijklmnopqrstuv' }] })
  assert.equal(result.counters.inserted, 0)
  assert.ok(result.errors.includes('youtube : budget du jour atteint'))
})
