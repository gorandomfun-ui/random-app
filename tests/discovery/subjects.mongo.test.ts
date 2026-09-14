import test from 'node:test'
import assert from 'node:assert/strict'
import { MongoClient } from 'mongodb'
import { randomUUID } from 'node:crypto'
import { buildProfile } from '../../lib/discovery/profile'
import { loadWave, installDiscoveryIndexes } from '../../lib/discovery/mongo'
import { enqueueOwnerExploration, createSubjectSearches } from '../../lib/discovery/subjectExploration'
import { installOwnerIndexes, saveOwnerReference } from '../../lib/discovery/ownerStore'
import { curatorOwnerId } from '../../lib/discovery/curatorAuth'
import { enqueue, runExploration, type DiscoveryTask } from '../../lib/discovery/exploration'
import { seeded } from '../../lib/discovery/random'
import type { RawVideo } from '../../lib/ingest/videos'

const uri = process.env.RANDOM_TEST_MONGO_URI
const now = Date.UTC(2026, 8, 13)
const quota = { searchDailyLimit: 100, otherDailyLimit: 10000, searchBaseReserve: 0, otherBaseReserve: 0, extraSearchLimit: 20 }
const oldRow = (title: string, type: string, i: number) => {
  const profile = buildProfile({ title }); delete profile.subject
  return { title, type, provider: type === 'video' ? 'youtube' : 'fixture', url: `https://example.invalid/${i}`, sourceMetadata: { title },
    discoveryVersion: 2, discoveryProfile: profile, discoveryFamily: profile.family, rand: seeded(i)() }
}

test('Mongo: a rare South Park trio is retrieved among 1200 park/south distractors using existing indexes and legacy profiles', { skip: !uri }, async () => {
  const client = new MongoClient(uri!), db = client.db(`random_subject_test_${randomUUID().replaceAll('-', '')}`)
  try {
    await installDiscoveryIndexes(db)
    await db.collection('items').insertMany(Array.from({ length: 1200 }, (_, i) => oldRow(
      i % 2 ? 'City park funny animation' : 'South London classroom scene', i % 3 ? 'video' : 'image', i)))
    const anchor = await db.collection('items').insertOne(oldRow('South Park GIF', 'image', 1300))
    await db.collection('items').insertMany([oldRow('South Park classroom scene', 'video', 1301),
      { ...oldRow('South Park : qui est Cartman ?', 'fact', 1302), variant: 'quiz' },
      oldRow('South Park fan art', 'image', 1303)])
    const wave = await loadWave(db, String(anchor.insertedId), 'fr', ['video', 'image', 'fact'], row => String(row.title), seeded(2), now)
    assert.ok(wave?.plan.ready)
    assert.equal(wave.plan.trio.length, 3)
    assert.equal(wave.diagnostics.subjectKey, 'entity:south park')
    assert.ok(wave.diagnostics.sampled <= 5, JSON.stringify(wave.diagnostics))
    assert.ok(wave.plan.trio.every(x => x.profile.subject?.primary?.key === 'entity:south park'))
    const unchanged = await db.collection('items').findOne({ _id: anchor.insertedId })
    assert.equal(unchanged?.discoveryProfile.subject, undefined)
  } finally { await db.dropDatabase(); await client.close() }
})

test('Mongo: active existing likes seed subject searches without a new like; scheduling refreshes only that reference', { skip: !uri }, async () => {
  const client = new MongoClient(uri!), db = client.db(`random_subject_test_${randomUUID().replaceAll('-', '')}`)
  try {
    await installOwnerIndexes(db)
    const source = oldRow('Johnny Hallyday moto désert', 'video', 1)
    const row = await db.collection('items').insertOne(source)
    await saveOwnerReference(db, { ownerId: curatorOwnerId(), contentKey: 'source:johnny', itemId: String(row.insertedId), active: true,
      familyId: 'music', type: 'video', version: 2, profile: source.discoveryProfile })
    const before = await db.collection('discovery_owner_references_v2').findOne({ contentKey: 'source:johnny' })
    assert.equal(await enqueueOwnerExploration(db, now, 5), 2)
    const tasks = await db.collection<DiscoveryTask>('discovery_tasks_v2').find({}).toArray()
    assert.ok(tasks.every(t => t.spec.kind === 'search' && t.spec.focus?.referenceKey === 'source:johnny'))
    assert.ok(tasks.some(t => t.spec.focus?.branch === 'primary'))
    assert.ok(tasks.every(t => t.spec.focus?.branch === 'primary')) // First rotation prioritises the main subject.
    const refreshed = await db.collection('discovery_owner_references_v2').findOne({ contentKey: 'source:johnny' })
    assert.equal(refreshed?.active, before?.active)
    assert.equal(refreshed?.contentKey, before?.contentKey)
    assert.equal(refreshed?.explorationRotation.youtube, 1)
    assert.equal(refreshed?.profile.subject.primary.key, 'entity:johnny hallyday')
    await db.collection('discovery_owner_references_v2').updateMany({}, { $set: { active: false } })
    assert.equal(await enqueueOwnerExploration(db, now, 6), 0)
  } finally { await db.dropDatabase(); await client.close() }
})

test('Mongo: owner descendants ingest real subject matches, preserve base ingestion and stop after unlike', { skip: !uri }, async () => {
  const client = new MongoClient(uri!), db = client.db(`random_subject_test_${randomUUID().replaceAll('-', '')}`)
  try {
    const profile = buildProfile({ title: 'Johnny Hallyday' }), scope = { ownerId: 'owner', referenceKey: 'source:johnny' }
    await saveOwnerReference(db, { ...scope, contentKey: scope.referenceKey, active: true, familyId: 'music', profile, type: 'video', version: 2 })
    const spec = createSubjectSearches(profile, scope, now, 0)[0]
    await enqueue(db, spec, 0, true, now)
    let clock = now, called = 0
    const ingested: RawVideo[] = []
    const report = await runExploration({ db, quota, random: seeded(1), now: () => clock, maxMs: 30000,
      loadPage: async (_task, _signal, permit) => {
        called++; assert.ok(await permit('search')); clock += 16000
        return { children: [], videos: [
          { provider: 'youtube', videoId: 'aaaaaaaaaaa', url: 'https://youtu.be/aaaaaaaaaaa', title: 'Johnny Hallyday collection', viewCount: 10 },
          { provider: 'youtube', videoId: 'bbbbbbbbbbb', url: 'https://youtu.be/bbbbbbbbbbb', title: 'Football gameplay', contextQueries: ['Johnny Hallyday'] },
        ] }
      }, ingest: async videos => { ingested.push(...videos); return { inserted: videos.length } },
    })
    assert.equal(report.inserted, 1); assert.equal(called, 1)
    assert.equal(ingested[0].videoId, 'aaaaaaaaaaa')
    await db.collection('discovery_owner_references_v2').updateMany({}, { $set: { active: false } })
    await db.collection('discovery_tasks_v2').updateMany({}, { $set: { due: new Date(now), leaseUntil: new Date(0) } })
    clock = now
    await runExploration({ db, quota, random: seeded(1), now: () => clock, maxMs: 30000,
      loadPage: async () => { throw new Error('Upstream must not run after unlike') }, ingest: async () => { throw new Error('Must not ingest') } })
    const task = await db.collection('discovery_tasks_v2').findOne({})
    assert.ok(task!.due.getTime() > now)
    assert.equal(task!.attempts, 1)
  } finally { await db.dropDatabase(); await client.close() }
})
