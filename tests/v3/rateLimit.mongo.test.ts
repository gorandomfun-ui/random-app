import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'

/**
 * Exercises the bounds put on the public feedback endpoints.
 *
 * Writes go to `${MONGODB_DB}_test` on the same cluster, never to the
 * production database. Run with the environment loaded:
 *   node --env-file=.env.local --import tsx --test tests/v3/rateLimit.mongo.test.ts
 * Without MONGODB_URI the whole file is skipped.
 */

const uri = process.env.MONGODB_URI || process.env.MONGO_URI
const productionDb = process.env.MONGODB_DB || process.env.MONGO_DB || 'randomapp'
const testDb = `${productionDb}_test`

if (uri) {
  process.env.MONGODB_DB = testDb
  process.env.MONGO_DB = testDb
}

const skip = uri ? false : 'MONGODB_URI is not set'

type RateLimitModule = typeof import('@/lib/v3/rateLimit')

let rateLimit: RateLimitModule
let database: import('mongodb').Db

function requestFrom(ip: string): Request {
  return new Request('https://example.test/api/feedback/video-error', {
    method: 'POST',
    headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` },
  })
}

before(async () => {
  if (!uri) return
  rateLimit = await import('@/lib/v3/rateLimit')
  const { getDatabase } = await import('@/lib/mongodb')
  database = await getDatabase()
  assert.equal(database.databaseName, testDb, 'the tests must never write to the production database')
  await database.collection(rateLimit.RATE_LIMIT_COLLECTION).deleteMany({})
  await database.collection(rateLimit.FEEDBACK_EFFECT_COLLECTION).deleteMany({})
})

after(async () => {
  if (!uri) return
  await database.collection(rateLimit.RATE_LIMIT_COLLECTION).deleteMany({})
  await database.collection(rateLimit.FEEDBACK_EFFECT_COLLECTION).deleteMany({})
  const mongoModule = (await import('@/lib/db')) as { default: Promise<{ close: () => Promise<void> }> }
  await (await mongoModule.default).close()
})

test('video-error accepts 20 reports per address per hour and refuses the 21st', { skip }, async () => {
  const request = requestFrom('203.0.113.10')
  const options = { req: request, route: 'feedback/video-error', limit: 20, windowMs: 60 * 60 * 1000 }

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const decision = await rateLimit.consumeRateLimit(options)
    assert.equal(decision.allowed, true, `report ${attempt} should be accepted`)
    assert.equal(decision.count, attempt)
  }

  const refused = await rateLimit.consumeRateLimit(options)
  assert.equal(refused.allowed, false, 'the 21st report in the hour must be refused')
  assert.equal(refused.count, 21)
})

test('another address keeps its own budget', { skip }, async () => {
  const options = { route: 'feedback/video-error', limit: 20, windowMs: 60 * 60 * 1000 }
  const first = await rateLimit.consumeRateLimit({ ...options, req: requestFrom('203.0.113.11') })
  const second = await rateLimit.consumeRateLimit({ ...options, req: requestFrom('203.0.113.12') })
  assert.equal(first.count, 1)
  assert.equal(second.count, 1)
})

test('the counter resets on the next window', { skip }, async () => {
  const req = requestFrom('203.0.113.13')
  const windowMs = 60 * 60 * 1000
  const now = Date.now()
  const inWindow = await rateLimit.consumeRateLimit({ req, route: 'feedback/dislike', limit: 60, windowMs, now })
  const nextWindow = await rateLimit.consumeRateLimit({ req, route: 'feedback/dislike', limit: 60, windowMs, now: now + windowMs })
  assert.equal(inWindow.count, 1)
  assert.equal(nextWindow.count, 1, 'a new window starts from zero')
})

test('one address counts once per item, and distinct addresses are counted', { skip }, async () => {
  const scope = `video-error:test-item-${Date.now()}`

  const firstReport = await rateLimit.registerFeedbackEffect({ req: requestFrom('198.51.100.1'), scope })
  assert.equal(firstReport.first, true)
  assert.equal(firstReport.distinctIps, 1)

  const repeat = await rateLimit.registerFeedbackEffect({ req: requestFrom('198.51.100.1'), scope })
  assert.equal(repeat.first, false, 'the same address must not count twice')
  assert.equal(repeat.distinctIps, 1)

  const second = await rateLimit.registerFeedbackEffect({ req: requestFrom('198.51.100.2'), scope })
  assert.equal(second.distinctIps, 2)

  const third = await rateLimit.registerFeedbackEffect({ req: requestFrom('198.51.100.3'), scope })
  assert.equal(third.first, true)
  assert.equal(third.distinctIps, 3, 'three distinct addresses are what unlocks retirement')
})

test('releasing an effect lets the same address act again', { skip }, async () => {
  const scope = `like:test-item-${Date.now()}`
  const req = requestFrom('198.51.100.9')

  assert.equal((await rateLimit.registerFeedbackEffect({ req, scope })).first, true)
  assert.equal((await rateLimit.registerFeedbackEffect({ req, scope })).first, false)

  await rateLimit.releaseFeedbackEffect({ req, scope })
  assert.equal(
    (await rateLimit.registerFeedbackEffect({ req, scope })).first,
    true,
    'unliking then liking again must count',
  )
})

test('the two collections carry a TTL index so nothing accumulates', { skip }, async () => {
  for (const name of [rateLimit.RATE_LIMIT_COLLECTION, rateLimit.FEEDBACK_EFFECT_COLLECTION]) {
    const indexes = await database.collection(name).indexes()
    const ttl = indexes.find((index) => index.name === 'ttl_expiresAt')
    assert.ok(ttl, `${name} must have a TTL index`)
    assert.equal(ttl?.expireAfterSeconds, 0)
  }
})

test('addresses are stored hashed, never in clear', { skip }, async () => {
  const ip = '198.51.100.77'
  await rateLimit.consumeRateLimit({
    req: requestFrom(ip),
    route: 'feedback/like',
    limit: 60,
    windowMs: 60 * 60 * 1000,
  })
  const documents = await database.collection(rateLimit.RATE_LIMIT_COLLECTION).find({}).toArray()
  const serialized = JSON.stringify(documents)
  assert.ok(!serialized.includes(ip), 'the raw address must not appear in the database')
})
