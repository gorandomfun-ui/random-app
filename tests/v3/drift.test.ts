import assert from 'node:assert/strict'
import test from 'node:test'

import { toDigVideo } from '../../lib/v3/dig/dailymotion'
import { driftDoor, SMALL_UPLOADER, UPLOADER_VIDEOS, UPLOADERS_PER_RUN } from '../../lib/v3/ingest/lines/drift'

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
  // Twenty videos an uploader, forty uploaders a run (the owner, 10 October): no channel gives a hundred in a day any more.
  assert.equal(UPLOADER_VIDEOS, 20)
  assert.ok(UPLOADERS_PER_RUN * UPLOADER_VIDEOS >= 15 * 50, 'the volume kept')
})

test('the drift\'s own door: a clean title, no live, no AI mark, no celebrity news, one still album and two let\'s plays a batch', () => {
  const base = { provider: 'dailymotion' as const, url: 'u', seconds: 30, live: false }
  const videos = [
    { ...base, videoId: 'dailymotion:a', title: 'Old Japanese TV commercial 1988' },
    { ...base, videoId: 'dailymotion:b', title: 'Live stream now', live: true },
    { ...base, videoId: 'dailymotion:c', title: 'AI generated city flythrough', description: 'made with ai' },
    { ...base, videoId: 'dailymotion:d', title: 'Song - full album' },
    { ...base, videoId: 'dailymotion:e', title: 'Another song (official audio)' },
    { ...base, videoId: 'dailymotion:f', title: 'hot girls onlyfans leaked' },
    { ...base, videoId: 'dailymotion:g', title: 'Singer announces divorce after ten years' },
    { ...base, videoId: 'dailymotion:h', title: "Let's play Minecraft episode 1" },
    { ...base, videoId: 'dailymotion:i', title: "Let's play Minecraft episode 2" },
    { ...base, videoId: 'dailymotion:j', title: "Let's play Minecraft episode 3" },
  ]
  const verdict = driftDoor(videos)
  assert.deepEqual(verdict.kept.map((video) => video.videoId), ['dailymotion:a', 'dailymotion:d', 'dailymotion:h', 'dailymotion:i'])
  assert.deepEqual(verdict.refused, { direct: 1, IA: 1, 'album sans image': 1, titre: 1, 'actu people': 1, "let's play": 1 })
})
