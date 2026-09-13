import test from 'node:test'
import assert from 'node:assert/strict'
import { MongoClient } from 'mongodb'
import { randomUUID } from 'node:crypto'
import { enqueue, runExploration } from '../../lib/discovery/exploration'
import { seeded } from '../../lib/discovery/random'

const uri = process.env.RANDOM_TEST_MONGO_URI
test('MongoDB: exploration rotates productive tasks and consumes whole pages without a genre rejection', { skip: !uri }, async () => {
  const client = new MongoClient(uri!, { serverSelectionTimeoutMS: 5000 })
  const db = client.db(`random_discovery_test_${randomUUID().replaceAll('-', '')}`)
  let clock = Date.UTC(2026, 8, 13)
  const calls: string[] = [], ingested: number[] = []
  try {
    for (const channelId of ['a', 'b', 'c']) await enqueue(db, { kind: 'channel', channelId }, 0, false, clock)
    const result = await runExploration({ db, random: seeded(3), maxMs: 180000, now: () => { clock += 1000; return clock },
      quota: { searchDailyLimit: 100, otherDailyLimit: 10000, searchBaseReserve: 80, otherBaseReserve: 9000, extraSearchLimit: 20 },
      loadPage: async task => {
        calls.push(task._id)
        return { videos: Array.from({ length: 50 }, (_, i) => ({ provider: 'youtube', videoId: `id${i}`, url: `https://example.invalid/${i}`, title: 'Walking tour' })),
          nextCursor: `page-${task.pages + 1}`, children: [] }
      },
      ingest: async videos => { ingested.push(videos.length); return { inserted: videos.length } },
    })
    assert.ok(result.pages >= 6)
    assert.equal(new Set(calls.slice(0, 6)).size, 3)
    assert.ok(ingested.every(count => count === 50))
    assert.equal(result.inserted, result.pages * 50)
    assert.equal(result.failures, 0)
  } finally { await db.dropDatabase(); await client.close() }
})
test('MongoDB: a single productive exploration task remains usable after two pages', { skip: !uri }, async () => {
  const client = new MongoClient(uri!, { serverSelectionTimeoutMS: 5000 })
  const db = client.db(`random_discovery_test_${randomUUID().replaceAll('-', '')}`)
  let clock = Date.UTC(2026, 8, 13)
  try {
    await enqueue(db, { kind: 'playlist', playlistId: 'one-productive-route' }, 0, false, clock)
    const result = await runExploration({ db, random: seeded(4), maxMs: 180000, now: () => { clock += 1000; return clock },
      quota: { searchDailyLimit: 100, otherDailyLimit: 10000, searchBaseReserve: 80, otherBaseReserve: 9000, extraSearchLimit: 20 },
      loadPage: async task => ({ videos: [{ provider: 'youtube', videoId: `id${task.pages}`, url: 'https://example.invalid/video', title: 'Walking tour' }],
        nextCursor: task.pages < 5 ? `page-${task.pages + 1}` : undefined, children: [] }),
      ingest: async videos => ({ inserted: videos.length }),
    })
    assert.equal(result.pages, 6)
    assert.equal(result.inserted, 6)
  } finally { await db.dropDatabase(); await client.close() }
})
