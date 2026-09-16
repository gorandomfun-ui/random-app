import test, { before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { ObjectId } from 'mongodb'

/**
 * The rule that matters in 1.4: one report blocks a video for a few hours, but
 * only a consensus of distinct addresses (or a server-side check) retires it.
 *
 * Run with: node --env-file=.env.local --import tsx --test tests/v3/videoError.mongo.test.ts
 */

const uri = process.env.MONGODB_URI || process.env.MONGO_URI
const testDb = `${process.env.MONGODB_DB || process.env.MONGO_DB || 'randomapp'}_test`

if (uri) {
  process.env.MONGODB_DB = testDb
  process.env.MONGO_DB = testDb
}
// Keeps the route away from the YouTube API: this file only covers the
// consensus rule, and a real videos.list call would spend quota.
delete process.env.YOUTUBE_API_KEY

const skip = uri ? false : 'MONGODB_URI is not set'

let post: (request: Request) => Promise<Response>
let database: import('mongodb').Db
let rateLimit: typeof import('@/lib/v3/rateLimit')

const VIDEO_ID = new ObjectId()

function report(ip: string): Request {
  return new Request('https://example.test/api/feedback/video-error', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ itemId: VIDEO_ID.toHexString(), reason: 'video-error' }),
  })
}

async function storedVideo() {
  const doc = await database.collection('items').findOne({ _id: VIDEO_ID })
  assert.ok(doc, 'the test video must still exist')
  return doc
}

before(async () => {
  if (!uri) return
  rateLimit = await import('@/lib/v3/rateLimit')
  const { getDatabase } = await import('@/lib/mongodb')
  database = await getDatabase()
  assert.equal(database.databaseName, testDb, 'the tests must never write to the production database')
  post = (await import('@/app/api/feedback/video-error/route')).POST
})

beforeEach(async () => {
  if (!uri) return
  await database.collection(rateLimit.RATE_LIMIT_COLLECTION).deleteMany({})
  await database.collection(rateLimit.FEEDBACK_EFFECT_COLLECTION).deleteMany({})
  await database.collection('items').deleteOne({ _id: VIDEO_ID })
  await database.collection('items').insertOne({
    _id: VIDEO_ID,
    type: 'video',
    provider: 'youtube',
    videoId: 'dQw4w9WgXcQ',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Test video for the video-error endpoint',
  })
})

after(async () => {
  if (!uri) return
  await database.collection('items').deleteOne({ _id: VIDEO_ID })
  await database.collection(rateLimit.RATE_LIMIT_COLLECTION).deleteMany({})
  await database.collection(rateLimit.FEEDBACK_EFFECT_COLLECTION).deleteMany({})
  const mongoModule = (await import('@/lib/db')) as { default: Promise<{ close: () => Promise<void> }> }
  await (await mongoModule.default).close()
})

test('a single report blocks the video for a few hours but never retires it', { skip }, async () => {
  const response = await post(report('203.0.113.201'))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true, obsolete: false })

  const video = await storedVideo()
  assert.equal(video.obsoleteVideoStatus, undefined, 'one report must not retire a video')
  assert.equal(video.obsoleteVideoRuntimeSuspect, true)
  assert.equal(video.obsoleteVideoRuntimeDistinctReporters, 1)

  const blockedUntil = video.obsoleteVideoRuntimeBlockedUntil as Date
  const blockMs = blockedUntil.getTime() - Date.now()
  assert.ok(blockMs > 0, 'the video must be blocked')
  assert.ok(blockMs <= 6 * 60 * 60 * 1000 + 5_000, 'a single report may block for at most six hours')
})

test('a player code that used to retire a video on its own no longer does', { skip }, async () => {
  const request = new Request('https://example.test/api/feedback/video-error', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.202' },
    body: JSON.stringify({ itemId: VIDEO_ID.toHexString(), reason: 'video-error', playerCode: 150 }),
  })
  const response = await post(request)
  assert.equal(response.status, 200)

  const video = await storedVideo()
  assert.equal(video.obsoleteVideoStatus, undefined, 'player code 150 alone must not retire a video')
  assert.equal(video.obsoleteVideoRuntimePermanentSignal, true, 'the signal is still recorded')
  const blockMs = (video.obsoleteVideoRuntimeBlockedUntil as Date).getTime() - Date.now()
  assert.ok(blockMs <= 6 * 60 * 60 * 1000 + 5_000, 'it may no longer cause a thirty-day block')
})

test('three distinct addresses within 24 h retire the video', { skip }, async () => {
  for (const ip of ['203.0.113.211', '203.0.113.212']) {
    await post(report(ip))
    const stillActive = await storedVideo()
    assert.equal(stillActive.obsoleteVideoStatus, undefined, `${ip} must not be enough`)
  }

  const response = await post(report('203.0.113.213'))
  assert.deepEqual(await response.json(), { success: true, obsolete: true })

  const video = await storedVideo()
  assert.equal(video.obsoleteVideoStatus, 'obsolete')
  assert.equal(video.obsoleteVideoReason, 'runtime-consensus-3-ips')
})

test('the same address reporting many times never reaches the consensus', { skip }, async () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await post(report('203.0.113.220'))
  }
  const video = await storedVideo()
  assert.equal(video.obsoleteVideoStatus, undefined, 'one address cannot retire a video by insisting')
  assert.equal(video.obsoleteVideoRuntimeDistinctReporters, 1)
})

test('the 21st report from one address in an hour is refused', { skip }, async () => {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const accepted = await post(report('203.0.113.230'))
    assert.equal(accepted.status, 200, `report ${attempt} should be accepted`)
  }
  const refused = await post(report('203.0.113.230'))
  assert.equal(refused.status, 429)
})
