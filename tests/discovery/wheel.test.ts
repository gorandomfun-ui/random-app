import assert from 'node:assert/strict'
import test from 'node:test'

import { ObjectId, type Db, type Document, type Filter } from 'mongodb'

import { candidateFromRow } from '../../lib/discovery/catalog'
import { appendExposure } from '../../lib/discovery/diversity'
import { newSession, planDraw, type Session } from '../../lib/discovery/pool'
import { countServed } from '../../lib/discovery/served'
import { choose, fillSlot, slotAt, WHEEL } from '../../lib/discovery/wheel'

test('the wheel: a session opens on the buzz, a round deals every card, never the same card twice in a row', () => {
  for (const seed of [1, 7, 4242, 987654321]) {
    assert.equal(slotAt(seed, 0), 'buzz')
    const round = Array.from({ length: WHEEL.length }, (_, index) => slotAt(seed, index))
    assert.deepEqual([...round].sort(), [...WHEEL].sort())
    const forty = Array.from({ length: 40 }, (_, index) => slotAt(seed, index))
    for (let index = 1; index < forty.length; index += 1) assert.notEqual(forty[index], forty[index - 1], `${seed}: card ${index}`)
    assert.deepEqual(forty, Array.from({ length: 40 }, (_, index) => slotAt(seed, index)))
  }
})

/** The items collection, enough for a seek: nested paths, ranges, `$ne`, sort by rand, limit; and the served count's write. */
function fakeDb(items: Document[], writes: Document[] = []): Db {
  const read = (row: Document, path: string) => path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], row)
  const holds = (value: unknown, wanted: unknown) => (Array.isArray(value) ? value.includes(wanted) : value === wanted)
  const matches = (row: Document, filter: Filter<Document>) => Object.entries(filter).every(([key, condition]) => {
    const value = read(row, key)
    if (condition && typeof condition === 'object' && !(condition instanceof ObjectId)) {
      const ops = condition as Record<string, unknown>
      if ('$ne' in ops && value === ops.$ne) return false
      if ('$gte' in ops && !((value as number) >= (ops.$gte as number))) return false
      if ('$gt' in ops && !((value as number) > (ops.$gt as number))) return false
      if ('$lt' in ops && !((value as number) < (ops.$lt as number))) return false
      if ('$in' in ops && !(ops.$in as unknown[]).some((wanted) => holds(value, wanted))) return false
      return true
    }
    return holds(value, condition)
  })
  const collection = () => ({
    find: (filter: Filter<Document>, options?: { limit?: number; sort?: Record<string, number> }) => ({
      toArray: async () => {
        let rows = items.filter((row) => matches(row, filter))
        if (options?.sort?.rand) rows = [...rows].sort((a, b) => (a.rand as number) - (b.rand as number))
        return options?.limit ? rows.slice(0, options.limit) : rows
      },
    }),
    updateOne: async (filter: Document, update: Document) => {
      writes.push({ filter, update })
      return { matchedCount: items.filter((row) => String(row._id) === String(filter._id)).length }
    },
  })
  return { collection } as unknown as Db
}

let ids = 0
const video = (title: string, options: { universe?: string; duration?: string; served?: number; channel?: string; live?: boolean; rand?: number } = {}): Document => ({
  _id: new ObjectId(), type: 'video', provider: 'youtube', videoId: `v${ids += 1}`, url: `https://www.youtube.com/watch?v=v${ids}`, title,
  duration: options.duration ?? 'PT3M', channelId: options.channel ?? `c${ids}`, rand: options.rand ?? ids / 100,
  ...(options.live ? { liveBroadcastContent: 'live' } : {}), ...(options.served ? { served: { n: options.served } } : {}),
  v3: { universe: options.universe ?? 'sport', usable: true },
})

const context = (db: Db, state: Session) => ({ ticket: planDraw(state, 'video'), state, decode: (row: Document) => ({ _id: String(row._id), title: row.title }), lang: 'fr', random: Math.random, now: Date.now(), card: 'sport' as const, freshSeen: null })

test('a long card: over fifteen minutes, in the universe of the card, the least served first; never a live', async () => {
  const rows = [
    video('Full match Ghana Nigeria 1992', { duration: 'PT1H30M', served: 3 }),
    video('Documentary on the Tour de France', { duration: 'PT52M', served: 1 }),
    video('Stream live: the marathon', { duration: 'PT2H', live: true }),
    video('Goal of the week', { duration: 'PT1M' }),
    video('The history of surfing', { duration: 'PT48M', served: 2, universe: 'travel' }),
  ]
  const db = fakeDb(rows)
  const filled = await fillSlot(db, 'long', context(db, newSession(3)))
  assert.equal(filled?.item.title, 'Documentary on the Tour de France')
  assert.equal(filled?.from, 'universe')
  assert.equal(filled?.universe, 'sport')
})

test('a card the universe cannot fill is filled from the whole stock', async () => {
  const rows = [video('Goal of the week', { duration: 'PT1M' }), video('The history of surfing', { duration: 'PT48M', universe: 'travel' })]
  const db = fakeDb(rows)
  const filled = await fillSlot(db, 'long', context(db, newSession(3)))
  assert.equal(filled?.item.title, 'The history of surfing')
  assert.equal(filled?.from, 'stock')
})

test('the session rules hold on every card: not the same author within ten videos, a few foreign scripts, never a row of them', () => {
  const seen = [video('Skate session at the park', { channel: 'skater' }), video('東京の朝', {}), video('서울의 밤', {}), video('北京の夜', {})]
  let state = newSession(5)
  for (const row of seen) state = { ...state, exposures: appendExposure(state.exposures, candidateFromRow(row, {}, Date.now())) }
  const rows = [
    video('Skate session at the beach', { channel: 'skater', served: 0 }),
    video('大阪の夕方', { served: 0 }),
    video('Morning surf at Biarritz', { served: 2 }),
  ]
  const db = fakeDb(rows)
  const chosen = choose(rows, 'joker', context(db, state))
  assert.equal(chosen?.title, 'Morning surf at Biarritz')
  // Two foreign titles in the last ten: the next one still passes.
  const easier = { ...state, exposures: state.exposures!.slice(0, 3) }
  assert.equal(choose(rows, 'joker', context(db, easier))?.title, '大阪の夕方')
})

test('the served count: one write by id, the least served wins next time', async () => {
  const rows = [video('A', { served: 2 }), video('B'), video('C', { served: 1 })]
  const writes: Document[] = []
  const db = fakeDb(rows, writes)
  const filled = await fillSlot(db, 'joker', context(db, newSession(9)))
  assert.equal(filled?.item.title, 'B')
  assert.equal(await countServed(db, filled!.item.id!, 1_000), true)
  assert.equal(writes.length, 1)
  assert.equal(String(writes[0].filter._id), String(rows[1]._id))
  assert.deepEqual(writes[0].update.$inc, { 'served.n': 1 })
  assert.equal(await countServed(db, 'not-an-id', 1_000), false)
})
