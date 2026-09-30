import assert from 'node:assert/strict'
import test from 'node:test'

import { ObjectId, type Db, type Document, type Filter } from 'mongodb'

import { baseBag, DEFAULT_BASE_BAG, DEFAULT_LEVELS_COOL, levelBag, levelsAround, selectDig } from '../../lib/discovery/digDraw'
import { commitDraw, newSession, planDraw } from '../../lib/discovery/pool'
import { exposureOf, type Exposure } from '../../lib/discovery/diversity'
import { candidateFromRow } from '../../lib/discovery/catalog'
import { themeAt } from '../../lib/v3/cool/themes'

test('the bags read their settings, or keep their defaults', () => {
  assert.deepEqual(baseBag('people:2,random:1'), ['people', 'people', 'random'])
  assert.deepEqual(baseBag('nope:1'), DEFAULT_BASE_BAG)
  assert.deepEqual(levelBag('1:1,4:2', DEFAULT_LEVELS_COOL), [1, 4, 4])
  assert.deepEqual(levelBag('9:1', DEFAULT_LEVELS_COOL), DEFAULT_LEVELS_COOL)
  assert.deepEqual(levelsAround(2), [2, 1, 3, 4, null])
  assert.deepEqual(levelsAround(4), [4, 3, 2, 1, null])
})

/** Two collections: the queue and the items, enough for a draw. */
function twoCollections(subjects: Document[], items: Document[]): Db {
  const read = (row: Document, path: string) => path.split('.').reduce<unknown>((value, key) =>
    Array.isArray(value) ? value.map((element) => (element as Record<string, unknown> | undefined)?.[key]) : (value as Record<string, unknown> | undefined)?.[key], row)
  const holds = (value: unknown, wanted: unknown) => (Array.isArray(value) ? value.includes(wanted) : value === wanted)
  const matches = (row: Document, filter: Filter<Document>) => Object.entries(filter).every(([key, condition]) => {
    const value = read(row, key)
    if (condition && typeof condition === 'object') {
      const ops = condition as Record<string, number>
      if ('$gt' in ops && !((value as number) > ops.$gt)) return false
      if ('$gte' in ops && !((value as number) >= ops.$gte)) return false
      if ('$lt' in ops && !((value as number) < ops.$lt)) return false
      return true
    }
    return holds(value, condition)
  })
  const collection = (name: string) => ({
    find: (filter: Filter<Document>, options?: { limit?: number; sort?: Record<string, number> }) => ({
      toArray: async () => {
        let rows = (name === 'items' ? items : subjects).filter((row) => matches(row, filter))
        if (options?.sort?.rand) rows = [...rows].sort((a, b) => (a.rand as number) - (b.rand as number))
        return options?.limit ? rows.slice(0, options.limit) : rows
      },
    }),
  })
  return { collection } as unknown as Db
}

const video = (id: string, subject: string, level: number, title: string, rand: number): Document => ({
  _id: new ObjectId(), type: 'video', provider: 'youtube', videoId: id, url: `https://www.youtube.com/watch?v=${id}`, title, rand,
  v3: { subjects: [{ id: subject, role: 'primary', evidence: 'search-verified' }], dig: { subjectId: subject, base: 'people', level, pass: 'top' }, line: 'dig', usable: true },
})

test('a video draw over the dig: a base, a level, a subject the session has not seen, one of its videos', async () => {
  process.env.RANDOM_DIG_DRAW_BASES = 'people:1'
  process.env.RANDOM_DIG_DRAW_LEVELS_COOL = '2:1'
  process.env.RANDOM_DIG_DRAW_LEVELS_RANDOM = '2:1'
  try {
    // The card of each visual commands the universe: the subjects wear the cards the session will draw.
    const db = twoCollections(
      [{ _id: 'entity:bardot', label: 'Brigitte Bardot', base: 'people', ingested: 3, rand: 0.2, universe: themeAt(7, 0) }, { _id: 'entity:delon', label: 'Alain Delon', base: 'people', ingested: 2, rand: 0.7, universe: themeAt(7, 1) }],
      [video('b1', 'entity:bardot', 1, 'Brigitte Bardot - Venus', 0.1), video('b2', 'entity:bardot', 2, 'Bardot en 1968 à Saint-Tropez', 0.5), video('d1', 'entity:delon', 2, 'Alain Delon et Romy Schneider', 0.3)],
    )
    let state = newSession(7)
    const ticket = planDraw(state, 'video')
    const first = await selectDig(db, ticket, state, (row) => row, () => 0.15, Date.now())
    assert.ok(first)
    assert.equal(first.dig.base, 'people')
    assert.equal(first.dig.subjectId, 'entity:bardot', 'the subject at the random point')
    assert.equal(first.dig.level, 2, 'the level asked, when the subject has it')
    assert.equal(first.item.digSubject, 'entity:bardot')
    assert.equal(exposureOf(first.item)?.subject != null, true, 'the exposure remembers the subject')
    // The session saw Bardot: the next draw from the same point takes Delon.
    state = commitDraw(state, ticket, first.item)
    const second = await selectDig(db, planDraw(state, 'video'), state, (row) => row, () => 0.15, Date.now())
    assert.ok(second)
    assert.equal(second.dig.subjectId, 'entity:delon')
    // Delon has no level 1: asked level 1, the neighbour answers and the draw says so.
    process.env.RANDOM_DIG_DRAW_LEVELS_COOL = '1:1'
    process.env.RANDOM_DIG_DRAW_LEVELS_RANDOM = '1:1'
    const third = await selectDig(db, planDraw(state, 'video'), state, (row) => row, () => 0.15, Date.now())
    assert.ok(third)
    assert.equal(third.dig.level, 2)
    assert.equal(third.fallback, true)
  } finally {
    delete process.env.RANDOM_DIG_DRAW_BASES
    delete process.env.RANDOM_DIG_DRAW_LEVELS_COOL
    delete process.env.RANDOM_DIG_DRAW_LEVELS_RANDOM
  }
})

test('the pure random ticket and the texts leave the draw to the older paths', async () => {
  process.env.RANDOM_DIG_DRAW_BASES = 'random:1'
  try {
    const db = twoCollections([], [])
    const state = newSession(3)
    assert.equal(await selectDig(db, planDraw(state, 'video'), state, (row) => row, Math.random, Date.now()), null)
  } finally {
    delete process.env.RANDOM_DIG_DRAW_BASES
  }
  const state = newSession(3)
  assert.equal(await selectDig(twoCollections([], []), planDraw(state, 'quote'), state, (row) => row, Math.random, Date.now()), null)
  const row = video('x', 'entity:x', 1, 'X', 0.1)
  assert.equal(candidateFromRow(row, row, Date.now()).digSubject, 'entity:x')
})

test('the card commands: a base with nothing of the visual\'s universe gives no dig draw, so the stock of that universe answers', async () => {
  process.env.RANDOM_DIG_DRAW_BASES = 'people:1'
  try {
    const other = themeAt(7, 0) === 'music' ? 'sport' : 'music'
    const db = twoCollections([{ _id: 'entity:x', label: 'X', base: 'people', ingested: 3, rand: 0.2, universe: other }], [video('x1', 'entity:x', 1, 'X clip', 0.1)])
    const state = newSession(7)
    assert.equal(await selectDig(db, planDraw(state, 'video'), state, (row) => row, () => 0.1, Date.now()), null)
  } finally {
    delete process.env.RANDOM_DIG_DRAW_BASES
  }
})
