import test from 'node:test'
import assert from 'node:assert/strict'
import { MongoClient, ObjectId } from 'mongodb'
import { randomUUID } from 'node:crypto'
import { buildProfile } from '../../lib/discovery/profile'
import { installDiscoveryIndexes, loadWave, selectPool, loadPoolCandidates } from '../../lib/discovery/mongo'
import { newSession, planDraw, commitDraw } from '../../lib/discovery/pool'
import { candidateFromRow } from '../../lib/discovery/catalog'
import { seeded } from '../../lib/discovery/random'
import { repairMetadataBatch } from '../../lib/discovery/metadataRepair'

const uri = process.env.RANDOM_TEST_MONGO_URI, now = Date.UTC(2026, 8, 13)
async function database(run: (db: import('mongodb').Db) => Promise<void>) {
  const client = new MongoClient(uri!), db = client.db(`random_repair_test_${randomUUID().replaceAll('-', '')}`)
  try { await installDiscoveryIndexes(db); await run(db) } finally { await db.dropDatabase(); await client.close() }
}
const row = (id: number, title: string, type = 'video') => {
  const profile = buildProfile({ title })
  return { _id: new ObjectId(), type, provider: type === 'video' ? 'youtube' : 'fixture', videoId: `id${id}`,
    title, url: `https://example.invalid/${id}`, sourceMetadata: { title }, discoveryVersion: 2,
    discoveryProfile: profile, discoveryFamily: profile.family, rand: seeded(id)() }
}
test('Mongo: a handful of recent videos remain retrievable among 12000 old videos; seen recent rows fall back', { skip: !uri }, async () => database(async db => {
  await db.collection('items').insertMany(Array.from({ length: 12000 }, (_, i) => ({ ...row(i, 'Pottery workshop'), publishedAt: new Date(now - 1000 * 86400000) })))
  const fresh = Array.from({ length: 4 }, (_, i) => ({ ...row(20000 + i, 'Independent game speedrun'), publishedAt: new Date(now - (i + 1) * 86400000) }))
  await db.collection('items').insertMany(fresh)
  let state = newSession(1)
  const ticket = { ...planDraw(state, 'video'), mode: 'cool' as const, branch: 'autonomous' as const, lane: 'recent' as const }
  const candidates = await loadPoolCandidates(db, ticket, 'en', r => String(r._id), seeded(11), now, undefined,
    { rand: { $gte: fresh[0].rand - .000001, $lt: fresh[0].rand + .000001 } })
  assert.ok(candidates.some(c => c.key === 'youtube:id20000'), 'the recent window actually enriches the broad sample')
  assert.ok(candidates.length > 50, 'four recent videos cannot reduce the whole choice to four')
  for (const document of fresh) state = commitDraw(state, { ...ticket, revision: state.revision }, candidateFromRow(document, String(document._id), now))
  const result = await selectPool(db, { ...ticket, revision: state.revision }, state, 'en', r => String(r._id), seeded(1), now)
  assert.ok(result)
  assert.equal(result.selection?.servedLane, 'any')

}))
test('Mongo: real title forms previously inventing an entity now retrieve video/image trios', { skip: !uri }, async () => database(async db => {
  const anchor = row(1, 'Live Pottery Replay - Hairy Potter Makes Some Bowls!')
  await db.collection('items').insertMany([anchor, row(2, 'Pottery techniques'), row(3, 'Pottery garden sculpture', 'image'), row(4, 'Pottery wheel workshop')])
  const result = await loadWave(db, String(anchor._id), 'en', ['video', 'image'], r => String(r.title), seeded(1), now)
  assert.ok(result?.plan.ready)
  assert.ok(result.plan.trio.some(c => c.type === 'video'))
  assert.ok(result.diagnostics.queries <= 8)
}))
test('Mongo: an unverified generic anchor does not launch broad catalogue searches', { skip: !uri }, async () => database(async db => {
  const sourceMetadata = { title: 'ANIMATION vidéo', description: 'An unrelated creator announcement appears here.\nA separate animal story appears in this paragraph.\nAn unrelated toy demonstration appears here.' }
  const profile = buildProfile(sourceMetadata)
  const anchor = { ...row(90, sourceMetadata.title), sourceMetadata, discoveryProfile: profile }
  await db.collection('items').insertOne(anchor)
  const result = await loadWave(db, String(anchor._id), 'en', ['video', 'image', 'fact'], r => String(r.title), seeded(1), now)
  assert.ok(result && !result.plan.ready)
  assert.equal(result.diagnostics.queries, 0)
  assert.equal(result.diagnostics.unverifiedMetadata, 1)
}))
test('Mongo: repair uses one quota reservation; preserves identity, likes, moderation, dates and concurrent updates', { skip: !uri }, async () => database(async db => {
  const document = { ...row(1, 'Legacy title'), videoId: 'aaaaaaaaaaa', likeCount: 9, isSuppressed: true, trendObservedAt: new Date(now - 1000), discoveryQueries: ['original-query'] }
  await db.collection('items').insertOne(document)
  let calls = 0, permits = 0
  const request = (async () => { calls++; return Response.json({ items: [{ id: 'aaaaaaaaaaa', snippet: { title: 'Pottery at home', channelId: 'real-author', categoryId: '26', publishedAt: '2026-09-11' }, statistics: { viewCount: '17' } }] }) }) as typeof fetch
  const denied = await repairMetadataBatch(db, 'youtube', [document], { request, now, permit: async () => false })
  assert.equal(denied.status, 'quota'); assert.equal(calls, 0)
  const result = await repairMetadataBatch(db, 'youtube', [document], { request, now, permit: async () => { permits++; return true } })
  assert.equal(permits, 1); assert.equal(result.updated, 1)
  const saved = await db.collection('items').findOne({ _id: document._id })
  for (const key of ['videoId', 'rand', 'likeCount', 'isSuppressed', 'trendObservedAt', 'discoveryQueries'] as const) assert.deepEqual(saved?.[key], document[key])
  assert.equal(saved?.title, 'Pottery at home'); assert.equal(saved?.channelId, 'real-author')
  assert.equal(saved?.viewCount, 17)
  const stale = await repairMetadataBatch(db, 'youtube', [document], { request, now, permit: async () => true })
  assert.equal(stale.updated, 0, 'concurrent ingestion metadata wins over the older sampled snapshot')
}))
