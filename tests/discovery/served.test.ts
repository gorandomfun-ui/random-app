import assert from 'node:assert/strict'
import test from 'node:test'

import { ObjectId, type Db, type Document } from 'mongodb'

import { countServed, servedCollection } from '../../lib/discovery/served'

type Write = { name: string; filter: Document; update: Document }

/** Collections by name, enough for the count's one write. */
function fakeDb(rows: Record<string, Document[]>, writes: Write[]): Db {
  const collection = (name: string) => ({
    updateOne: async (filter: Document, update: Document) => {
      writes.push({ name, filter, update })
      return { matchedCount: (rows[name] ?? []).filter((row) => String(row._id) === String(filter._id)).length }
    },
  })
  return { collection } as unknown as Db
}

test('a content is counted where it lives: Bilibili in its own collection, the rest in items', () => {
  assert.equal(servedCollection('bilibili'), 'bilibili_videos')
  assert.equal(servedCollection('youtube'), 'items')
  assert.equal(servedCollection('dailymotion'), 'items')
  assert.equal(servedCollection(undefined), 'items')
})

test("a Bilibili video's count is kept with it", async () => {
  const id = new ObjectId()
  const writes: Write[] = []
  const db = fakeDb({ bilibili_videos: [{ _id: id }] }, writes)
  assert.equal(await countServed(db, String(id), 1_000, 'bilibili'), true)
  assert.equal(writes[0].name, 'bilibili_videos')
  assert.deepEqual(writes[0].update.$inc, { 'served.n': 1 })
  // Until 21 October the write went to items, where no row has its id: nothing was ever kept.
  assert.equal(await countServed(db, String(id), 1_000), false)
  assert.equal(writes[1].name, 'items')
})
