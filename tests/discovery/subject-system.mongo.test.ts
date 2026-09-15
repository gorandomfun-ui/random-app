import test from 'node:test'
import assert from 'node:assert/strict'
import { MongoClient, ObjectId, type Db } from 'mongodb'
import { randomUUID } from 'node:crypto'
import { installDiscoveryIndexes, loadWave } from '../../lib/discovery/mongo'
import { buildProfile } from '../../lib/discovery/profile'
import { seeded } from '../../lib/discovery/random'
import { installSubjectWorkIndexes, requestSubjectWork, claimSubjectWork, subjectWorkCollection } from '../../lib/discovery/subjectWork'
import { maintainSubjects } from '../../lib/discovery/subjectMaintenance'
import { enqueue, runExploration, type DiscoveryTask } from '../../lib/discovery/exploration'
import { resolveSourceEntity } from '../../lib/discovery/entityResolver'
const uri = process.env.RANDOM_TEST_MONGO_URI, now = Date.UTC(2026, 8, 15)
async function database(run: (db: Db) => Promise<void>) {
  const client = new MongoClient(uri!, { serverSelectionTimeoutMS: 2000 }), db = client.db(`random_subject_system_test_${randomUUID().replaceAll('-', '')}`)
  try { await installDiscoveryIndexes(db); await installSubjectWorkIndexes(db); await run(db) }
  finally { await db.dropDatabase(); await client.close() }
}
function row(i: number, title: string, type = 'video') {
  const sourceMetadata = { title }, profile = buildProfile(sourceMetadata)
  return { _id: new ObjectId(), type, title, provider: type === 'video' ? 'youtube' : 'fixture',
    videoId: `test${i.toString().padStart(7, '0')}`, url: `https://example.invalid/${i}`, rand: i / 10000,
    sourceMetadata, discoveryVersion: 2, discoveryProfile: profile, discoveryFamily: profile.family }
}

test('Mongo: full product identity is applied BEFORE limit; 1000 other models cannot hide a scarce relation', { skip: !uri }, () => database(async db => {
  const anchor = row(1, 'Peugeot 108 - interactive trailer')
  await db.collection('items').insertMany([anchor, ...Array.from({ length: 1000 }, (_, i) => row(i + 2, 'Peugeot 208 road test')),
    row(2000, 'Peugeot 108 fan collection')])
  const result = await loadWave(db, String(anchor._id), 'en', ['video', 'image'], r => String(r.title), () => 0, now)
  assert.ok(result?.plan.ready, JSON.stringify(result?.diagnostics))
  assert.equal(result.plan.trio.length, 1)
  assert.ok(result.plan.trio[0].profile.subject?.primary?.key.includes('108'))
}))

test('Mongo: queue is idempotent, globally bounded and leases are exclusive', { skip: !uri }, () => database(async db => {
  const id = new ObjectId().toHexString()
  await Promise.all(Array.from({ length: 10 }, () => requestSubjectWork(db, id, 'short-wave', now)))
  assert.equal(await subjectWorkCollection(db).countDocuments(), 1)
  const claims = await Promise.all([claimSubjectWork(db, now), claimSubjectWork(db, now)])
  assert.equal(claims.filter(Boolean).length, 1)
  for (let i = 0; i < 100; i++) await requestSubjectWork(db, new ObjectId().toHexString(), 'short-wave', now)
  assert.ok(await subjectWorkCollection(db).countDocuments() <= 96)
}))

test('Mongo: source qualification updates the item once, preserves rand/likes, and schedules both providers', { skip: !uri }, () => database(async db => {
  const old = { yt: process.env.YOUTUBE_API_KEY, dm: process.env.RANDOM_DM_DISCOVERY_ENABLED }
  process.env.YOUTUBE_API_KEY = 'fixture'; process.env.RANDOM_DM_DISCOVERY_ENABLED = '1'
  try {
    const source = { ...row(1, 'Nora Legrand interview'), likeCount: 42, suppressed: false }
    await db.collection('items').insertOne(source)
    await requestSubjectWork(db, String(source._id), 'short-wave', now)
    const result = await maintainSubjects(db, { now: () => now, resolve: async () => ({ label: 'Nora Legrand', kind: 'entity', entityId: 'Q999' }) })
    assert.equal(result.resolved, 1); assert.equal(result.searches, 4)
    const saved = await db.collection('items').findOne({ _id: source._id })
    assert.equal(saved?.rand, source.rand); assert.equal(saved?.likeCount, 42)
    assert.equal(saved?.discoveryProfile.subject.primary.entityId, 'Q999')
    const tasks = await db.collection<DiscoveryTask>('discovery_tasks_v2').find({}).toArray()
    assert.equal(tasks.filter(t => t.spec.kind === 'dailymotion').length, 2)
    assert.ok(tasks.every(t => !t.editorial && !t.spec.focus && t.spec.subjectScope))
    assert.equal((await maintainSubjects(db, { now: () => now })).claimed, 0)
  } finally {
    for (const [name, value] of [['YOUTUBE_API_KEY', old.yt], ['RANDOM_DM_DISCOVERY_ENABLED', old.dm]]) {
      if (value === undefined) delete process.env[name!]; else process.env[name!] = value
    }
  }
}))

test('Mongo: unavailable entity service keeps local qualification usable and retries; concurrent edits win', { skip: !uri }, () => database(async db => {
  const source = row(1, 'Nora Legrand interview')
  await db.collection('items').insertOne(source)
  await requestSubjectWork(db, String(source._id), 'short-wave', now)
  const result = await maintainSubjects(db, { now: () => now, resolve: async () => { throw new Error('offline') } })
  assert.equal(result.retry, 1); assert.equal(result.profiled, 1)
  assert.equal((await subjectWorkCollection(db).findOne({ _id: String(source._id) }))?.lastOutcome, 'entity-service-unavailable')
  await subjectWorkCollection(db).updateOne({ _id: String(source._id) }, { $set: { due: new Date(now), leaseUntil: new Date(0) } })
  await maintainSubjects(db, { now: () => now, resolve: async () => {
    await db.collection('items').updateOne({ _id: source._id }, { $set: { title: 'Different current title' } }); return undefined
  } })
  assert.equal((await db.collection('items').findOne({ _id: source._id }))?.title, 'Different current title')
  assert.equal((await subjectWorkCollection(db).findOne({ _id: String(source._id) }))?.lastOutcome, 'source-changed')
}))

test('Mongo: duplicate pages retain NEXT cursor across runs instead of endlessly re-reading popular page one', { skip: !uri }, () => database(async db => {
  let clock = now
  await enqueue(db, { kind: 'playlist', playlistId: 'fixture' }, 0, false, clock)
  const cursors: (string | null | undefined)[] = []
  for (let run = 0; run < 3; run++) {
    const result = await runExploration({ db, now: () => clock, random: seeded(1), maxMs: 30000,
      quota: { searchDailyLimit: 100, otherDailyLimit: 10000, searchBaseReserve: 80, otherBaseReserve: 9000, extraSearchLimit: 20 },
      loadPage: async task => { cursors.push(task.cursor); clock += 16000; return { videos: [{ provider: 'youtube', videoId: 'aaaaaaaaaaa', url: 'https://example.invalid/1', title: 'Nora Legrand interview' }], children: [], nextCursor: `page-${run + 2}` } },
      ingest: async () => ({ inserted: run === 2 ? 1 : 0, existingSkipped: run === 2 ? 0 : 1 }) })
    assert.equal(result.pages, 1); assert.equal(result.inserted, run === 2 ? 1 : 0)
    const task = await db.collection<DiscoveryTask>('discovery_tasks_v2').findOne({})
    assert.equal(task?.dryPages, 0); clock = task!.due.getTime()
  }
  assert.deepEqual(cursors, [undefined, 'page-2', 'page-3'])
}))

test('Mongo: entity queries use cached evidence; API errors are never cached as an empty answer', { skip: !uri }, () => database(async db => {
  let calls = 0
  const request = (async () => { calls++; return Response.json({ search: [{ id: 'Q999', label: 'Nora Legrand', aliases: ['Nora Legrand'] }] }) }) as typeof fetch
  for (let i = 0; i < 2; i++) assert.equal((await resolveSourceEntity(db, { title: 'Nora Legrand interview' }, { now, request }))?.entityId, 'Q999')
  assert.equal(calls, 1)
  await assert.rejects(resolveSourceEntity(db, { title: 'Lina Moreau interview' }, { now, request: (async () => Response.json({}, { status: 429 })) as typeof fetch }))
  assert.equal(await db.collection('discovery_entity_cache_v1').countDocuments(), 1)
}))
