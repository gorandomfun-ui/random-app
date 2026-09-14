import test from 'node:test'
import assert from 'node:assert/strict'
import { MongoClient, ObjectId, type Db } from 'mongodb'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildProfile } from '../../lib/discovery/profile'
import { installDiscoveryIndexes, loadWave } from '../../lib/discovery/mongo'
import { installOwnerIndexes, saveOwnerReference } from '../../lib/discovery/ownerStore'
import { inspectCuration } from '../../lib/discovery/curationInspection'
import { createSubjectSearches } from '../../lib/discovery/subjectExploration'
import { runExploration, enqueue } from '../../lib/discovery/exploration'
import { seeded } from '../../lib/discovery/random'

const uri = process.env.RANDOM_TEST_MONGO_URI
async function database(run: (db: Db) => Promise<void>) {
  const client = new MongoClient(uri!), db = client.db(`random_revision3_test_${randomUUID().replaceAll('-', '')}`)
  try { await installDiscoveryIndexes(db); await installOwnerIndexes(db); await run(db) }
  finally { await db.dropDatabase(); await client.close() }
}
const row = (i: number, title: string, type = 'video') => {
  const sourceMetadata = { title }, profile = buildProfile(sourceMetadata)
  return { _id: new ObjectId(), type, provider: type === 'video' ? 'youtube' : 'giphy', videoId: `id${i}`,
    url: `https://example.invalid/${i}`, title, sourceMetadata, discoveryProfile: profile, discoveryVersion: 2,
    discoveryFamily: profile.family, rand: seeded(i)() }
}
async function cli(db: Db, script: string, args: string[]) {
  return new Promise<{ code: number | null; out: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', script, ...args], { env: { ...process.env,
      MONGO_URI: '', MONGO_DB: '', MONGODB_URI: uri!, MONGODB_DB: db.databaseName },
      stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 })
    let out = ''
    child.stdout.on('data', b => { out += b }); child.stderr.on('data', b => { out += b })
    child.on('error', reject); child.on('exit', code => resolve({ code, out }))
  })
}

test('Mongo: execute the delivered verify-pool CLI, including explain(), with the locked driver and no DB writes', { skip: !uri }, async () => database(async db => {
  await db.collection('items').insertMany(Array.from({ length: 500 }, (_, i) => row(i, ['Pottery workshop', 'Minecraft gameplay', 'Johnny Hallyday interview'][i % 3], i % 4 ? 'video' : 'image')))
  const before = await db.collection('items').find({}).sort({ _id: 1 }).toArray()
  for (const type of ['video', 'image']) {
    const result = await cli(db, 'scripts/discovery/verify-pool.ts', ['--draws', '5', '--sessions', '1', '--type', type, '--without-history'])
    assert.equal(result.code, 0, result.out)
    assert.match(result.out, /"kind":"sampling-plan"/)
    const report = JSON.parse(result.out.slice(result.out.indexOf('{\n  "kind": "pool-audit"')))
    assert.equal(report.attempted, 5); assert.equal(report.displayed, 5); assert.equal(report.empty, 0)
    assert.equal(report.partial, false)
  }
  assert.deepEqual(await db.collection('items').find({}).sort({ _id: 1 }).toArray(), before)
}))

test('Mongo: old stage-name tokens find a relevant mixed Wave via a bounded subject-token fallback', { skip: !uri }, async () => database(async db => {
  const anchor = row(0, 'A$AP Rocky punk interview')
  const good = [row(1, 'A$AP Rocky official music video'), row(2, 'A$AP Rocky fan art', 'image'),
    { ...row(3, 'ASAP Rocky interview quiz', 'fact'), variant: 'quiz' }]
  // Reproduce pre-revision tokenisation rather than building every index with the new code.
  for (const doc of good) { doc.discoveryProfile.tokens = ['rocky']; doc.discoveryProfile.signalVersion = 5 }
  await db.collection('items').insertMany([anchor, ...good, row(4, 'Punk guitar workshop'), row(5, 'Japanese reaction GIF', 'image')])
  const result = await loadWave(db, String(anchor._id), 'fr', ['video', 'image', 'fact'], r => r.title, seeded(1), Date.now())
  assert.ok(result?.plan.ready, JSON.stringify(result?.diagnostics))
  assert.equal(result.plan.trio.length, 3)
  assert.ok(result.plan.trio.every(c => result.plan.ready && result.plan.relations[c.key].reasons.includes('subject:entity:asap rocky')))
  assert.equal(result.plan.trio.filter(c => c.type === 'image').length, 1)
  assert.equal((await db.collection('items').findOne({ _id: good[0]._id }))?.discoveryProfile.signalVersion, 5)
}))

test('Mongo: a missing subject skips retrieval and a stored stale Minecraft profile refreshes from real source metadata', { skip: !uri }, async () => database(async db => {
  const unknown = row(0, 'ordinary lowercase description'), minecraft = row(1, 'Minecraft gameplay')
  delete minecraft.discoveryProfile.subject; minecraft.discoveryProfile.signalVersion = 5
  await db.collection('items').insertMany([unknown, minecraft, row(2, 'Minecraft tutorial'), row(3, 'Minecraft fan art', 'image'), row(4, 'Minecraft interview')])
  const first = await loadWave(db, String(unknown._id), 'en', ['video', 'image'], r => r.title, seeded(1), Date.now())
  assert.ok(first && !first.plan.ready); assert.equal(first.diagnostics.queries, 0); assert.equal(first.diagnostics.cause, 'subject-unresolved')
  const second = await loadWave(db, String(minecraft._id), 'en', ['video', 'image'], r => r.title, seeded(1), Date.now())
  assert.ok(second?.plan.ready); assert.equal(second.diagnostics.subjectKey, 'entity:minecraft')
}))

test('Mongo: stale owner tasks consume no provider quota and the private view distinguishes scheduled work from measured insertions', { skip: !uri }, async () => database(async db => {
  const document = row(0, 'Telstra TV Commercial'), now = Date.now(), profile = document.discoveryProfile
  await db.collection('items').insertOne(document)
  await saveOwnerReference(db, { ownerId: 'owner', contentKey: 'ref', itemId: String(document._id), active: true,
    familyId: profile.family, type: 'video', version: 2, profile })
  const spec = createSubjectSearches(profile, { ownerId: 'owner', referenceKey: 'ref', referenceRevision: profile.sourceRevision }, now, 0)[0]
  await enqueue(db, { ...spec, focus: { ...spec.focus!, subjectVersion: 3 } }, 0, true, now)
  await runExploration({ db, random: seeded(1), maxMs: 30000,
    quota: { searchDailyLimit: 100, otherDailyLimit: 10000, searchBaseReserve: 0, otherBaseReserve: 0, extraSearchLimit: 20 },
    loadPage: async () => { throw new Error('Stale subject must never call a provider') },
    ingest: async () => { throw new Error('Stale subject must never ingest') },
  })
  assert.equal((await db.collection('discovery_tasks_v2').findOne({}))?.attempts, 0, 'old tasks are skipped before claiming or using an attempt')
  assert.equal(await db.collection('discovery_quota_v2').countDocuments(), 0)
  const state = await inspectCuration(db, 'owner', String(document._id))
  assert.equal(state?.state, 'waiting'); assert.equal(state?.inserted, 0); assert.equal(state?.outdatedTasks, 1)
  await enqueue(db, spec, 0, true, now)
  const next = await inspectCuration(db, 'owner', String(document._id))
  assert.equal(next?.sampledTasks, 1); assert.equal(next?.measuredTasks, 0); assert.equal(next?.inserted, 0)
}))

test('Mongo: the delivered curation CLI exports actual anchor/candidate snapshots and keeps all database rows unchanged', { skip: !uri }, async () => database(async db => {
  const anchor = row(0, 'South Park GIF', 'image')
  await db.collection('items').insertMany([anchor, row(1, 'South Park classroom scene'), row(2, 'South Park fan art', 'image'), row(3, 'South Park interview')])
  const before = await db.collection('items').find({}).sort({ _id: 1 }).toArray(), folder = await mkdtemp(join(tmpdir(), 'random-audit-'))
  try {
    const path = join(folder, 'actual-cases.json')
    const result = await cli(db, 'scripts/discovery/verify-curation.ts', ['--waves', '--ids', String(anchor._id), '--out', path])
    assert.equal(result.code, 0, result.out)
    const exported = JSON.parse(await readFile(path, 'utf8'))
    assert.equal(exported.cases.length, 1); assert.equal(exported.cases[0].anchor.title, 'South Park GIF')
    assert.equal(exported.cases[0].review, null); assert.equal(exported.cases[0].observedReady, true)
    assert.ok(exported.cases[0].candidates.length >= 3)
    assert.ok(exported.cases[0].observedTrio.every((c: { relation: { reasons: string[] } }) => c.relation.reasons.includes('subject:entity:south park')))
    assert.deepEqual(await db.collection('items').find({}).sort({ _id: 1 }).toArray(), before)
  } finally { await rm(folder, { recursive: true, force: true }) }
}))
