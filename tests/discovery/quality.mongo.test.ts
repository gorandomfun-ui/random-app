import test from 'node:test'
import assert from 'node:assert/strict'
import { MongoClient, ObjectId } from 'mongodb'
import { randomUUID } from 'node:crypto'
import { buildProfile } from '../../lib/discovery/profile'
import { candidateFromRow } from '../../lib/discovery/catalog'
import { loadWave, selectPool, installDiscoveryIndexes } from '../../lib/discovery/mongo'
import { saveOwnerReference, applyOwnerReferences, installOwnerIndexes } from '../../lib/discovery/ownerStore'
import { newSession, planDraw, commitDraw, type Intent } from '../../lib/discovery/pool'
import { seeded } from '../../lib/discovery/random'

const uri = process.env.RANDOM_TEST_MONGO_URI
test('MongoDB: changing a GIF canonical key preserves one reversible owner reference', { skip: !uri }, async () => {
  const client = new MongoClient(uri!, { serverSelectionTimeoutMS: 5000 })
  const db = client.db(`random_discovery_test_${randomUUID().replaceAll('-', '')}`)
  try {
    await installOwnerIndexes(db)
    const reference = { ownerId: 'owner', itemId: String(new ObjectId()), contentKey: 'image:https://media.giphy.com/media/abc123/giphy.gif?cid=old',
      active: true, type: 'image' as const, familyId: 'craft', version: 2, publicLikeCounted: true,
      profile: buildProfile({ title: 'Stone carving' }) }
    await saveOwnerReference(db, reference)
    await saveOwnerReference(db, { ...reference, contentKey: 'giphy:abc123', active: false, publicLikeCounted: false })
    assert.equal(await db.collection('discovery_owner_references_v2').countDocuments({ ownerId: 'owner' }), 1)
    const stored = await db.collection('discovery_owner_references_v2').findOne({ ownerId: 'owner', itemId: reference.itemId })
    assert.equal(stored?.contentKey, 'giphy:abc123'); assert.equal(stored?.active, false)
  } finally { await db.dropDatabase(); await client.close() }
})

test('MongoDB: stale indexed profiles are corrected without writes; owner references follow the same rule', { skip: !uri }, async () => {
  const client = new MongoClient(uri!, { serverSelectionTimeoutMS: 5000 })
  const db = client.db(`random_discovery_test_${randomUUID().replaceAll('-', '')}`), now = Date.now()
  try {
    await installDiscoveryIndexes(db); await installOwnerIndexes(db)
    const noisy = { version: 2, tokens: ['football', 'cooking', 'gameplay', 'stone', 'carving'],
      practices: ['football', 'cooking', 'gameplay', 'stone-carving'], themes: ['sport', 'craft'], family: 'sport', evidence: 'described', entities: [] }
    const make = (id: number, title: string, type = 'video') => ({ _id: new ObjectId(),
      type, provider: type === 'video' ? 'youtube' : 'giphy', videoId: `fixture-${id}`, url: `https://example.invalid/${id}`,
      title, sourceMetadata: { title, tags: ['football', 'cooking', 'gameplay'] },
      discoveryVersion: 2, discoveryProfile: noisy, discoveryFamily: 'sport', rand: id / 20 })
    const anchor = make(1, 'Stone carving workshop')
    const documents = [anchor, make(2, 'Stone carving tools'), make(3, 'Stone carving garden'), make(4, 'Stone carving sculpture', 'image'),
      make(5, 'Psychological facts about love'), make(6, 'A heartfelt ballad about romance')]
    await db.collection('items').insertMany(documents)
    const decode = (row: Record<string, unknown>) => ({ id: String(row._id), title: String(row.title) })
    const result = await loadWave(db, String(anchor._id), 'en', ['video', 'image'], decode, seeded(1), now)
    assert.ok(result?.plan.ready)
    assert.ok(result.plan.trio.every(x => x.payload.title.startsWith('Stone carving')))
    assert.ok(result.plan.trio.every(x => x.profile.signalVersion === 3))
    const stored = await db.collection('items').findOne({ _id: anchor._id })
    assert.equal(stored?.discoveryProfile.signalVersion, undefined)
    await saveOwnerReference(db, { ownerId: 'owner', contentKey: `youtube:${anchor.videoId}`, itemId: String(anchor._id),
      familyId: 'sport', active: true, type: 'video', version: 2, profile: noisy as ReturnType<typeof buildProfile> })
    const assigned = await applyOwnerReferences(db, documents.slice(1).map(row => candidateFromRow(row, decode(row), now)), 'owner')
    assert.ok(assigned.candidates[0].editorialFamilies?.includes('craft'))
    assert.deepEqual(assigned.candidates[3].editorialFamilies, [])
    assert.equal((await db.collection('discovery_owner_references_v2').findOne({ ownerId: 'owner' }))?.profile.signalVersion, undefined)
  } finally { await db.dropDatabase(); await client.close() }
})

test('MongoDB: editorial retrieval preserves a trend lane and seen-only trends do not freeze the video slot', { skip: !uri }, async () => {
  const client = new MongoClient(uri!, { serverSelectionTimeoutMS: 5000 })
  const db = client.db(`random_discovery_test_${randomUUID().replaceAll('-', '')}`), now = Date.now()
  try {
    await installDiscoveryIndexes(db); await installOwnerIndexes(db)
    const profile = buildProfile({ title: 'Stone carving workshop' })
    const make = (id: string, trend = false) => ({ _id: new ObjectId(), type: 'video', provider: 'youtube', videoId: id,
      title: 'Stone carving workshop', sourceMetadata: { title: 'Stone carving workshop' }, discoveryVersion: 2,
      discoveryProfile: profile, discoveryFamily: 'craft', rand: .5, ...(trend ? { trendObservedAt: new Date(now - 1000) } : {}) })
    const trending = make('trend', true), general = make('general')
    await db.collection('items').insertMany([trending, general])
    await saveOwnerReference(db, { ownerId: 'owner', contentKey: 'youtube:general', itemId: String(general._id),
      familyId: 'craft', active: true, type: 'video', version: 2, profile })
    const decode = (row: Record<string, unknown>) => String(row._id)
    let state = newSession(1)
    const ticket: Intent = { ...planDraw(state, 'video'), branch: 'editorial', lane: 'trend', allowDirectReference: true }
    const first = await selectPool(db, ticket, state, 'en', decode, seeded(1), now, undefined, 'owner')
    assert.equal(first?.item.key, 'youtube:trend')
    state = commitDraw(state, ticket, first!.item)
    const next = await selectPool(db, { ...ticket, revision: state.revision }, state, 'en', decode, seeded(1), now, undefined, 'owner')
    assert.equal(next?.item.key, 'youtube:general')
    assert.equal(next?.selection?.servedLane, 'any')
    assert.ok(next?.selection?.reasons.includes('requested-lane-unavailable'))
  } finally { await db.dropDatabase(); await client.close() }
})
