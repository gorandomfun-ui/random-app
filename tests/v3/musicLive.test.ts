import assert from 'node:assert/strict'
import test from 'node:test'

import { liveQueriesForDay } from '../../lib/v3/music/live'

const DAY = new Date('2026-09-27T11:40:00Z')

test('a day asks the same live music queries all day, other ones the next day', () => {
  const counts = { dailymotion: 16, youtubeLive: 7, youtubeClips: 3 }
  const today = liveQueriesForDay(DAY, counts)
  assert.deepEqual(liveQueriesForDay(new Date('2026-09-27T20:00:00Z'), counts), today)
  const tomorrow = liveQueriesForDay(new Date('2026-09-28T11:40:00Z'), counts)
  assert.notDeepEqual(tomorrow.dailymotion, today.dailymotion)
  assert.equal(today.dailymotion.length, 16)
  assert.equal(today.youtube.filter((search) => search.kind === 'live').length, 7)
  assert.equal(today.youtube.filter((search) => search.kind === 'clip').length, 3)
  assert.equal(new Set(today.dailymotion).size, 16, 'no query twice')
})

test('the queries read like concerts and clips, never like a stream or a playlist', () => {
  const seen = new Set<string>()
  for (let offset = 0; offset < 30; offset += 1) {
    const plan = liveQueriesForDay(new Date(DAY.getTime() + offset * 86_400_000), { dailymotion: 16, youtubeLive: 7, youtubeClips: 3 })
    for (const query of [...plan.dailymotion, ...plan.youtube.map((search) => search.query)]) {
      assert.ok(!/stream|playlist|lyrics|karaoke|full album/i.test(query), query)
      seen.add(query)
    }
    for (const clip of plan.youtube.filter((search) => search.kind === 'clip')) assert.match(clip.query, /2026/)
  }
  assert.ok(seen.size > 600, `${seen.size} different queries in a month`)
})
