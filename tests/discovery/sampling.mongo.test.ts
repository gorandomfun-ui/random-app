import test from 'node:test'
import assert from 'node:assert/strict'
import { MongoClient, ObjectId } from 'mongodb'
import { randomUUID } from 'node:crypto'
import { buildProfile } from '../../lib/discovery/profile'
import { selectPool, installDiscoveryIndexes } from '../../lib/discovery/mongo'
import { newSession, planDraw, commitDraw } from '../../lib/discovery/pool'
import { seeded } from '../../lib/discovery/random'
import { sampleCatalogue, sampleWindow, CATALOGUE_SAMPLE_SIZE } from '../../lib/discovery/sampling'

const uri = process.env.RANDOM_TEST_MONGO_URI
test('Mongo: broad cursor reaches a large skewed catalogue despite identical rand values, across fresh sessions', { skip: !uri }, async () => {
  const client = new MongoClient(uri!, { serverSelectionTimeoutMS: 5000 })
  const db = client.db(`random_sampling_test_${randomUUID().replaceAll('-', '')}`)
  try {
    const titles = ['Guitar concert', 'Walking tour in Tokyo', 'Stone carving workshop', 'Game speedrunning']
    const profiles = titles.map(title => buildProfile({ title }))
    const docs = Array.from({ length: 30000 }, (_, i) => ({
      _id: new ObjectId(), type: 'video', provider: 'youtube', videoId: `test-${i}`, title: titles[i % 4],
      sourceMetadata: { title: titles[i % 4] }, discoveryVersion: 2, discoveryProfile: profiles[i % 4],
      discoveryFamily: profiles[i % 4].family,
      // Deliberate adversarial legacy data: successor scans replay their first rows.
      ...(i % 5 ? { rand: .5 } : {}),
    }))
    const single = { ...docs[0], _id: new ObjectId(), videoId: 'singleton', title: 'Rare miniature exhibition',
      sourceMetadata: { title: 'Rare miniature exhibition' }, discoveryProfile: buildProfile({ title: 'Rare miniature exhibition' }),
      discoveryFamily: 'art', rand: .6, trendObservedAt: new Date() }
    await db.collection('items').insertMany([...docs, single])
    await installDiscoveryIndexes(db)
    await db.collection('items').createIndex({ type: 1, rand: 1 })
    const plan = await db.collection('items').aggregate([{ $sample: { size: CATALOGUE_SAMPLE_SIZE } },
      { $match: { type: 'video' } }, { $limit: 96 }]).explain('executionStats')
    assert.match(JSON.stringify(plan), /sampleFromRandomCursor/, 'large collection must use a random cursor, not a full sort')
    const sample = await sampleCatalogue(db, { type: 'video' })
    assert.ok(sample.some(row => row.rand === undefined), 'legacy documents without rand remain reachable')
    assert.equal((await sampleWindow(db, { type: 'video', discoveryFamily: 'art' }, { rand: { $gte: .7, $lt: .71 } }, 8)).length, 0)
    const rng = seeded(711), counts = new Map<string, number>(), durations: number[] = []
    let singletonHits = 0, nulls = 0, minimumSessionUnique = 150
    for (let session = 0; session < 4; session++) {
      let state = newSession(session)
      const unique = new Set<string>()
      for (let i = 0; i < 150; i++) {
        const ticket = planDraw(state, 'video'), start = performance.now()
        const selected = await selectPool(db, ticket, state, 'en', r => r.videoId, rng, Date.now())
        durations.push(performance.now() - start)
        if (!selected) { nulls++; continue }
        singletonHits += Number(selected.item.key === 'youtube:singleton')
        unique.add(selected.item.key)
        counts.set(selected.item.key, (counts.get(selected.item.key) ?? 0) + 1)
        state = session < 2 ? commitDraw(state, ticket, selected.item) : newSession(session * 150 + i)
      }
      minimumSessionUnique = Math.min(minimumSessionUnique, unique.size)
    }
    durations.sort((a, b) => a - b)
    assert.equal(nulls, 0)
    assert.ok(minimumSessionUnique >= 140, `worst session: ${minimumSessionUnique}/150 unique`)
    assert.ok(counts.size >= 550, `${counts.size}/600 unique across four independent sessions`)
    assert.ok(singletonHits <= 4, `${singletonHits} singleton appearances`)
    assert.ok(Math.max(...counts.values()) <= 4, 'no fixed recurring mini-pool across days')
    console.log(JSON.stringify({ simulation: 'real-mongo-skewed-catalogue', catalogue: 30001,
      draws: 600, independentSessions: 4, sessionsWithoutHistory: 2, unique: counts.size, minimumSessionUnique, singletonHits,
      selectionP95Ms: Math.round(durations[Math.floor(durations.length * .95)]), nulls }))
  } finally { await db.dropDatabase(); await client.close() }
})
