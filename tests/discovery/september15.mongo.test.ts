import test from 'node:test'
import assert from 'node:assert/strict'
import { MongoClient } from 'mongodb'
import { randomUUID } from 'node:crypto'
import { reserveDailymotionQuota } from '../../lib/discovery/dailymotion'
import { reserveQuota } from '../../lib/discovery/exploration'
const uri = process.env.RANDOM_TEST_MONGO_URI
test('Mongo: shared Dailymotion ceiling reserves maintenance capacity without raising the total budget', { skip: !uri }, async () => {
  const client = new MongoClient(uri!), db = client.db(`random_september15_test_${randomUUID().replaceAll('-', '')}`)
  const previous = process.env.RANDOM_DM_DISCOVERY_DAILY_LIMIT
  process.env.RANDOM_DM_DISCOVERY_DAILY_LIMIT = '60'
  try {
    const now = Date.UTC(2026, 8, 15)
    const explore = await Promise.all(Array.from({ length: 80 }, () => reserveDailymotionQuota(db, now)))
    assert.equal(explore.filter(Boolean).length, 56)
    const repair = await Promise.all(Array.from({ length: 12 }, () => reserveDailymotionQuota(db, now, 'maintenance')))
    assert.equal(repair.filter(Boolean).length, 4)
    assert.equal(await reserveDailymotionQuota(db, now), false)
    assert.equal((await db.collection('discovery_dm_quota_v2').findOne())?.spent, 60)
    const tomorrow = now + 86400000
    const earlyRepair = await Promise.all(Array.from({ length: 12 }, () => reserveDailymotionQuota(db, tomorrow, 'maintenance')))
    const laterExplore = await Promise.all(Array.from({ length: 80 }, () => reserveDailymotionQuota(db, tomorrow)))
    assert.equal(earlyRepair.filter(Boolean).length, 4)
    assert.equal(laterExplore.filter(Boolean).length, 56, 'maintenance-first must not reduce exploration twice')
  } finally {
    if (previous == null) delete process.env.RANDOM_DM_DISCOVERY_DAILY_LIMIT
    else process.env.RANDOM_DM_DISCOVERY_DAILY_LIMIT = previous
    await db.dropDatabase(); await client.close()
  }
})

test('Mongo: morning jobs/retries cannot spend evening or retro allocations; all actors share the same atomic ledger', { skip: !uri }, async () => {
  const client = new MongoClient(uri!), db = client.db(`random_youtube_pacing_${randomUUID().replaceAll('-', '')}`)
  const previous = process.env.RANDOM_DISCOVERY_WORKER_ENABLED
  process.env.RANDOM_DISCOVERY_WORKER_ENABLED = '1'
  const config = { searchDailyLimit: 100, otherDailyLimit: 10000, searchBaseReserve: 80,
    otherBaseReserve: 9000, extraSearchLimit: 20, pacing: true }
  const morning = Date.parse('2026-09-15T10:00:00Z'), evening = Date.parse('2026-09-15T20:00:00Z')
  const reserve = async (time: number, actor: 'base' | 'exploration', purpose: 'general' | 'retro' = 'general') =>
    (await Promise.all(Array.from({ length: 100 }, () => reserveQuota(db, config, 'search', actor, time, purpose)))).filter(Boolean).length
  try {
    // General work can use 40 base units only if 8 of them were retro. Keep those 8 protected.
    const earlyGeneral = await reserve(morning, 'base')
    const earlyExtra = await reserve(morning, 'exploration')
    const earlyRetro = await reserve(morning, 'base', 'retro')
    assert.equal(earlyRetro, 8)
    assert.equal(earlyGeneral + earlyExtra + earlyRetro, 50)
    assert.equal(await reserve(morning + 3600000, 'base'), 0)
    assert.equal(await reserve(morning + 3600000, 'exploration'), 0)
    assert.equal(await reserve(morning + 3600000, 'base', 'retro'), 0)
    assert.equal(await reserve(evening, 'base', 'retro'), 8)
    const lateGeneral = await reserve(evening, 'base'), lateExtra = await reserve(evening, 'exploration')
    assert.equal(lateGeneral + lateExtra, 42)
    assert.equal((await db.collection('discovery_quota_v2').findOne())?.spent, 100)
    assert.equal(await reserve(evening, 'base'), 0)
  } finally {
    if (previous == null) delete process.env.RANDOM_DISCOVERY_WORKER_ENABLED
    else process.env.RANDOM_DISCOVERY_WORKER_ENABLED = previous
    await db.dropDatabase(); await client.close()
  }
})
