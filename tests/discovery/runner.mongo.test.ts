import test from 'node:test'
import assert from 'node:assert/strict'
import { MongoClient } from 'mongodb'
import { randomUUID } from 'node:crypto'
import { acquireDiscoveryRun, releaseDiscoveryRun } from '../../lib/discovery/runner'
import { enqueue, runExploration, type DiscoveryTask } from '../../lib/discovery/exploration'
import { seeded } from '../../lib/discovery/random'

const uri = process.env.RANDOM_TEST_MONGO_URI
const quota = { searchDailyLimit: 100, otherDailyLimit: 10000, searchBaseReserve: 100, otherBaseReserve: 0, extraSearchLimit: 20 }
const timestamp = Date.UTC(2026, 8, 13)
const dm = { kind: 'dailymotion' as const, query: 'South Park', after: '2005-01-01T00:00:00.000Z', before: '2026-10-01T00:00:00.000Z', sort: 'relevance' as const }
async function isolated(run: (db: ReturnType<MongoClient['db']>) => Promise<void>) {
  const client = new MongoClient(uri!, { serverSelectionTimeoutMS: 5000 })
  const db = client.db(`random_discovery_test_${randomUUID().replaceAll('-', '')}`)
  try { await run(db) } finally { await db.dropDatabase(); await client.close() }
}

test('MongoDB: only one direct runner acquires the lease; stale owners cannot release its successor', { skip: !uri }, async () => {
  await isolated(async db => {
    const locks = await Promise.all(Array.from({ length: 6 }, () => acquireDiscoveryRun(db, 60000, timestamp)))
    const active = locks.filter((x): x is string => x != null)
    assert.equal(active.length, 1)
    const successor = await acquireDiscoveryRun(db, 60000, timestamp + 180001)
    assert.ok(successor)
    await releaseDiscoveryRun(db, active[0])
    assert.equal(await acquireDiscoveryRun(db, 60000, timestamp + 180002), null)
    await releaseDiscoveryRun(db, successor)
    assert.ok(await acquireDiscoveryRun(db, 60000, timestamp + 180003))
  })
})

test('MongoDB: exhausted YouTube search quota preserves cheap playlist work and leaves Dailymotion runnable', { skip: !uri }, async () => {
  const previous = process.env.RANDOM_DM_DISCOVERY_ENABLED
  process.env.RANDOM_DM_DISCOVERY_ENABLED = '1'
  try { await isolated(async db => {
    let clock = timestamp
    const seen: string[] = []
    await enqueue(db, { kind: 'search', query: 'Johnny', language: 'fr', order: 'date', after: dm.after, before: dm.before }, 0, false, clock)
    await enqueue(db, { kind: 'playlist', playlistId: 'uploads' }, 0, false, clock)
    await enqueue(db, dm, 0, false, clock)
    const options = { db, quota, random: seeded(1), now: () => { clock += 100; return clock }, maxMs: 90000,
      loadPage: async (task: DiscoveryTask, _signal: AbortSignal, permit: (bucket: 'search' | 'other') => Promise<boolean>) => {
        const bucket = task.spec.kind === 'playlist' ? 'other' : 'search'
        if (!await permit(bucket)) throw new Error('quota-exhausted')
        seen.push(task.spec.kind)
        return { videos: [{ provider: task.spec.kind === 'dailymotion' ? 'dailymotion' as const : 'youtube' as const,
          videoId: task._id, url: 'https://example.invalid/video' }], children: [] }
      }, ingest: async (videos: unknown[]) => ({ inserted: videos.length }),
    }
    const yt = await runExploration({ ...options, provider: 'youtube' })
    assert.equal(yt.quotaDenied, 1); assert.equal(yt.failures, 0); assert.equal(yt.inserted, 1)
    assert.deepEqual(seen, ['playlist'])
    const daily = await runExploration({ ...options, quota: undefined, provider: 'dailymotion' })
    assert.equal(daily.inserted, 1); assert.deepEqual(seen, ['playlist', 'dailymotion'])
  }) } finally { previous === undefined ? delete process.env.RANDOM_DM_DISCOVERY_ENABLED : process.env.RANDOM_DM_DISCOVERY_ENABLED = previous }
})

test('MongoDB: slow provider is stopped after three errors without blocking the other queue', { skip: !uri }, async () => {
  const previous = process.env.RANDOM_DM_DISCOVERY_ENABLED
  process.env.RANDOM_DM_DISCOVERY_ENABLED = '1'
  try { await isolated(async db => {
    let clock = timestamp, attempts = 0
    for (let i = 0; i < 10; i++) await enqueue(db, { kind: 'channel', channelId: `channel${i}` }, 0, false, clock)
    await enqueue(db, dm, 0, false, clock)
    const result = await runExploration({ db, quota, random: seeded(1), now: () => { clock += 100; return clock }, maxMs: 90000,
      loadPage: async task => {
        if (task.spec.kind !== 'dailymotion') { attempts++; throw new DOMException('upstream slow', 'TimeoutError') }
        return { videos: [{ provider: 'dailymotion', videoId: 'dm-one', url: 'https://example.invalid' }], children: [] }
      }, ingest: async videos => ({ inserted: videos.length }),
    })
    assert.equal(attempts, 3); assert.equal(result.errors.timeout, 3); assert.equal(result.inserted, 1)
  }) } finally { previous === undefined ? delete process.env.RANDOM_DM_DISCOVERY_ENABLED : process.env.RANDOM_DM_DISCOVERY_ENABLED = previous }
})

test('MongoDB: stopping a provider request retains its cursor for the next runner', { skip: !uri }, async () => {
  await isolated(async db => {
    await enqueue(db, { kind: 'playlist', playlistId: 'resume' }, 0, false, timestamp)
    await db.collection('discovery_tasks_v2').updateOne({}, { $set: { cursor: 'page-two', pages: 1 } })
    const controller = new AbortController()
    const result = await runExploration({ db, quota, random: seeded(1), now: () => timestamp + 1, provider: 'youtube', signal: controller.signal,
      loadPage: async task => { assert.equal(task.cursor, 'page-two'); controller.abort(); throw controller.signal.reason },
      ingest: async () => { throw new Error('Must not insert') },
    })
    assert.equal(result.stopReason, 'cancelled')
    const task = await db.collection('discovery_tasks_v2').findOne({})
    assert.equal(task?.cursor, 'page-two'); assert.equal(task?.leaseUntil.getTime(), 0)
    assert.equal(task?.attempts, 0)
  })
})
