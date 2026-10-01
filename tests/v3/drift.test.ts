import assert from 'node:assert/strict'
import test from 'node:test'

import { toDigVideo } from '../../lib/v3/dig/dailymotion'
import { driftDoor, SMALL_UPLOADER } from '../../lib/v3/ingest/lines/drift'

test('a Dailymotion row becomes a video the lines read; private, unembeddable or explicit ones do not', () => {
  const row = { id: 'x7ch5x6', title: 'ビオフェルミンVC CM', description: '', url: 'https://www.dailymotion.com/video/x7ch5x6', duration: 15, created_time: 1_540_000_000, views_total: 11_110, 'owner.id': 'x1abc', 'owner.screenname': 'Deaththekid200', 'owner.videos_total': 163, channel: 'shortfilms', language: 'ja' }
  const video = toDigVideo(row)
  assert.equal(video?.videoId, 'dailymotion:x7ch5x6')
  assert.equal(video?.channelVideos, 163)
  assert.equal(video?.categoryId, 'shortfilms')
  assert.equal(video?.declaredLang, 'ja')
  assert.equal(toDigVideo({ ...row, explicit: true }), null)
  assert.equal(toDigVideo({ ...row, private: true }), null)
  assert.equal(toDigVideo({ ...row, allow_embed: false }), null)
  assert.ok(SMALL_UPLOADER >= 500)
})

test('the drift\'s own door: a clean title, no live, no AI mark, one still album a batch', () => {
  const base = { provider: 'dailymotion' as const, url: 'u', seconds: 30, live: false }
  const videos = [
    { ...base, videoId: 'dailymotion:a', title: 'Old Japanese TV commercial 1988' },
    { ...base, videoId: 'dailymotion:b', title: 'Live stream now', live: true },
    { ...base, videoId: 'dailymotion:c', title: 'AI generated city flythrough', description: 'made with ai' },
    { ...base, videoId: 'dailymotion:d', title: 'Song - full album' },
    { ...base, videoId: 'dailymotion:e', title: 'Another song (official audio)' },
    { ...base, videoId: 'dailymotion:f', title: 'hot girls onlyfans leaked' },
  ]
  const verdict = driftDoor(videos)
  assert.deepEqual(verdict.kept.map((video) => video.videoId), ['dailymotion:a', 'dailymotion:d'])
  assert.deepEqual(verdict.refused, { direct: 1, IA: 1, 'album sans image': 1, titre: 1 })
})
