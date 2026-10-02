import assert from 'node:assert/strict'
import test from 'node:test'

import { ObjectId, type Db, type Document } from 'mongodb'

import { createKeptMemory, KEPT_CAP_SECONDS, KEPT_PER_DRAW } from '../../utils/keptMemory'
import { CURATED_SLOTS, effectiveServed, parseKept, recordKept, tilt, TILT_MAX, TILT_MIN } from '../../lib/discovery/kept'
import { makeRandomLoader } from '../../lib/discovery/controller'
import { newSession } from '../../lib/discovery/pool'
import type { Candidate } from '../../lib/discovery/types'

const id = (n: number) => n.toString(16).padStart(24, '0')

test('the device closes a visual with the seconds it stayed, capped, and hands a few reports to the next draw', () => {
  let now = 1_000
  const memory = createKeptMemory(() => now)
  memory.markShown(id(1), 'long'); now += 12_400
  memory.markShown(id(2)); now += 500_000
  memory.markShown(null); now += 3_000
  memory.markShown('not-an-id'); now += 2_000
  memory.markShown(id(3))
  assert.deepEqual(memory.takeKept(), [{ id: id(1), seconds: 12, card: 'long' }, { id: id(2), seconds: KEPT_CAP_SECONDS }])
  assert.deepEqual(memory.takeKept(), [])
  for (let n = 10; n < 10 + KEPT_PER_DRAW * 3; n += 1) { now += 1_000; memory.markShown(id(n)) }
  assert.equal(memory.takeKept().length, KEPT_PER_DRAW)
})

test('the reports ride with the draw, and the site keeps only well-formed ones', async () => {
  const bodies: Record<string, unknown>[] = []
  const request: typeof fetch = async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return new Response(null, { status: 204 }) }
  const store = { read: () => null, mark: () => undefined }
  const load = makeRandomLoader('fr', request, () => [], store, () => [{ id: id(7), seconds: 9 }])
  await load(newSession(1), 'video', new AbortController().signal)
  assert.deepEqual(bodies[0].kept, [{ id: id(7), seconds: 9 }])
  assert.deepEqual(parseKept([{ id: id(7), seconds: 9.6, card: 'bonus:music' }, { id: 'nope', seconds: 3 }, { id: id(8), seconds: -1 }, { id: id(9), seconds: 999, card: 'Bad Card!' }, 'x']), [{ id: id(7), seconds: 10, card: 'bonus:music' }, { id: id(9), seconds: KEPT_CAP_SECONDS }])
  assert.deepEqual(parseKept('x'), [])
})

test('one write adds the reports to the contents, one more to the day\'s tally by card', async () => {
  const writes: Document[] = []
  const tallies: Document[] = []
  const db = { collection: (name: string) => ({ bulkWrite: async (ops: Document[]) => { writes.push(...ops); return { matchedCount: ops.length } }, updateOne: async (filter: Document, update: Document) => { tallies.push({ name, filter, update }); return { matchedCount: 1 } } }) } as unknown as Db
  assert.equal(await recordKept(db, [{ id: id(1), seconds: 12, card: 'long' }, { id: id(2), seconds: 0 }], new Date('2026-10-01T21:00:00Z')), 2)
  assert.equal(writes.length, 2)
  assert.equal(tallies.length, 1)
  assert.equal(tallies[0].filter._id, '2026-10-01')
  assert.deepEqual(tallies[0].update.$inc, { 'cards.long.n': 1, 'cards.long.seconds': 12 })
  assert.ok(writes[0].updateOne.filter._id instanceof ObjectId)
  assert.deepEqual(writes[0].updateOne.update, { $inc: { 'served.kept': 1, 'served.seconds': 12 } })
  assert.equal(await recordKept(db, []), 0)
})

test('the tilt is slow and bounded, and only the curated cards read it', () => {
  assert.equal(tilt(undefined), 1)
  // One report of thirty seconds against a prior of five at ten: (30 + 50) / 6 = 13.3 s, a third more than the mean.
  assert.ok(Math.abs(tilt({ n: 1, seconds: 30 }) - 80 / 60) < 1e-9)
  assert.equal(tilt({ n: 1, seconds: 120 }), TILT_MAX)
  assert.equal(tilt({ n: 100, seconds: 0 }), TILT_MIN)
  assert.equal(tilt({ n: 100, seconds: 100 * 60 }), TILT_MAX)
  const loved = { served: 4, kept: { n: 20, seconds: 20 * 40 } } as Candidate
  const skipped = { served: 2, kept: { n: 20, seconds: 20 } } as Candidate
  assert.ok(CURATED_SLOTS.has('joker') && !CURATED_SLOTS.has('chance'))
  assert.ok(effectiveServed(loved, 'joker') < effectiveServed(skipped, 'joker'))
  assert.equal(effectiveServed(loved, 'chance'), 4)
  assert.equal(effectiveServed(skipped, 'chance'), 2)
})

test('"pas ça": the visual closes at once as refused, the site counts the refusal on the content and the day, and the tilt falls', async () => {
  let now = 1_000
  const memory = createKeptMemory(() => now)
  memory.markShown(id(1), 'taste'); now += 4_400
  memory.markDisliked(); now += 1_000
  memory.markDisliked() // nothing on screen: nothing more
  memory.markShown(id(2)); now += 2_000
  memory.markShown(id(3))
  assert.deepEqual(memory.takeKept(), [{ id: id(1), seconds: 4, card: 'taste', dislike: true }, { id: id(2), seconds: 2 }])
  assert.deepEqual(parseKept([{ id: id(1), seconds: 4, dislike: true }, { id: id(2), seconds: 4, dislike: 'yes' }]), [{ id: id(1), seconds: 4, dislike: true }, { id: id(2), seconds: 4 }])
  const writes: Document[] = []
  const tallies: Document[] = []
  const db = { collection: (name: string) => ({ bulkWrite: async (ops: Document[]) => { writes.push(...ops); return { matchedCount: ops.length } }, updateOne: async (filter: Document, update: Document) => { tallies.push({ name, filter, update }); return { matchedCount: 1 } } }) } as unknown as Db
  await recordKept(db, [{ id: id(1), seconds: 4, card: 'taste', dislike: true }, { id: id(2), seconds: 2, card: 'long' }], new Date('2026-10-02T21:00:00Z'))
  assert.deepEqual(writes[0].updateOne.update, { $inc: { 'served.kept': 1, 'served.seconds': 4, 'served.dislikes': 1 } })
  assert.deepEqual(writes[1].updateOne.update, { $inc: { 'served.kept': 1, 'served.seconds': 2 } })
  assert.deepEqual(tallies[0].update.$inc, { 'cards.taste.n': 1, 'cards.taste.seconds': 4, 'cards.taste.dislikes': 1, 'cards.long.n': 1, 'cards.long.seconds': 2 })
  assert.ok(tilt({ n: 1, seconds: 4, dislikes: 1 }) < tilt({ n: 1, seconds: 4 }))
  assert.equal(tilt({ n: 3, seconds: 0, dislikes: 3 }), TILT_MIN)
  const refused = { served: 1, kept: { n: 2, seconds: 20, dislikes: 2 } } as Candidate
  const plain = { served: 1, kept: { n: 2, seconds: 20 } } as Candidate
  assert.ok(effectiveServed(refused, 'taste') > effectiveServed(plain, 'taste'))
  assert.equal(effectiveServed(refused, 'chance'), 1)
})
