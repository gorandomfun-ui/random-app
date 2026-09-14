import test from 'node:test'
import assert from 'node:assert/strict'
import { MongoClient, ObjectId, type Db } from 'mongodb'
import { randomUUID } from 'node:crypto'
import { buildProfile } from '../../lib/discovery/profile'
import { enqueueOwnerExploration } from '../../lib/discovery/subjectExploration'
import { saveOwnerReference, installOwnerIndexes } from '../../lib/discovery/ownerStore'
import { installDiscoveryIndexes, selectPool, loadWave } from '../../lib/discovery/mongo'
import { curatorOwnerId } from '../../lib/discovery/curatorAuth'
import { seeded } from '../../lib/discovery/random'
import { newSession, planDraw } from '../../lib/discovery/pool'
import { enqueue, runExploration, reserveQuota, quotaDay } from '../../lib/discovery/exploration'
import { ProviderQuotaError } from '../../lib/discovery/providerErrors'
import { waveHandler } from '../../lib/discovery/handlers'

const uri = process.env.RANDOM_TEST_MONGO_URI, now = Date.UTC(2026, 8, 14, 15)
const quota = { searchDailyLimit: 100, otherDailyLimit: 10000, searchBaseReserve: 80, otherBaseReserve: 9000, extraSearchLimit: 20 }
async function database(run: (db: Db) => Promise<void>) {
  const client = new MongoClient(uri!, { serverSelectionTimeoutMS: 5000 })
  const db = client.db(`random_complete_test_${randomUUID().replaceAll('-', '')}`)
  try { await run(db) } finally { await db.dropDatabase(); await client.close() }
}
const row = (title: string, id = new ObjectId(), type = 'video', rand = .1) => {
  const profile = buildProfile({ title })
  return { _id: id, type, provider: type === 'video' ? 'youtube' : 'fixture', videoId: String(id), title,
    sourceMetadata: { title }, discoveryVersion: 2, discoveryProfile: profile, discoveryFamily: profile.family, rand }
}

test('Mongo: same-version repaired owner source is rehydrated, fairly scheduled and seeds a cheap channel task', { skip: !uri }, () => database(async db => {
  await installOwnerIndexes(db)
  const source = row('Nora Legrand interview')
  await db.collection('items').insertOne({ ...source, channelId: 'UCabcdefghijklmnopqrstuv' })
  await saveOwnerReference(db, { ownerId: curatorOwnerId(), contentKey: 'owner:one', itemId: String(source._id),
    active: true, type: 'video', familyId: 'unknown', version: 2, profile: buildProfile({ title: 'Unknown' }) })
  assert.equal(await enqueueOwnerExploration(db, now, 999, ['youtube']), 3)
  const tasks = await db.collection('discovery_tasks_v2').find({}).toArray()
  assert.ok(tasks.every(t => t.spec.focus.subject.key === 'entity:nora legrand'))
  assert.equal(tasks.filter(t => t.spec.kind === 'channel').length, 1)
  assert.equal((await db.collection('items').findOne({ _id: source._id }))?.discoveryProfile.sourceRevision, source.discoveryProfile.sourceRevision)
  await db.collection('items').updateOne({ _id: source._id }, { $set: { sourceMetadata: { title: 'Addison Rae interview' } } })
  await enqueueOwnerExploration(db, now + 1000, 1000, ['youtube'])
  const ref = await db.collection('discovery_owner_references_v2').findOne({ contentKey: 'owner:one' })
  assert.equal(ref?.profile.subject.primary.key, 'entity:addison rae')
  assert.equal(ref?.explorationRotation.youtube, 2)
}))

test('Mongo: owner references with no usable subject are visible in the report and never stall later references', { skip: !uri }, () => database(async db => {
  await installOwnerIndexes(db)
  for (let i = 0; i < 4; i++) {
    const item = row(i < 2 ? 'IMG_0001' : ['Nora Legrand interview', 'Johnny Hallyday collection'][i - 2])
    await db.collection('items').insertOne(item)
    await saveOwnerReference(db, { ownerId: curatorOwnerId(), contentKey: `ref:${i}`, itemId: String(item._id), active: true,
      familyId: 'unknown', type: 'video', version: 2, profile: item.discoveryProfile })
  }
  let report: { needsSubject: number; scheduled: number } | undefined
  await enqueueOwnerExploration(db, now, 0, ['youtube'], r => { report = r })
  assert.equal(report?.needsSubject, 2); assert.equal(report?.scheduled, 2)
  const refs = await db.collection('discovery_owner_references_v2').find({}).toArray()
  assert.ok(refs.every(r => r.explorationScheduledAt instanceof Date))
}))

test('Mongo: directed Pool retrieval reaches liked neighbors in the rotating window without reserving the draw', { skip: !uri }, () => database(async db => {
  await installDiscoveryIndexes(db); await installOwnerIndexes(db)
  const source = row('Nora Legrand interview')
  await db.collection('items').insertMany([source, ...Array.from({ length: 1200 }, (_, i) => row('Unknown archive recording', new ObjectId(), 'video', .4 + i / 10000)),
    row('Nora Legrand portrait drawing'), row('Nora Legrand collection memorabilia')])
  await saveOwnerReference(db, { ownerId: curatorOwnerId(), contentKey: `youtube:${source.videoId}`, itemId: String(source._id),
    familyId: 'unknown', active: true, type: 'video', version: 2, profile: source.discoveryProfile })
  const state = newSession(1), ticket = { ...planDraw(state, 'video'), branch: 'editorial' as const, lane: 'any' as const, allowDirectReference: false }
  let first = true
  const rng = seeded(99)
  const result = await selectPool(db, ticket, state, 'en', r => r.title,
    () => { if (first) { first = false; return .099 }; return rng() }, now, undefined, curatorOwnerId())
  assert.ok(result)
  assert.ok((result.selection?.retrieval?.focusedCandidates ?? 0) >= 2, 'neighbor retrieval remains connected')
  assert.ok((result.selection?.candidateCount ?? 0) > 50, 'curation never collapses the choice to two neighbors')
  if (result.branch === 'editorial') {
    assert.equal(result.item.profile.subject?.primary?.key, 'entity:nora legrand')
    assert.notEqual(result.item.key, `youtube:${source.videoId}`)
  }

}))

test('Mongo: driver query failure remains a retryable 503 and is not cached as missing content', { skip: !uri }, () => database(async db => {
  const a = row('South Park GIF', new ObjectId(), 'image')
  await db.collection('items').insertMany([a, row('South Park classroom scene'), row('South Park sculpture', new ObjectId(), 'image'),
    { ...row('Who created South Park?', new ObjectId(), 'fact'), variant: 'quiz' }])
  const handler = waveHandler({ enabled: () => true, getDb: async () => db, decode: r => r.title })
  const req = () => new Request('https://test.invalid', { method: 'POST', body: JSON.stringify({ anchorId: String(a._id) }) })
  const failed = await handler(req())
  assert.equal(failed.status, 503); assert.equal((await failed.json()).error, 'retrieval-incomplete')
  await installDiscoveryIndexes(db)
  const ok = await handler(req())
  assert.equal(ok.status, 200); assert.ok((await ok.json()).ready)
}))

test('Mongo: provider quota exhaustion is shared across runs while other-method requests remain available', { skip: !uri }, () => database(async db => {
  const spec = { kind: 'search' as const, query: 'Nora Legrand', after: '2005-01-01', before: '2027-01-01', language: 'en', order: 'relevance' as const }
  await enqueue(db, spec, 0, false, now)
  const report = await runExploration({ db, quota, random: seeded(1), now: () => now, maxMs: 30000, provider: 'youtube',
    loadPage: async (_task, _signal, permit) => { assert.ok(await permit('search')); throw new ProviderQuotaError('search') },
    ingest: async () => { throw new Error('no data to ingest') } })
  assert.equal(report.quotaDenied, 1)
  assert.equal(await reserveQuota(db, quota, 'search', 'base', now), false)
  assert.equal(await reserveQuota(db, quota, 'other', 'editorial', now), true)
  assert.ok(await reserveQuota(db, quota, 'search', 'editorial', now + 86400000))
  const daily = await db.collection('discovery_quota_v2').findOne({ _id: `${quotaDay(now)}:youtube:search` } as never)
  assert.equal(daily?.remoteExhausted, true)
}))

test('Mongo: all displayed members of a real-title South Park fixture retain the cartoon identity', { skip: !uri }, () => database(async db => {
  await installDiscoveryIndexes(db)
  const anchor = row('walking tour GIF by South Park', new ObjectId(), 'image')
  await db.collection('items').insertMany([anchor,
    row('【VR散歩65】大阪市内の秋の風景 うめきた広場～うめきた公園(サウスパーク)＜Insta360 X5＞'),
    row('South Park classroom scene'), row('South Park fan art', new ObjectId(), 'image'),
    { ...row('Which video game contained a hidden South Park episode?', new ObjectId(), 'fact'), variant: 'quiz' }])
  const result = await loadWave(db, String(anchor._id), 'en', ['video', 'image', 'fact'], r => r.title, seeded(4), now)
  assert.ok(result?.plan.ready)
  assert.ok(result.plan.trio.every(c => !String(c.payload).includes('公園')))
  assert.ok(result.plan.trio.some(c => c.type === 'video')); assert.ok(result.plan.trio.some(c => c.quiz))
}))
