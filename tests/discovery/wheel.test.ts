import assert from 'node:assert/strict'
import test from 'node:test'

import { ObjectId, type Db, type Document, type Filter } from 'mongodb'

import { candidateFromRow } from '../../lib/discovery/catalog'
import { appendExposure } from '../../lib/discovery/diversity'
import { newSession, planDraw, type Session } from '../../lib/discovery/pool'
import { countServed } from '../../lib/discovery/served'
import { BONUS, bonusAt, choose, fillSlot, sessionRules, slotAt, UNIVERSE_WINDOW, WHEEL, withSignals } from '../../lib/discovery/wheel'

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
function fakeDb(items: Document[], writes: Document[] = [], sweeps: Document[] = []): Db {
  const read = (row: Document, path: string) => path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], row)
  const holds = (value: unknown, wanted: unknown) => (Array.isArray(value) ? value.includes(wanted) : value === wanted)
  const matches = (row: Document, filter: Filter<Document>) => Object.entries(filter).every(([key, condition]) => {
    const value = read(row, key)
    if (condition && typeof condition === 'object' && !(condition instanceof ObjectId)) {
      const ops = condition as Record<string, unknown>
      if ('$exists' in ops) return (value !== undefined) === ops.$exists
      if ('$ne' in ops && value === ops.$ne) return false
      if ('$gte' in ops && !((value as number) >= (ops.$gte as number))) return false
      if ('$gt' in ops && !((value as number) > (ops.$gt as number))) return false
      if ('$lt' in ops && !((value as number) < (ops.$lt as number))) return false
      if ('$in' in ops && !(ops.$in as unknown[]).some((wanted) => holds(value, wanted))) return false
      return true
    }
    return holds(value, condition)
  })
  const collection = (name = 'items') => ({
    find: (filter: Filter<Document>, options?: { limit?: number; sort?: Record<string, number> }) => ({
      toArray: async () => {
        let rows = (name === 'mini_series_sweeps_v3' ? sweeps : items).filter((row) => matches(row, filter))
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

const context = (db: Db, state: Session) => ({ ticket: planDraw(state, 'video'), state, decode: (row: Document) => ({ _id: String(row._id), title: row.title }), lang: 'fr', random: Math.random, now: Date.now(), card: 'sport' as const, freshSeen: null, rules: sessionRules(state), media: new Set<string>(), disliked: new Set<string>() })

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
  const seen = [video('Skate session at the park', { channel: 'skater', universe: 'travel' }), video('東京の朝', { universe: 'food' }), video('서울의 밤', { universe: 'art' }), video('北京の夜', { universe: 'craft' })]
  let state = newSession(5)
  for (const row of seen) state = { ...state, exposures: appendExposure(state.exposures, withSignals(candidateFromRow(row, {}, Date.now()))) }
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

test('the universes lead: never the previous video\'s universe when another fits', () => {
  const seen = [video('Trailer of a film', { universe: 'cinema-tv' })]
  let state = newSession(11)
  for (const row of seen) state = { ...state, exposures: appendExposure(state.exposures, withSignals(candidateFromRow(row, {}, Date.now()))) }
  const rows = [video('Another film scene', { universe: 'cinema-tv' }), video('A goal from midfield', { universe: 'sport', served: 1 })]
  const db = fakeDb(rows)
  assert.equal(choose(rows, 'joker', context(db, state))?.title, 'A goal from midfield')
  // The card's universe only: a universe seen within six videos is refused outright, and the card passes to the joker or another universe.
  assert.equal(choose(rows.slice(0, 1), 'joker', context(db, state)), null)
})

const remembered = (seed: number, rows: Document[]): Session => {
  let state = newSession(seed)
  for (const row of rows) state = { ...state, exposures: appendExposure(state.exposures, withSignals(candidateFromRow(row, {}, Date.now()))) }
  return state
}

test('three titles of one language in the last ten: the next one in that language waits for another', () => {
  const french = ['Les meilleures recettes de cuisine de grand-mère pour le dimanche', 'Le journal du matin présenté depuis les studios parisiens', 'Une promenade tranquille dans les rues du vieux Lyon un soir']
  const state = remembered(21, french.map((title, index) => video(title, { universe: ['food', 'news-society', 'travel'][index] })))
  const rows = [video('Un reportage complet sur les marchés de Provence en été', { served: 0 }), video('A quiet walk through the old streets of Edinburgh at night', { served: 2 })]
  const db = fakeDb(rows)
  assert.equal(choose(rows, 'joker', context(db, state))?.title, 'A quiet walk through the old streets of Edinburgh at night')
  assert.equal(sessionRules(state).refuses(withSignals(candidateFromRow(rows[0], {}, Date.now()))), 'language')
  assert.equal(sessionRules(newSession(21)).refuses(withSignals(candidateFromRow(rows[0], {}, Date.now()))), null)
})

test('one news video in ten: a second one waits, by its universe or its title', () => {
  const state = remembered(22, [video('Evening report from the regional assembly', { universe: 'news-society' })])
  const rows = [video('Breaking news: storm reaches the coast', { universe: 'sport' }), video('Another evening report', { universe: 'news-society' }), video('A goal from midfield', { universe: 'sport', served: 3 })]
  const db = fakeDb(rows)
  assert.equal(choose(rows, 'joker', context(db, state))?.title, 'A goal from midfield')
  assert.equal(sessionRules(state).refuses(withSignals(candidateFromRow(rows[0], {}, Date.now()))), 'news')
})

test('the bonus card names music, gaming and humour in turn, and keeps its quality rules', async () => {
  const seed = 23
  const universes = Array.from({ length: 3 }, (_, round) => bonusAt(seed, round * WHEEL.length))
  assert.deepEqual([...universes].sort(), [...BONUS].sort())
  assert.equal(bonusAt(seed, 0), bonusAt(seed, WHEEL.length - 1))
  const rows = [
    video('Minecraft survival let\'s play episode 12', { universe: 'gaming' }),
    { ...video('Speedrun history of a classic platformer', { universe: 'gaming', served: 1 }), v3: { universe: 'gaming', usable: true, subjects: [{ id: 'entity:game', role: 'primary' }] } },
  ]
  const db = fakeDb(rows)
  const state = { ...newSession(seed), videos: [0, 1, 2].map((round) => round * WHEEL.length).find((index) => bonusAt(seed, index) === 'gaming')! }
  const filled = await fillSlot(db, 'bonus', context(db, state))
  assert.equal(filled?.item.title, 'Speedrun history of a classic platformer')
  assert.equal(filled?.from, 'bonus:gaming')
})

test('one universe once in the last six videos: a second waits, the bonus card included', async () => {
  const state = remembered(24, [video('Concert in the park', { universe: 'music' })])
  const rows = [video('A new single, live on stage', { universe: 'music' }), video('A goal from midfield', { universe: 'sport', served: 5 })]
  const db = fakeDb(rows)
  assert.equal(UNIVERSE_WINDOW, 6)
  assert.equal(choose(rows, 'joker', context(db, state))?.title, 'A goal from midfield')
  assert.equal(sessionRules(state).refuses(withSignals(candidateFromRow(rows[0], {}, Date.now()))), 'universe')
  const musicRound = [0, 1, 2].map((round) => round * WHEEL.length).find((index) => bonusAt(24, index) === 'music')!
  assert.equal(await fillSlot(db, 'bonus', context(db, { ...state, videos: musicRound })), null)
  // Seven videos later the universe is free again.
  const later = remembered(24, [video('Concert in the park', { universe: 'music' }), ...['travel', 'food', 'art', 'craft', 'sport', 'tech'].map((universe) => video(`Something ${universe}`, { universe }))])
  assert.equal(sessionRules(later).refuses(withSignals(candidateFromRow(rows[0], {}, Date.now()))), null)
})

test('what the device remembers — a subject, an author — is refused on every card, chance included', () => {
  const seen = video('Pelé scores in 1970', { channel: 'pele-fan', universe: 'sport' })
  const seenCandidate = withSignals(candidateFromRow({ ...seen, v3: { ...seen.v3, dig: { subjectId: 'entity:pele', base: 'people', level: 2, pass: 'top' } } }, {}, Date.now()))
  const { hash } = require('../../lib/discovery/random') as typeof import('../../lib/discovery/random')
  const remembered = new Set([hash('entity:pele'), hash(seenCandidate.authorKey!)])
  const rows = [
    { ...video('Pelé, the king, a documentary', { universe: 'history' }), v3: { universe: 'history', usable: true, dig: { subjectId: 'entity:pele', base: 'people', level: 3, pass: 'around' } } },
    video('Another video of the same fan channel', { channel: 'pele-fan', universe: 'sport' }),
    video('A goal from midfield', { universe: 'food', served: 9 }),
  ]
  const db = fakeDb(rows)
  const state = newSession(41)
  const base = { ...context(db, state), rules: sessionRules(state, remembered) }
  assert.equal(choose(rows, 'joker', base)?.title, 'A goal from midfield')
  assert.equal(choose(rows, 'chance', base)?.title, 'A goal from midfield')
  assert.equal(base.rules.refuses(withSignals(candidateFromRow(rows[0], {}, Date.now()))), 'remembered')
  assert.equal(base.rules.refuses(withSignals(candidateFromRow(rows[1], {}, Date.now()))), 'remembered')
})

test('a media channel\'s clip is served within its window only: a news clip of the week or of another time, never a six-month-old one', async () => {
  const media = (title: string, publishedAt: Date, over: Record<string, unknown> = {}) => ({ ...video(title, { universe: 'news-society' }), publishedAt, categoryId: 'news', ...over, v3: { universe: 'news-society', usable: true, channelKey: 'dailymotion:press' } })
  const rows = [
    media('Election results tonight', new Date('2026-04-01')),
    media('Storm reaches the coast tonight', new Date('2026-09-29')),
    media('The 1983 flood, as reported then', new Date('2026-09-01')),
    { ...video('A goal from midfield', { universe: 'sport', served: 9 }), publishedAt: new Date('2026-04-01') },
  ]
  const db = fakeDb(rows, [], [{ kind: 'outlet', channels: ['dailymotion:press'] }])
  const base = { ...context(db, newSession(31)), now: new Date('2026-10-01T20:00:00Z').getTime(), media: new Set(['dailymotion:press']) }
  const chosen = [choose(rows.slice(0, 1), 'joker', base), choose(rows.slice(1, 2), 'joker', base), choose(rows.slice(2, 3), 'joker', base)]
  assert.equal(chosen[0], null)
  assert.equal(chosen[1]?.title, 'Storm reaches the coast tonight')
  assert.equal(chosen[2]?.title, 'The 1983 flood, as reported then')
  assert.equal(choose(rows.slice(0, 1), 'joker', { ...base, media: new Set() })?.title, 'Election results tonight')
})

test('"pas ça": a content the device refused is never chosen again on any card, however little served', () => {
  const rows = [video('Goal of the week', { served: 0 }), video('Best saves of the season', { served: 5 })]
  const db = fakeDb(rows)
  const state = newSession(3)
  assert.equal(choose(rows, 'chance', context(db, state))?.id, String(rows[0]._id))
  const refused = { ...context(db, state), disliked: new Set([String(rows[0]._id)]) }
  assert.equal(choose(rows, 'chance', refused)?.id, String(rows[1]._id))
  assert.equal(choose(rows, 'deep', { ...refused, disliked: new Set(rows.map((row) => String(row._id))) }), null)
})
