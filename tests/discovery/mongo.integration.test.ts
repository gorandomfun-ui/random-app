import test from 'node:test'
import assert from 'node:assert/strict'
import { MongoClient } from 'mongodb'
import { randomUUID } from 'node:crypto'
import { reserveQuota } from '../../lib/discovery/exploration'
import { installDiscoveryIndexes, selectPool, loadWave, loadPoolCandidates } from '../../lib/discovery/mongo'
import { installOwnerIndexes, saveOwnerReference, applyOwnerReferences } from '../../lib/discovery/ownerStore'
import { buildProfile } from '../../lib/discovery/profile'
import { newSession, planDraw, commitDraw } from '../../lib/discovery/pool'
import { seeded } from '../../lib/discovery/random'
import { candidateFromRow } from '../../lib/discovery/catalog'
import { applyRoutineVideoIngestCap } from '../../lib/ingest/videoEditorialAdmission'

const uri = process.env.RANDOM_TEST_MONGO_URI
test('MongoDB integration: 100 concurrent reservations cannot exceed a daily cap of 12', { skip: !uri }, async () => {
  const client = new MongoClient(uri!, { serverSelectionTimeoutMS: 5000 })
  const db = client.db(`random_discovery_test_${randomUUID().replaceAll('-', '')}`)
  try {
    const config = { searchDailyLimit: 12, otherDailyLimit: 100, searchBaseReserve: 0, otherBaseReserve: 0, extraSearchLimit: 20 }
    const results = await Promise.all(Array.from({ length: 100 }, () => reserveQuota(db, config, 'search', 'base', Date.now())))
    assert.equal(results.filter(Boolean).length, 12)
  } finally {
    // This generated test DB is the only database this test ever drops.
    await db.dropDatabase(); await client.close()
  }
})

test('MongoDB: every automatic video path shares the two-per-24h ordinary news/radio cap', { skip: !uri }, async () => {
  const client = new MongoClient(uri!, { serverSelectionTimeoutMS: 5000 })
  const db = client.db(`random_discovery_test_${randomUUID().replaceAll('-', '')}`)
  const now = new Date('2026-09-11T12:00:00.000Z')
  try {
    await db.collection('items').insertOne({ type: 'video', videoId: 'existing001', provider: 'youtube',
      editorialRoutine: true, editorialRoutineIngestedAt: new Date(now.getTime() - 3600000) })
    const candidates = [
      { videoId: 'news0000001', url: 'https://youtu.be/news0000001', provider: 'youtube', title: 'Daily news bulletin' },
      { videoId: 'radio000001', url: 'https://youtu.be/radio000001', provider: 'youtube', title: 'Morning radio full episode' },
      { videoId: 'funny000001', url: 'https://youtu.be/funny000001', provider: 'youtube', title: 'Daily news parody comedy sketch' },
      { videoId: 'advert00001', url: 'https://youtu.be/advert00001', provider: 'youtube', title: 'Vintage television commercial 1974' },
      { videoId: 'music000001', url: 'https://youtu.be/music000001', provider: 'youtube', title: 'Basement concert captured on VHS' },
    ] as const
    const dryRun = await applyRoutineVideoIngestCap(db, [...candidates], now, { dryRun: true })
    assert.equal(dryRun.admitted, 1)
    assert.equal(await db.collection('video_editorial_quota_v1').countDocuments(), 0)
    const admission = await applyRoutineVideoIngestCap(db, [...candidates], now)
    assert.equal(admission.alreadyIngested, 1)
    assert.equal(admission.admitted, 1)
    assert.equal(admission.filtered, 1)
    assert.deepEqual(admission.videos.map(video => video.videoId), ['news0000001', 'funny000001', 'advert00001', 'music000001'])
    assert.equal(admission.videos[0].editorialRoutine, true)
    assert.ok(admission.videos.slice(1).every(video => video.editorialRoutine !== true))
    const concurrent = await Promise.all(Array.from({ length: 20 }, (_, index) => applyRoutineVideoIngestCap(
      db,
      [{ videoId: `radio-next-${index}`, url: `https://example.invalid/${index}`, provider: 'youtube', title: 'Radio news bulletin' }],
      now,
    )))
    assert.equal(concurrent.reduce((sum, result) => sum + result.admitted, 0), 0)
    const quota = await db.collection<{ _id: string; timestamps: Date[] }>('video_editorial_quota_v1').findOne({ _id: 'routine-news-radio' })
    assert.equal((quota?.timestamps as Date[]).length, 2)
  } finally { await db.dropDatabase(); await client.close() }
})

test('MongoDB: actual catalogue sampling, stock exclusions, Wave trios and more than 64 owner references', { skip: !uri }, async () => {
  const client = new MongoClient(uri!, { serverSelectionTimeoutMS: 5000 })
  const db = client.db(`random_discovery_test_${randomUUID().replaceAll('-', '')}`)
  const now = Date.now(), random = seeded(44), profile = buildProfile({ title: 'Stone carving workshop' })
  try {
    await installDiscoveryIndexes(db); await installOwnerIndexes(db)
    const docs = Array.from({ length: 180 }, (_, i) => ({ type: i % 3 ? 'video' : 'image',
      provider: i % 9 === 0 ? 'pexels' : i % 3 ? 'youtube' : 'giphy',
      url: `https://example.invalid/media/${i}`, title: 'Stone carving workshop', videoId: i % 3 ? `video-${i}` : undefined,
      channelId: `creator-${i % 30}`, sourceMetadata: { title: 'Stone carving workshop' },
      discoveryVersion: 2, discoveryProfile: profile, discoveryFamily: profile.family, rand: random() }))
    await db.collection('items').insertMany(docs)
    const decode = (row: Record<string, unknown>) => ({ id: String(row._id), type: String(row.type) })
    const newsProfile = buildProfile({ title: 'Stone carving daily news bulletin' })
    const funnyProfile = buildProfile({ title: 'Stone carving daily news parody comedy' })
    await db.collection('items').insertMany([
      { type: 'video', provider: 'youtube', url: 'https://example.invalid/routine', videoId: 'routine-news',
        title: 'Stone carving daily news bulletin', sourceMetadata: { title: 'Stone carving daily news bulletin' },
        discoveryVersion: 2, discoveryProfile: newsProfile, discoveryFamily: 'music', rand: .2 },
      { type: 'video', provider: 'youtube', url: 'https://example.invalid/parody', videoId: 'routine-parody',
        title: 'Stone carving daily news parody comedy', sourceMetadata: { title: 'Stone carving daily news parody comedy' },
        discoveryVersion: 2, discoveryProfile: funnyProfile, discoveryFamily: 'music', rand: .4 },
    ])
    const coolCandidates = await loadPoolCandidates(db, { ...planDraw(newSession(140), 'video'), mode: 'cool', branch: 'autonomous', lane: 'described' },
      'en', decode, () => .1, now)
    assert.ok(!coolCandidates.some(candidate => candidate.key.includes('routine-news')))
    assert.ok(coolCandidates.some(candidate => candidate.key.includes('routine-parody')))
    let state = newSession(14)
    for (let i = 0; i < 40; i++) {
      const ticket = planDraw(state, i % 3 ? 'video' : 'image')
      const chosen = await selectPool(db, ticket, state, 'en', decode, random, now)
      assert.ok(chosen); assert.ok(!chosen.item.stock)
      state = commitDraw(state, ticket, chosen.item)
    }
    const anchor = await db.collection('items').findOne({ type: 'video' })
    const wave = await loadWave(db, String(anchor!._id), 'en', ['video', 'image'], decode, random, now)
    assert.ok(wave?.plan.ready)
    assert.equal(wave.plan.trio.length, 3); assert.ok(wave.plan.trio.some(x => x.type === 'video'))
    await db.collection('items').insertOne({ type: 'fact', provider: 'open-trivia-db', variant: 'quiz',
      quiz: { id: 'quiz-without-language', question: 'Universal quiz?', answers: ['Yes', 'No'], correctIndex: 0 },
      discoveryVersion: 2, discoveryProfile: profile, discoveryFamily: profile.family, rand: random() })
    const textState = newSession(91), textTicket = planDraw(textState, 'fact')
    const quiz = await selectPool(db, textTicket, textState, 'jp', decode, random, now, 'quiz')
    assert.ok(quiz); assert.equal(quiz.item.type, 'fact')
    for (let i = 0; i < 100; i++) await saveOwnerReference(db, { contentKey: `reference-${i}`, ownerId: 'owner', active: true, familyId: 'craft', profile, type: 'video', version: 2 })
    const candidates = [candidateFromRow(anchor!, decode(anchor!), now)]
    const assigned = await applyOwnerReferences(db, candidates, 'owner')
    assert.ok(assigned.candidates[0].editorialFamilies?.includes('craft'))
    await db.collection('discovery_owner_references_v2').updateMany({ ownerId: 'owner' }, { $set: { active: false } })
    assert.deepEqual((await applyOwnerReferences(db, candidates, 'owner')).referenceCounts, {})
  } finally { await db.dropDatabase(); await client.close() }
})

test('MongoDB: enabling exploration reserves its budget even when the base job runs first', { skip: !uri }, async () => {
  const client = new MongoClient(uri!, { serverSelectionTimeoutMS: 5000 })
  const db = client.db(`random_discovery_test_${randomUUID().replaceAll('-', '')}`)
  const before = process.env.RANDOM_DISCOVERY_WORKER_ENABLED
  try {
    process.env.RANDOM_DISCOVERY_WORKER_ENABLED = '1'
    const config = { searchDailyLimit: 100, otherDailyLimit: 10000, searchBaseReserve: 80, otherBaseReserve: 9000, extraSearchLimit: 20 }
    const base = await Promise.all(Array.from({ length: 110 }, () => reserveQuota(db, config, 'search', 'base', Date.now())))
    assert.equal(base.filter(Boolean).length, 95)
    const extra = await Promise.all(Array.from({ length: 12 }, () => reserveQuota(db, config, 'search', 'exploration', Date.now())))
    assert.equal(extra.filter(Boolean).length, 5)
  } finally {
    if (before === undefined) delete process.env.RANDOM_DISCOVERY_WORKER_ENABLED; else process.env.RANDOM_DISCOVERY_WORKER_ENABLED = before
    await db.dropDatabase(); await client.close()
  }
})
