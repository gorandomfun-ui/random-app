import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'

/**
 * Drafts, export, the links page's rows and the counted redirect, against
 * `${MONGODB_DB}_test`. Run with the environment loaded; skipped without it.
 */

const uri = process.env.MONGODB_URI || process.env.MONGO_URI
const productionDb = process.env.MONGODB_DB || process.env.MONGO_DB || 'randomapp'
if (uri) { process.env.MONGODB_DB = `${productionDb}_test`; process.env.MONGO_DB = `${productionDb}_test` }
process.env.RANDOM_CURATOR_SECRET = 'test-only-secret-012345678901234567890'
delete process.env.BLOB_READ_WRITE_TOKEN
const skip = uri ? false : 'MONGODB_URI is not set'

let db: import('mongodb').Db
let posts: typeof import('@/lib/comm/posts')
let queue: typeof import('@/lib/comm/queue')
let link: typeof import('@/app/l/[key]/route')
let model: typeof import('@/lib/comm/model')
const itemIds: string[] = []
let firstQueueId = ''
const ids0 = () => firstQueueId

before(async () => {
  if (!uri) return
  const { getDb } = await import('@/lib/db')
  db = await getDb()
  posts = await import('@/lib/comm/posts'); queue = await import('@/lib/comm/queue'); link = await import('@/app/l/[key]/route'); model = await import('@/lib/comm/model')
  await model.ensureCommIndexes(db)
  for (const name of ['comm_queue', 'comm_media', 'comm_posts']) await db.collection(name).deleteMany({})
  const inserted = await db.collection('items').insertMany([
    { type: 'video', provider: 'youtube', title: 'Brouillon vidéo #tag', url: 'https://youtu.be/draft1', thumb: 'https://i.ytimg.com/vi/draft1/hqdefault.jpg', channelTitle: 'Chaîne brouillon', duration: 'PT30S', source: { name: 'YouTube', url: 'https://youtu.be/draft1' }, v3: { subjects: [{ id: 'topic:moto', role: 'primary' }] } },
    { type: 'image', provider: 'pexels', url: 'https://images.pexels.com/draft.jpeg', source: { name: 'Pexels', url: 'https://www.pexels.com/photo/draft/' } },
  ])
  itemIds.push(...Object.values(inserted.insertedIds).map(String))
})

after(async () => {
  if (!uri) return
  await db.collection('items').deleteMany({ url: { $in: ['https://youtu.be/draft1', 'https://images.pexels.com/draft.jpeg'] } })
  for (const name of ['comm_queue', 'comm_media', 'comm_posts']) await db.collection(name).deleteMany({})
  const { default: client } = await import('@/lib/db')
  await (await client).close()
})

test('un brouillon prend un numéro, une clé, une slide par élément, et une légende avec ses lignes obligatoires', { skip }, async () => {
  const first = await queue.addToQueue(db, itemIds[0]); const second = await queue.addToQueue(db, itemIds[1])
  assert.ok(first.ok && second.ok)
  const ids = [first.item._id, second.item._id]
  firstQueueId = ids[0]
  const draft = await posts.createDraft(db, { destination: 'instagram', format: 'story', queueItemIds: ids })
  assert.ok(draft.ok)
  assert.equal(draft.post.number, 1); assert.match(draft.post.linkKey, /^[a-z0-9]{8}$/); assert.equal(draft.post.status, 'draft')
  assert.equal(draft.post.slides.length, 2); assert.equal(draft.post.slides[0].templateKey, 'story-encadre'); assert.equal(draft.post.slides[0].mediaId, null); assert.equal(draft.post.slides[0].itemId, ids[0])
  assert.ok(draft.post.caption.includes('Chaîne brouillon · YouTube')); assert.ok(draft.post.caption.includes('https://youtu.be/draft1')); assert.ok(draft.post.caption.includes('Lien dans la bio · n° 1'))
  assert.ok(draft.post.hashtags.includes('#Moto')); assert.equal(draft.post.sourceUrl, 'https://youtu.be/draft1')
  const again = await posts.createDraft(db, { destination: 'tiktok', format: 'video', queueItemIds: [ids[0]] })
  assert.ok(again.ok && again.post.number === 2)
  assert.equal((await posts.createDraft(db, { destination: 'reddit', format: 'link', queueItemIds: ids })).ok, false)
  assert.equal((await posts.createDraft(db, { destination: 'instagram', format: 'post', queueItemIds: ['ffffffffffffffffffffffff'] })).ok, false)
})

test('le brouillon survit et se borne : pas plus de slides que le format n_en permet, hashtags normalisés', { skip }, async () => {
  const row = await db.collection('comm_posts').findOne({ number: 1 })
  const id = String(row!._id)
  const ok = await posts.updateDraft(db, id, { captionHead: 'Mon texte', hashtags: ['#Moto', 'pas un tag', '#Ok_2'], slides: [{ itemId: ids0(), mediaId: null, templateKey: 'story-plein', text: 'Salut', palette: 3, logoVariant: 'black', glitch: 0.4 }] })
  assert.ok(ok.ok); assert.deepEqual(ok.post.hashtags, ['#Moto', '#Ok_2']); assert.equal(ok.post.slides[0].glitch, 0.4); assert.equal(ok.post.captionHead, 'Mon texte'); assert.equal(ok.post.slides[0].itemId, ids0())
  const reloaded = await posts.postById(db, id)
  assert.equal(reloaded?.slides[0].templateKey, 'story-plein')
  const tooMany = await posts.updateDraft(db, id, { slides: Array.from({ length: 11 }, () => ({ itemId: null, mediaId: null, templateKey: 'story-plein', text: '', palette: 0, logoVariant: 'white' as const })) })
  assert.equal(tooMany.ok, false)
  const tiktokRow = await db.collection('comm_posts').findOne({ number: 2 })
  const tooManyForVideo = await posts.updateDraft(db, String(tiktokRow!._id), { slides: [{ itemId: null, mediaId: null, templateKey: 'story-plein', text: '', palette: 0, logoVariant: 'white' }, { itemId: null, mediaId: null, templateKey: 'story-plein', text: '', palette: 0, logoVariant: 'white' }] })
  assert.equal(tooManyForVideo.ok, false, 'une vidéo TikTok : une seule slide')
})

test('après export, la publication reste seule, ses éléments partent sauf ceux gardés, et le lien compte', { skip }, async () => {
  const row = await db.collection('comm_posts').findOne({ number: 1 })
  const id = String(row!._id)
  const kept = row!.queueItemIds[1] as string
  assert.deepEqual(await posts.publishedPosts(db), [], 'un brouillon ne se montre pas')
  assert.equal(await posts.followLink(db, row!.linkKey), null, 'un brouillon ne redirige pas')
  const exported = await posts.markExported(db, id, [kept])
  assert.deepEqual(exported, { ok: true, removed: 1 })
  assert.equal(await db.collection('comm_queue').countDocuments({}), 1)
  const shown = await posts.publishedPosts(db)
  assert.equal(shown.length, 1); assert.equal(shown[0].number, 1); assert.equal(shown[0].title, 'Brouillon vidéo #tag'); assert.equal(shown[0].author, 'Chaîne brouillon')
  const response = await link.GET(new Request(`https://comm.test/l/${row!.linkKey}`), { params: { key: row!.linkKey } })
  assert.equal(response.status, 302); assert.equal(response.headers.get('location'), 'https://youtu.be/draft1')
  assert.equal((await posts.postById(db, id))?.clicks, 1)
  assert.equal((await link.GET(new Request('https://comm.test/l/zzzzzzzz'), { params: { key: 'zzzzzzzz' } })).status, 404)
  assert.equal((await link.GET(new Request('https://comm.test/l/../x'), { params: { key: '../x' } })).status, 404)
})
