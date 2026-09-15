import test from 'node:test'
import assert from 'node:assert/strict'
import { MongoClient, ObjectId, type Db } from 'mongodb'
import { randomUUID } from 'node:crypto'
import { buildProfile } from '../../lib/discovery/profile'
import { maintainSubjects } from '../../lib/discovery/subjectMaintenance'
import { registerPublicSubject, schedulePublicSubjects, publicSubjects } from '../../lib/discovery/publicSubjectExploration'
import { installSubjectWorkIndexes, requestSubjectWork } from '../../lib/discovery/subjectWork'
import { installDiscoveryIndexes, loadWave } from '../../lib/discovery/mongo'
import { runExploration, type DiscoveryTask } from '../../lib/discovery/exploration'
const uri = process.env.RANDOM_TEST_MONGO_URI, start = Date.UTC(2026, 8, 15)
async function database(run: (db: Db) => Promise<void>) {
  const client = new MongoClient(uri!, { serverSelectionTimeoutMS: 2000 }), db = client.db(`random_public_subject_test_${randomUUID().replaceAll('-', '')}`)
  const previous = { yt: process.env.YOUTUBE_API_KEY, dm: process.env.RANDOM_DM_DISCOVERY_ENABLED }
  process.env.YOUTUBE_API_KEY = 'fixture'; process.env.RANDOM_DM_DISCOVERY_ENABLED = '1'
  try { await installDiscoveryIndexes(db); await installSubjectWorkIndexes(db); await run(db) }
  finally {
    for (const [name, value] of [['YOUTUBE_API_KEY', previous.yt], ['RANDOM_DM_DISCOVERY_ENABLED', previous.dm]]) {
      if (value === undefined) delete process.env[name!]; else process.env[name!] = value
    }
    await db.dropDatabase(); await client.close()
  }
}
function item(title: string, i = 0) {
  const sourceMetadata = { title }, profile = buildProfile(sourceMetadata)
  return { _id: new ObjectId(), type: 'video', title, sourceMetadata, provider: 'youtube',
    videoId: `clip${String(i).padStart(7, '0')}`, url: `https://example.invalid/${i}`,
    rand: i / 1000, discoveryProfile: profile, discoveryVersion: 2, discoveryFamily: profile.family }
}

test('Mongo: ONE public Wave gap continues exploration over four separate worker runs without a like or another gap', { skip: !uri }, () => database(async db => {
  const source = item('1973 - Nora Legrand concert amateur')
  await db.collection('items').insertOne(source)
  await requestSubjectWork(db, String(source._id), 'short-wave', start)
  for (let day = 0; day < 4; day++) {
    const result = await maintainSubjects(db, { now: () => start + day * 86400000, resolve: async () => undefined })
    assert.equal(result.claimed, day === 0 ? 1 : 0)
    assert.equal(result.publicSubjects, 1); assert.equal(result.searches, 4)
    const record = await publicSubjects(db).findOne({})
    assert.deepEqual(record?.rotation, { youtube: day + 1, dailymotion: day + 1 })
    assert.equal((await maintainSubjects(db, { now: () => start + day * 86400000 })).searches, 0, 'retrying a job cannot spend another rotation')
  }
  const tasks = await db.collection<DiscoveryTask>('discovery_tasks_v2').find({}).toArray()
  assert.ok(tasks.some(t => t.spec.subjectScope?.angle === 'era-1973'))
  assert.ok(tasks.some(t => t.spec.coverage))
  assert.ok(tasks.every(t => !t.spec.focus && !t.editorial))
  const duplicateReference = item('Nora Legrand fan interview', 1)
  await db.collection('items').insertOne(duplicateReference)
  await registerPublicSubject(db, String(duplicateReference._id), duplicateReference.discoveryProfile, start + 4 * 86400000)
  assert.equal(await publicSubjects(db).countDocuments(), 1)
  assert.equal((await publicSubjects(db).findOne({}))?.rotation.youtube, 4, 'another video of this subject does not restart page-one planning')
}))

test('Mongo: public rotation survives a disabled provider, uses exclusive leases, and preserves task cursors', { skip: !uri }, () => database(async db => {
  const source = item('Nora Legrand interview')
  await db.collection('items').insertOne(source)
  await registerPublicSubject(db, String(source._id), source.discoveryProfile, start)
  delete process.env.YOUTUBE_API_KEY
  const first = await Promise.all([schedulePublicSubjects(db, start), schedulePublicSubjects(db, start)])
  assert.equal(first.reduce((n, r) => n + r.subjects, 0), 1)
  assert.deepEqual((await publicSubjects(db).findOne({}))?.rotation, { dailymotion: 1 })
  const oldTask = await db.collection<DiscoveryTask>('discovery_tasks_v2').findOne({})
  await db.collection<DiscoveryTask>('discovery_tasks_v2').updateOne({ _id: oldTask!._id }, { $set: { cursor: 'page-4', pages: 3 } })
  process.env.YOUTUBE_API_KEY = 'fixture'
  await schedulePublicSubjects(db, start + 86400000)
  assert.deepEqual((await publicSubjects(db).findOne({}))?.rotation, { youtube: 1, dailymotion: 2 })
  assert.equal((await db.collection<DiscoveryTask>('discovery_tasks_v2').findOne({ _id: oldTask!._id }))?.cursor, 'page-4')
  // If current metadata contradicts the saved identity, no old-subject search is scheduled.
  await db.collection('items').updateOne({ _id: source._id }, { $set: { sourceMetadata: { title: 'Lina Moreau interview' } } })
  assert.equal((await schedulePublicSubjects(db, start + 2 * 86400000)).searches, 0)
  assert.equal((await publicSubjects(db).findOne({}))?.lastOutcome, 'source-changed-or-missing')
}))

test('Mongo: new and recurring public subjects share the two-subject limit and do not starve waiting subjects', { skip: !uri }, () => database(async db => {
  for (const [i, name] of ['Nora Legrand', 'Lina Moreau', 'Paul Vernier', 'Emma Durand', 'Louis Garnier'].entries()) {
    const source = item(`${name} interview`, i)
    await db.collection('items').insertOne(source)
    await registerPublicSubject(db, String(source._id), source.discoveryProfile, start + i)
  }
  assert.equal((await schedulePublicSubjects(db, start + 10)).searches, 8)
  assert.equal((await schedulePublicSubjects(db, start + 11)).searches, 8)
  assert.equal((await schedulePublicSubjects(db, start + 12)).searches, 4)
  assert.equal((await schedulePublicSubjects(db, start + 13)).searches, 0)
  const records = await publicSubjects(db).find({}).toArray()
  assert.ok(records.every(r => r.rotation.youtube === 1 && r.rotation.dailymotion === 1))
}))

test('Mongo: a public search passes 100 known mainstream videos and ingests a rare related interview for Waves', { skip: !uri }, () => database(async db => {
  delete process.env.YOUTUBE_API_KEY // Keep this provider path deterministic; both adapters use the same discovery runner.
  let clock = start
  const known = Array.from({ length: 100 }, (_, i) => item(`Nora Legrand official video ${i}`, i))
  await db.collection('items').insertMany(known)
  await requestSubjectWork(db, String(known[0]._id), 'short-wave', clock)
  await maintainSubjects(db, { now: () => clock, resolve: async () => undefined })
  const tasks = db.collection<DiscoveryTask>('discovery_tasks_v2')
  const open = await tasks.findOne({ 'spec.subjectScope.angle': 'open' })
  assert.ok(open)
  await tasks.updateMany({ _id: { $ne: open._id } }, { $set: { due: new Date(start + 10 * 86400000) } })
  const seenCursors: (string | null | undefined)[] = []
  for (let page = 0; page < 3; page++) {
    const report = await runExploration({ db, now: () => clock, maxMs: 30000, random: () => .5,
      provider: 'dailymotion', loadPage: async task => {
        seenCursors.push(task.cursor); clock += 16000
        const batch = page < 2 ? known.slice(page * 50, page * 50 + 50) : [item('Nora Legrand 1973 amateur interview in a village', 100)]
        return { videos: batch.map(r => ({ provider: 'youtube' as const, videoId: r.videoId, url: r.url, title: r.title })),
          children: [], nextCursor: page < 2 ? `next-${page + 1}` : undefined }
      }, ingest: async videos => {
        let inserted = 0
        for (const v of videos) {
          const row = { ...item(v.title!, Number(v.videoId.slice(4))), videoId: v.videoId, url: v.url }
          const result = await db.collection('items').updateOne({ videoId: v.videoId }, { $setOnInsert: row }, { upsert: true })
          inserted += result.upsertedCount
        }
        return { inserted, existingSkipped: videos.length - inserted }
      } })
    assert.equal(report.pages, 1); assert.equal(report.inserted, page === 2 ? 1 : 0)
    clock = (await tasks.findOne({ _id: open._id }))!.due.getTime()
  }
  assert.deepEqual(seenCursors, [undefined, 'next-1', 'next-2'])
  const wave = await loadWave(db, String(known[0]._id), 'en', ['video', 'image'], r => r.title, () => 0, clock)
  assert.ok(wave?.plan.ready, JSON.stringify(wave?.diagnostics))
  assert.ok(wave.plan.trio.some(c => String(c.payload).includes('amateur interview')), 'new ingestion opens a genuinely different treatment in the Wave')
}))
