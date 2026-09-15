import test from 'node:test'
import assert from 'node:assert/strict'
import { youtubeBudget, youtubeQuotaWindow } from '../../lib/discovery/youtubeBudget'
import { withRetroYouTubeBudget, youtubeRequestPurpose, isYouTubeQuotaResponse } from '../../lib/ingest/youtubeQuota'
import { retroSearchPlan, youtubeSearchBatch } from '../../lib/ingest/retroSearchPlan'

const config = { searchDailyLimit: 100, otherDailyLimit: 10000, searchBaseReserve: 80,
  otherBaseReserve: 9000, extraSearchLimit: 20, pacing: true }
const morning = Date.parse('2026-09-15T10:00:00Z'), evening = Date.parse('2026-09-15T20:00:00Z')

test('YouTube allowance is cumulative across retries and preserves an evening share in both quota buckets', () => {
  const a = youtubeBudget(config, 'search', morning, true), b = youtubeBudget(config, 'search', evening, true)
  assert.equal(a.day, b.day)
  assert.deepEqual([a.released, a.base, a.extra, a.protectedReleased], [50, 40, 10, 8])
  assert.deepEqual([b.released, b.base, b.extra, b.protectedReleased], [100, 80, 20, 16])
  assert.deepEqual(youtubeBudget(config, 'search', morning + 3600000, true), a, 'a manual retry does not unlock another allocation')
  const other = youtubeBudget(config, 'other', morning, true)
  assert.equal(other.released, 5000); assert.equal(other.protectedReleased, 4)
  assert.equal(youtubeBudget(config, 'other', evening, true).protectedReleased, 8)
  assert.equal(youtubeBudget({ ...config, pacing: false }, 'search', morning, true).released, 100)
})
test('Pacific quota day and noon release handle winter/summer time and reset exactly once', () => {
  assert.deepEqual(youtubeQuotaWindow(Date.parse('2026-09-15T06:59:59Z')), { day: '2026-09-14', afternoon: true })
  assert.deepEqual(youtubeQuotaWindow(Date.parse('2026-09-15T07:00:00Z')), { day: '2026-09-15', afternoon: false })
  assert.equal(youtubeQuotaWindow(Date.parse('2026-09-15T18:59:59Z')).afternoon, false)
  assert.equal(youtubeQuotaWindow(Date.parse('2026-09-15T19:00:00Z')).afternoon, true)
  assert.equal(youtubeQuotaWindow(Date.parse('2026-12-15T19:59:59Z')).afternoon, false)
  assert.equal(youtubeQuotaWindow(Date.parse('2026-12-15T20:00:00Z')).afternoon, true)
})
test('retro scope survives awaits without classifying concurrent keyword/details requests as retro', async () => {
  const search = new URL('https://www.googleapis.com/youtube/v3/search')
  const [retro, general] = await Promise.all([
    withRetroYouTubeBudget(async () => { await new Promise(r => setTimeout(r, 10)); return youtubeRequestPurpose(search) }),
    (async () => { await new Promise(r => setTimeout(r, 2)); return youtubeRequestPurpose(search) })(),
  ])
  assert.equal(retro, 'retro'); assert.equal(general, 'general')
  assert.equal(youtubeRequestPurpose(search), 'general')
  assert.equal(youtubeRequestPurpose(new URL('https://www.googleapis.com/youtube/v3/videos?chart=mostPopular')), 'trends')
  assert.equal(await withRetroYouTubeBudget(async () => youtubeRequestPurpose(new URL('https://www.googleapis.com/youtube/v3/videos?id=x'))), 'general')
})
test('real YouTube quota exhaustion is distinguished from authorization and rate-limit errors', () => {
  const body = (reason: string) => JSON.stringify({ error: { errors: [{ reason }] } })
  assert.ok(isYouTubeQuotaResponse(403, body('quotaExceeded')))
  assert.ok(isYouTubeQuotaResponse(403, body('dailyLimitExceeded')))
  assert.equal(isYouTubeQuotaResponse(403, body('forbidden')), false)
  assert.equal(isYouTubeQuotaResponse(429, body('quotaExceeded')), false)
  assert.equal(isYouTubeQuotaResponse(403, 'invalid json'), false)
})
test('retro planning varies periods, themes and search ranking without requiring broadcast or full episodes', () => {
  const a = retroSearchPlan(10, morning), b = retroSearchPlan(10, evening)
  assert.notDeepEqual(a.queries, b.queries); assert.equal(a.order, 'viewCount'); assert.equal(b.order, 'relevance')
  assert.equal(a.queries.length, 10)
  const month = Array.from({ length: 30 }, (_, day) => retroSearchPlan(10, morning + day * 86400000).queries).flat()
  for (const theme of ['home video', 'vintage advertising', 'music performance', 'sports recap', 'retro gaming arcade']) {
    assert.ok(month.some(q => q.startsWith(theme)), theme)
  }
  assert.ok(month.every(q => !/full episode|broadcast$/.test(q)))
  assert.deepEqual(youtubeSearchBatch(8, 3, true), { per: 50, pages: 1, concurrency: 4, timeout: 25000 })
  assert.equal(youtubeSearchBatch(12, 2, false).per, 12, 'manual non-fast requests retain their requested size')
})
