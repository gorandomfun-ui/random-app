import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'

/**
 * The queue routes against a real database: `${MONGODB_DB}_test` on the same
 * cluster, never the production one. Run with the environment loaded:
 *   node --env-file=.env.local --import tsx --test tests/comm/routes.mongo.test.ts
 * Without MONGODB_URI the whole file is skipped.
 */

const uri = process.env.MONGODB_URI || process.env.MONGO_URI
const productionDb = process.env.MONGODB_DB || process.env.MONGO_DB || 'randomapp'
const testDb = `${productionDb}_test`
if (uri) { process.env.MONGODB_DB = testDb; process.env.MONGO_DB = testDb }
process.env.RANDOM_CURATOR_SECRET = 'test-only-secret-012345678901234567890'
process.env.NEXT_PUBLIC_COMM_QUEUE_MAX = '2'
delete process.env.BLOB_READ_WRITE_TOKEN

const skip = uri ? false : 'MONGODB_URI is not set'
const ORIGIN = 'https://comm.test'

let db: import('mongodb').Db
let queue: typeof import('@/app/api/admin/comm/queue/route')
let queueOne: typeof import('@/app/api/admin/comm/queue/[id]/route')
let media: typeof import('@/app/api/admin/comm/media/route')
let imports: typeof import('@/app/api/admin/comm/media/import/route')
let cookie = ''
const ids: string[] = []

function request(path: string, init: { method?: string; body?: unknown; auth?: boolean; origin?: string } = {}): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (init.auth !== false) headers.cookie = cookie
  if (init.method && init.method !== 'GET') headers.origin = init.origin ?? ORIGIN
  return new Request(`${ORIGIN}${path}`, { method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) })
}

before(async () => {
  if (!uri) return
  const { getDb } = await import('@/lib/db')
  db = await getDb()
  const { createCuratorToken, CURATOR_COOKIE } = await import('@/lib/discovery/curatorAuth')
  cookie = `${CURATOR_COOKIE}=${createCuratorToken()}`
  queue = await import('@/app/api/admin/comm/queue/route')
  queueOne = await import('@/app/api/admin/comm/queue/[id]/route')
  media = await import('@/app/api/admin/comm/media/route')
  imports = await import('@/app/api/admin/comm/media/import/route')
  await db.collection('comm_queue').deleteMany({})
  await db.collection('comm_media').deleteMany({})
  const inserted = await db.collection('items').insertMany([
    { type: 'video', provider: 'youtube', title: 'Vidéo de test', url: 'https://youtu.be/abc', thumb: 'https://i.ytimg.com/vi/abc/hqdefault.jpg', channelTitle: 'Chaîne test', duration: 'PT20S', source: { name: 'YouTube', url: 'https://youtu.be/abc' }, v3: { subjects: [{ id: 'topic:test-comm', role: 'primary' }] } },
    { type: 'image', provider: 'pexels', url: 'https://images.pexels.com/x.jpeg', source: { name: 'Pexels', url: 'https://www.pexels.com/photo/x/' } },
    { type: 'quote', provider: 'wikiquote', text: 'Une citation.', author: 'Quelqu’un', source: { name: 'Wikiquote', url: 'https://wikiquote.org/x' } },
  ])
  ids.push(...Object.values(inserted.insertedIds).map(String))
  await db.collection('subjects_v3').updateOne({ _id: 'topic:test-comm' } as never, { $set: { label: 'test comm' } }, { upsert: true })
})

after(async () => {
  if (!uri) return
  await db.collection('items').deleteMany({ title: 'Vidéo de test' })
  await db.collection('items').deleteMany({ url: 'https://images.pexels.com/x.jpeg' })
  await db.collection('items').deleteMany({ text: 'Une citation.' })
  await db.collection('subjects_v3').deleteOne({ _id: 'topic:test-comm' } as never)
  await db.collection('comm_queue').deleteMany({})
  await db.collection('comm_media').deleteMany({})
  const { default: client } = await import('@/lib/db')
  await (await client).close()
})

test('sans le cookie du curateur, rien ; avec, la file se lit', { skip }, async () => {
  assert.equal((await queue.GET(request('/api/admin/comm/queue', { auth: false }))).status, 401)
  assert.equal((await queue.POST(request('/api/admin/comm/queue', { method: 'POST', body: { itemId: ids[0] }, auth: false }))).status, 401)
  assert.equal((await queue.POST(request('/api/admin/comm/queue', { method: 'POST', body: { itemId: ids[0] }, origin: 'https://elsewhere.test' }))).status, 401, 'une autre origine est refusée')
  const body = await (await queue.GET(request('/api/admin/comm/queue'))).json()
  assert.equal(body.count, 0); assert.equal(body.max, 2); assert.equal(body.blob, false); assert.deepEqual(body.items, [])
})

test('mettre de côté est idempotent, le snapshot vient de la base, les sujets ont leur libellé', { skip }, async () => {
  const first = await (await queue.POST(request('/api/admin/comm/queue', { method: 'POST', body: { itemId: ids[0] } }))).json()
  assert.equal(first.created, true); assert.equal(first.count, 1)
  assert.equal(first.item.contentType, 'video'); assert.equal(first.item.snapshot.author, 'Chaîne test'); assert.equal(first.item.snapshot.durationSec, 20); assert.equal(first.item.licenseHint, 'prudence')
  assert.deepEqual(first.item.subjects, [{ id: 'topic:test-comm', role: 'primary', label: 'test comm' }])
  const again = await (await queue.POST(request('/api/admin/comm/queue', { method: 'POST', body: { itemId: ids[0] } }))).json()
  assert.equal(again.created, false); assert.equal(again.item._id, first.item._id); assert.equal(again.count, 1)
  assert.equal(await db.collection('comm_queue').countDocuments({ contentId: ids[0] }), 1, 'unicité sur contentId')
  const status = await (await queue.GET(request(`/api/admin/comm/queue?itemId=${ids[0]}`))).json()
  assert.equal(status.inQueue, true); assert.equal(status.item._id, first.item._id)
  const other = await (await queue.GET(request(`/api/admin/comm/queue?itemId=${ids[1]}`))).json()
  assert.equal(other.inQueue, false)
})

test('au plafond, un clic n_ajoute rien et répond 409', { skip }, async () => {
  const second = await queue.POST(request('/api/admin/comm/queue', { method: 'POST', body: { itemId: ids[1] } }))
  assert.equal(second.status, 200)
  const third = await queue.POST(request('/api/admin/comm/queue', { method: 'POST', body: { itemId: ids[2] } }))
  assert.equal(third.status, 409)
  const body = await third.json()
  assert.equal(body.error, 'full'); assert.equal(body.count, 2); assert.equal(body.max, 2)
  assert.equal((await queue.POST(request('/api/admin/comm/queue', { method: 'POST', body: { itemId: 'nope' } }))).status, 400)
  assert.equal((await queue.POST(request('/api/admin/comm/queue', { method: 'POST', body: { itemId: 'ffffffffffffffffffffffff' } }))).status, 409, 'plein avant même de chercher')
})

test('un média ne s_enregistre que dans le dossier Blob de son élément ; sans Blob, l_import le dit', { skip }, async () => {
  const row = await db.collection('comm_queue').findOne({ contentId: ids[1] })
  const id = String(row!._id)
  const good = { queueItemId: id, kind: 'image', blobUrl: `https://store.public.blob.vercel-storage.com/comm/${id}/aabbccddeeff001122334455.jpg`, contentType: 'image/jpeg', bytes: 1234, width: 10, height: 20 }
  const ok = await (await media.POST(request('/api/admin/comm/media', { method: 'POST', body: good }))).json()
  assert.ok(ok.media?._id); assert.equal(ok.media.animated, false); assert.equal(ok.media.blobKey, `comm/${id}/aabbccddeeff001122334455.jpg`)
  assert.equal((await media.POST(request('/api/admin/comm/media', { method: 'POST', body: { ...good, blobUrl: `https://store.public.blob.vercel-storage.com/comm/ffffffffffffffffffffffff/x.jpg` } }))).status, 400, 'un autre dossier')
  assert.equal((await media.POST(request('/api/admin/comm/media', { method: 'POST', body: { ...good, blobUrl: 'https://example.com/x.jpg' } }))).status, 400, 'hors Blob')
  assert.equal((await media.POST(request('/api/admin/comm/media', { method: 'POST', body: { ...good, contentType: 'text/html' } }))).status, 400, 'pas un média')
  assert.equal((await media.POST(request('/api/admin/comm/media', { method: 'POST', body: good, auth: false }))).status, 401)
  const imported = await imports.POST(request('/api/admin/comm/media/import', { method: 'POST', body: { queueItemId: id, what: 'image' } }))
  assert.equal(imported.status, 503); assert.equal((await imported.json()).error, 'no-blob')
  const listed = await (await queue.GET(request('/api/admin/comm/queue'))).json()
  assert.equal(listed.items.find((item: { _id: string }) => item._id === id).media.length, 1)
})

test('retirer un élément emporte ses médias, et libère une place', { skip }, async () => {
  const row = await db.collection('comm_queue').findOne({ contentId: ids[1] })
  const id = String(row!._id)
  assert.equal((await queueOne.DELETE(request(`/api/admin/comm/queue/${id}`, { method: 'DELETE', auth: false }), { params: { id } })).status, 401)
  const removed = await (await queueOne.DELETE(request(`/api/admin/comm/queue/${id}`, { method: 'DELETE' }), { params: { id } })).json()
  assert.equal(removed.removed, true); assert.equal(removed.count, 1)
  assert.equal(await db.collection('comm_media').countDocuments({ queueItemId: id }), 0)
  assert.equal((await queueOne.GET(request(`/api/admin/comm/queue/${id}`), { params: { id } })).status, 404)
  const third = await queue.POST(request('/api/admin/comm/queue', { method: 'POST', body: { itemId: ids[2] } }))
  assert.equal(third.status, 200)
  const body = await third.json()
  assert.equal(body.item.contentType, 'quote'); assert.equal(body.item.snapshot.text, 'Une citation.'); assert.equal(body.item.snapshot.author, 'Quelqu’un')
})
