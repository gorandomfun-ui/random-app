import assert from 'node:assert/strict'
import test from 'node:test'

import { ObjectId, type Db, type Document } from 'mongodb'

import { authorMore, authorSeries, videoChannelKey } from '../../lib/discovery/author'

type Asked = { name: string; filter: Document; options: Document }

/** Collections by name: what a count or a read asked, the rows a read gives. */
function fakeDb(rows: Record<string, Document[]>, asked: Asked[], total = 0): Db {
  const collection = (name: string) => ({
    countDocuments: async (filter: Document, options: Document) => { asked.push({ name, filter, options }); return Math.min(total, Number(options.limit ?? total)) },
    find: (filter: Document, options: Document) => ({ toArray: async () => { asked.push({ name, filter, options }); return [...(rows[name] ?? [])] } }),
  })
  return { collection } as unknown as Db
}

test("an author's other videos are counted through the channel key's index, up to a series, never the one on screen", async () => {
  const asked: Asked[] = []
  const shown = new ObjectId().toHexString()
  assert.equal(await authorMore(fakeDb({}, asked, 9), 'dailymotion:x2b1rhk', shown), 5)
  assert.equal(asked[0].name, 'items')
  assert.equal(asked[0].filter['v3.channelKey'], 'dailymotion:x2b1rhk')
  assert.equal(asked[0].filter.type, 'video')
  assert.equal(String((asked[0].filter._id as { $nin: ObjectId[] }).$nin[0]), shown)
  assert.equal(asked[0].options.hint, 'v3_channel_key')
  assert.equal(asked[0].options.limit, 5)
})

test("a Bilibili uploader is counted in Bilibili's own collection, among the videos its phone player can play", async () => {
  const asked: Asked[] = []
  assert.equal(await authorMore(fakeDb({}, asked, 2), 'bilibili:123456', ''), 2)
  assert.equal(asked[0].name, 'bilibili_videos')
  assert.equal(asked[0].filter.channelId, 'bilibili:123456')
  assert.ok(asked[0].filter.url)
})

test('a key the site cannot read counts nothing and reads nothing', async () => {
  const asked: Asked[] = []
  assert.equal(await authorMore(fakeDb({}, asked, 9), 'dailymotion:news', ''), 0)
  assert.deepEqual(await authorSeries(fakeDb({}, asked), 'vimeo:1', []), [])
  assert.equal(asked.length, 0)
})

test('a series: five of the author\'s videos at random', async () => {
  const asked: Asked[] = []
  const rows = Array.from({ length: 12 }, (_, index) => ({ _id: new ObjectId(), title: `video ${index}` }))
  let seed = 7
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  const series = await authorSeries(fakeDb({ items: rows }, asked), 'youtube:UCX6OQ3DkcsbYNE6H8uQQuVA', [String(rows[0]._id)], random)
  assert.equal(series.length, 5)
  assert.equal(new Set(series.map((row) => String(row._id))).size, 5)
  assert.notDeepEqual(series.map((row) => row.title), rows.slice(0, 5).map((row) => row.title), 'shuffled, not the first five')
})

test("a video's author key: the tagging's first, never a Dailymotion category, a Bilibili uploader as kept", () => {
  assert.equal(videoChannelKey({ provider: 'dailymotion', channelId: 'x2b1rhk', v3: { channelKey: 'dailymotion:x2b1rhk' } }), 'dailymotion:x2b1rhk')
  assert.equal(videoChannelKey({ provider: 'youtube', channelId: 'UCX6OQ3DkcsbYNE6H8uQQuVA' }), 'youtube:UCX6OQ3DkcsbYNE6H8uQQuVA')
  assert.equal(videoChannelKey({ provider: 'dailymotion', channelId: 'news' }), undefined)
  assert.equal(videoChannelKey({ provider: 'bilibili', channelId: 'bilibili:123456' }), 'bilibili:123456')
})
