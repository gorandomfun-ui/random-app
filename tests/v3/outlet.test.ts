import assert from 'node:assert/strict'
import test from 'node:test'

import { mediaFamily, mediaVerdict, ofAnotherTime, OUTLET_VIDEOS, withoutOutlets } from '../../lib/v3/dig/outlet'
import type { DigVideo } from '../../lib/v3/dig/video'

const video = (title: string, channelId: string, over: Partial<DigVideo> = {}): DigVideo => ({
  videoId: `dailymotion:${Math.random().toString(36).slice(2, 9)}`, provider: 'dailymotion', url: 'https://www.dailymotion.com/video/x', title, seconds: 60, live: false, channelId, ...over,
})

test('a video is of another time by an old year in its title or the first lines of its description, or an upload of years ago', () => {
  const now = new Date('2026-10-01T20:00:00Z')
  assert.ok(ofAnotherTime({ title: 'Jacques Brel - Ne me quitte pas (1966)' }, now))
  assert.ok(ofAnotherTime({ title: 'Jacques Brel - Ne me quitte pas', description: 'Diffusé le 12/03/1972 sur la première chaîne.' }, now))
  assert.ok(ofAnotherTime({ title: 'Interview Vaudeville Patrick Timsit', publishedAt: new Date('2012-05-01') }, now))
  assert.ok(!ofAnotherTime({ title: 'Russell Crowe reveals his new film', description: 'Bang Showbiz 2026', publishedAt: new Date('2026-09-28') }, now))
  assert.ok(!ofAnotherTime({ title: 'Top 10 moments', description: `${'x'.repeat(400)} 1970`, publishedAt: '2025-01-01' }, now))
})

test('the family of a media clip is the platform\'s category, a trailer its title; the verdict is a window by family', () => {
  const now = new Date('2026-10-01T20:00:00Z')
  assert.equal(mediaFamily({ title: 'JT de 20h', categoryId: 'news' }), 'news')
  assert.equal(mediaFamily({ title: 'Highlights', categoryId: '17' }), 'news')
  assert.equal(mediaFamily({ title: 'Official Trailer', categoryId: 'people' }), 'trailer')
  assert.equal(mediaFamily({ title: 'Cat falls off a table', categoryId: 'fun' }), 'rest')
  assert.equal(mediaFamily({ title: 'Cat falls off a table' }), 'unknown')
  assert.equal(mediaVerdict({ title: 'JT de 20h', categoryId: 'news', publishedAt: new Date('2026-09-29') }, now), 'moment')
  assert.equal(mediaVerdict({ title: 'JT de 20h', categoryId: 'news', publishedAt: new Date('2026-04-01') }, now), 'refuse')
  assert.equal(mediaVerdict({ title: 'JT de 20h du 3 mai 1988', categoryId: 'news', publishedAt: new Date('2026-04-01') }, now), 'keep')
  assert.equal(mediaVerdict({ title: 'Official Trailer', categoryId: 'shortfilms', publishedAt: new Date('2026-01-10') }, now), 'keep')
  assert.equal(mediaVerdict({ title: 'Official Trailer', categoryId: 'shortfilms', publishedAt: new Date('2023-01-10') }, now), 'refuse')
  assert.equal(mediaVerdict({ title: 'Cat falls off a table', categoryId: 'fun', publishedAt: new Date('2023-01-10') }, now), 'keep')
  assert.equal(mediaVerdict({ title: 'Something', publishedAt: new Date('2026-04-01') }, now), 'refuse')
})

test('on a channel of thousands each video gets its window; small channels and own channels are never judged', () => {
  const now = new Date('2026-10-01T20:00:00Z')
  const kept = [
    video('Russell Crowe reveals his new film', 'showbiz', { channelVideos: 65_000, publishedAt: new Date('2026-09-28'), categoryId: 'people' }),
    video('Russell Crowe on the red carpet', 'showbiz', { channelVideos: 65_000, publishedAt: new Date('2026-04-20'), categoryId: 'people' }),
    video('Russell Crowe in 1999 at Cannes', 'showbiz', { channelVideos: 65_000, publishedAt: new Date('2026-09-20'), categoryId: 'people' }),
    video('Jacques Brel - Ne me quitte pas', 'ina', { channelVideos: 60_000, description: 'Diffusé le 12/03/1972', publishedAt: new Date('2016-01-01') }),
    video('Interview Vaudeville Patrick Timsit', 'ina', { channelVideos: 60_000, publishedAt: new Date('2012-05-01') }),
    video('My kitchen tour', 'vlogger', { channelVideos: 1_800, publishedAt: new Date('2026-09-01') }),
    video('Official music video', 'own', { channelVideos: 90_000, publishedAt: new Date('2026-09-01') }),
    video('A clip', 'unknown'),
  ]
  const verdict = withoutOutlets(kept, (v) => v.channelVideos, new Set(['own']), now)
  assert.deepEqual(verdict.outlets, ['showbiz'])
  assert.equal(verdict.refused, 1)
  assert.deepEqual(verdict.moment.map((v) => v.title), ['Russell Crowe reveals his new film'])
  assert.deepEqual(verdict.kept.map((v) => v.channelId), ['showbiz', 'showbiz', 'ina', 'ina', 'vlogger', 'own', 'unknown'])
  assert.ok(OUTLET_VIDEOS >= 5_000)
})
