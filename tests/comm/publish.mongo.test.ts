import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'

/**
 * The publication flow against `${MONGODB_DB}_test` and a pretend Instagram:
 * the lock, the containers, the polling, the publish, the comment, the
 * cleanup; the failure that frees the draft. Skipped without MONGODB_URI.
 */

const uri = process.env.MONGODB_URI || process.env.MONGO_URI
const productionDb = process.env.MONGODB_DB || process.env.MONGO_DB || 'randomapp'
if (uri) { process.env.MONGODB_DB = `${productionDb}_test`; process.env.MONGO_DB = `${productionDb}_test` }
process.env.RANDOM_CURATOR_SECRET = 'test-only-secret-012345678901234567890'
process.env.INSTAGRAM_ACCESS_TOKEN = 'test-token-0123456789-0123456789'
process.env.INSTAGRAM_ACCOUNT_ID = '17841400000000000'
delete process.env.BLOB_READ_WRITE_TOKEN
const skip = uri ? false : 'MONGODB_URI is not set'

let db: import('mongodb').Db
let publish: typeof import('@/lib/comm/publish')
let posts: typeof import('@/lib/comm/posts')
let queue: typeof import('@/lib/comm/queue')
const itemIds: string[] = []
let queueIds: string[] = []
let postId = ''
const STORE = 'https://store.public.blob.vercel-storage.com'

type Answer = { status?: number; body: unknown }
function fakeApi(answers: Answer[]) {
  const calls: Array<{ url: string; fields: Record<string, string> }> = []
  const fetchImpl = async (url: string, init?: RequestInit) => {
    const fields: Record<string, string> = {}
    if (init?.body instanceof URLSearchParams) for (const [k, v] of init.body.entries()) fields[k] = v
    calls.push({ url, fields })
    const answer = answers.shift() ?? { status: 500, body: { error: { message: 'no answer' } } }
    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200, headers: { 'content-type': 'application/json' } })
  }
  return { fetchImpl, calls }
}

before(async () => {
  if (!uri) return
  const { getDb } = await import('@/lib/db'); db = await getDb()
  publish = await import('@/lib/comm/publish'); posts = await import('@/lib/comm/posts'); queue = await import('@/lib/comm/queue')
  await (await import('@/lib/comm/model')).ensureCommIndexes(db)
  for (const name of ['comm_queue', 'comm_media', 'comm_posts']) await db.collection(name).deleteMany({})
  const inserted = await db.collection('items').insertMany([
    { type: 'image', provider: 'pexels', url: 'https://images.pexels.com/pub1.jpeg', source: { name: 'Pexels', url: 'https://www.pexels.com/photo/pub1/' } },
    { type: 'image', provider: 'pexels', url: 'https://images.pexels.com/pub2.jpeg', source: { name: 'Pexels', url: 'https://www.pexels.com/photo/pub2/' } },
  ])
  itemIds.push(...Object.values(inserted.insertedIds).map(String))
  const added = await Promise.all(itemIds.map((id) => queue.addToQueue(db, id)))
  queueIds = added.map((a) => (a.ok ? a.item._id : ''))
  const draft = await posts.createDraft(db, { destination: 'instagram', format: 'carousel', queueItemIds: queueIds })
  if (draft.ok) postId = draft.post._id
})

after(async () => {
  if (!uri) return
  await db.collection('items').deleteMany({ url: { $in: ['https://images.pexels.com/pub1.jpeg', 'https://images.pexels.com/pub2.jpeg'] } })
  for (const name of ['comm_queue', 'comm_media', 'comm_posts']) await db.collection(name).deleteMany({})
  const { default: client } = await import('@/lib/db'); await (await client).close()
})

const assets = () => [{ slideIndex: 0, url: `${STORE}/comm/${queueIds[0]}/a.jpg`, kind: 'image' as const }, { slideIndex: 1, url: `${STORE}/comm/${queueIds[1]}/b.jpg`, kind: 'image' as const }]

test('le démarrage refuse un fichier hors de la file, un format incohérent, et pose un verrou', { skip }, async () => {
  const outside = await publish.startInstagram(db, fakeApi([]).fetchImpl, postId, [{ slideIndex: 0, url: `${STORE}/comm/ffffffffffffffffffffffff/x.jpg`, kind: 'image' }, assets()[1]], [])
  assert.equal(outside.ok, false); assert.equal((outside as { status: number }).status, 400)
  const video = await publish.startInstagram(db, fakeApi([]).fetchImpl, postId, assets().map((a) => ({ ...a, kind: 'video' as const })), [])
  assert.equal(video.ok, false)
  const api = fakeApi([{ body: { id: 'child1' } }, { body: { id: 'child2' } }, { body: { id: 'carousel1' } }])
  const started = await publish.startInstagram(db, api.fetchImpl, postId, assets(), [queueIds[1]])
  assert.ok(started.ok); assert.deepEqual(started.containers, ['child1', 'child2']); assert.equal(started.carousel, 'carousel1')
  assert.equal(api.calls[0].fields.is_carousel_item, 'true'); assert.equal(api.calls[2].fields.children, 'child1,child2'); assert.ok(api.calls[2].fields.caption.includes('Lien dans la bio · n° 1'))
  const again = await publish.startInstagram(db, fakeApi([]).fetchImpl, postId, assets(), [])
  assert.equal(again.ok, false); assert.equal((again as { status: number }).status, 409, 'jamais deux publications à la fois')
})

test('le statut attend, puis publie, commente, enregistre, nettoie ; l_élément gardé reste', { skip }, async () => {
  await db.collection('comm_media').insertOne({ queueItemId: queueIds[0], kind: 'render', blobUrl: `${STORE}/comm/${queueIds[0]}/a.jpg`, blobKey: `comm/${queueIds[0]}/a.jpg`, contentType: 'image/jpeg', bytes: 10, width: 1, height: 1, durationSec: null, animated: false, createdAt: new Date(), trim: null, crop: null })
  const waiting = await publish.statusInstagram(db, fakeApi([{ body: { status_code: 'FINISHED' } }, { body: { status_code: 'IN_PROGRESS' } }, { body: { status_code: 'IN_PROGRESS' } }]).fetchImpl, postId)
  assert.deepEqual(waiting, { state: 'waiting', statuses: ['FINISHED', 'IN_PROGRESS', 'IN_PROGRESS'] })
  const api = fakeApi([{ body: { status_code: 'FINISHED' } }, { body: { status_code: 'FINISHED' } }, { body: { status_code: 'FINISHED' } }, { body: { id: 'media77' } }, { body: { id: 'media77', permalink: 'https://www.instagram.com/p/abc/' } }, { body: { id: 'comment1' } }])
  const done = await publish.statusInstagram(db, api.fetchImpl, postId)
  assert.deepEqual(done, { state: 'published', remoteId: 'media77', remoteUrl: 'https://www.instagram.com/p/abc/', commented: true, removed: 1 })
  assert.equal(api.calls[3].fields.creation_id, 'carousel1', 'c’est le carrousel qui se publie'); assert.ok(api.calls[5].fields.message.startsWith('Source : https://www.pexels.com/photo/pub1/'))
  const post = await posts.postById(db, postId)
  assert.equal(post?.status, 'published'); assert.equal(post?.remoteUrl, 'https://www.instagram.com/p/abc/'); assert.ok(post?.publishedAt)
  assert.equal(await db.collection('comm_media').countDocuments({ kind: 'render' }), 0, 'les rendus ont disparu')
  assert.equal(await db.collection('comm_queue').countDocuments({}), 1, 'un élément gardé, un parti')
  const again = await publish.statusInstagram(db, fakeApi([]).fetchImpl, postId)
  assert.equal(again.state, 'published', 'relire ne republie pas')
  assert.equal((await posts.publishedPosts(db))[0]?.number, 1)
})

test('un refus d_Instagram met le brouillon en échec, avec sa raison, et libère le verrou', { skip }, async () => {
  const draft = await posts.createDraft(db, { destination: 'instagram', format: 'post', queueItemIds: [queueIds[1]] })
  assert.ok(draft.ok)
  const id = draft.post._id
  const started = await publish.startInstagram(db, fakeApi([{ body: { id: 'c9' } }]).fetchImpl, id, [{ slideIndex: 0, url: `${STORE}/comm/${queueIds[1]}/p.jpg`, kind: 'image' }], [])
  assert.ok(started.ok)
  const failed = await publish.statusInstagram(db, fakeApi([{ body: { status_code: 'ERROR', status: 'Media is too large' } }]).fetchImpl, id)
  assert.equal(failed.state, 'failed'); assert.ok((failed as { reason: string }).reason.includes('ERROR'))
  const post = await posts.postById(db, id)
  assert.equal(post?.status, 'failed'); assert.ok(post?.error)
  const retry = await publish.startInstagram(db, fakeApi([{ status: 400, body: { error: { message: 'Invalid parameter', error_user_msg: 'Image trop lourde' } } }]).fetchImpl, id, [{ slideIndex: 0, url: `${STORE}/comm/${queueIds[1]}/p.jpg`, kind: 'image' }], [])
  assert.equal(retry.ok, false); assert.equal((retry as { reason: string }).reason, 'Image trop lourde')
  assert.equal((await posts.postById(db, id))?.status, 'failed')
  delete process.env.INSTAGRAM_ACCESS_TOKEN
  const unconfigured = await publish.startInstagram(db, fakeApi([]).fetchImpl, id, [], [])
  assert.equal(unconfigured.ok, false); assert.equal((unconfigured as { status: number }).status, 503)
})
