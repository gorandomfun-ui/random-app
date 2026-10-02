import assert from 'node:assert/strict'
import test from 'node:test'

import type { Db, Document, Filter } from 'mongodb'

import { keepTitle, listSubject, LISTS, titlesInWikitext } from '../../lib/v3/dig/lists'
import { nextPass, PROBE_HITS, takeSubject, universeTurns, type QueuedSubject } from '../../lib/v3/dig/queue'
import { isUniverse } from '../../lib/v3/types'

test('the lists name a universe each, and keep short entries only', () => {
  for (const source of LISTS) assert.ok(isUniverse(source.universe), source.page)
  assert.ok(keepTitle('Belly dance'))
  assert.ok(keepTitle("Rock 'n' roll"))
  assert.ok(!keepTitle('List of dance styles'))
  assert.ok(!keepTitle('Dance (1989 film)'))
  assert.ok(!keepTitle('A very long title that goes on and on'))
  assert.ok(!keepTitle('東京'))
  assert.ok(!keepTitle('the arts'))
})

test('the entries of a list are the first links of its bullet and table lines, never the boxes around', () => {
  const wikitext = `{{Short description|A list}}
{{Navbox|[[Dance]]|[[Music]]}}
== Styles ==
* [[Acro dance]] – a fusion
* [[Belly dance|Belly dancing]] ([[Egypt]])
# [[Breakdancing]]
* The [[South Korea]]n style
* [[the arts]]
{| class="wikitable"
|-
! Name !! Origin
|-
| [[Capoeira]] || [[Brazil]]
|}
* [[Cat (2004 film)]]
* {{flag|JP}} '''[[Bon dance]]''' – a festival dance
| [[File:Bob cut.jpg|120px]] || [[Bob cut]] || short
| [[Image:Nothing.png]]
== See also ==
* [[Tap dance]]
* [[List of sports]]`
  assert.deepEqual(titlesInWikitext(wikitext), ['Acro dance', 'Belly dance', 'Breakdancing', 'Capoeira', 'Bon dance', 'Bob cut'])
})

const probe = (over: Partial<QueuedSubject> = {}): QueuedSubject => ({
  ...listSubject('Belly dance', LISTS[2]), state: 'queued', passes: {}, channelsToRead: [], ingested: 0, searches: 0, depthTarget: 50, createdAt: new Date(), done: [], ...over,
} as QueuedSubject)

test('a probe goes to Dailymotion first, is done when it did not bite, and on to YouTube when it did', () => {
  const subject = probe()
  assert.equal(subject.probe, true)
  assert.equal(subject.universe, 'art')
  assert.equal(nextPass(subject, true), 'dailymotion')
  const dud = probe({ passes: { dailymotion: [{ at: new Date(), read: 100, kept: 2, inserted: 2, searches: 0 }] }, ingested: 2 })
  assert.equal(nextPass(dud, true), null)
  const bit = probe({ passes: { dailymotion: [{ at: new Date(), read: 100, kept: 12, inserted: PROBE_HITS, searches: 0 }] }, ingested: PROBE_HITS })
  assert.equal(nextPass(bit, true), 'top')
  assert.equal(nextPass(bit, false), 'dailymotion')
})

/** The queue alone, enough for a take and the universe turns. */
function queueDb(rows: Document[]): Db {
  const read = (row: Document, path: string) => path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], row)
  const matches = (row: Document, filter: Filter<Document>) => Object.entries(filter).every(([key, condition]) => {
    const value = read(row, key)
    if (condition && typeof condition === 'object') {
      const ops = condition as Record<string, unknown>
      if ('$nin' in ops) return !(ops.$nin as unknown[]).includes(value)
      if ('$in' in ops) return (ops.$in as unknown[]).includes(value)
      if ('$exists' in ops) return (value !== undefined) === ops.$exists
    }
    return value === condition
  })
  const collection = () => ({
    find: (filter: Filter<Document>, options?: { limit?: number; sort?: Record<string, number> }) => ({
      toArray: async () => {
        let out = rows.filter((row) => matches(row, filter))
        if (options?.sort) out = [...out].sort((a, b) => ((b.priority as number) ?? 0) - ((a.priority as number) ?? 0) || (new Date((a.lastRunAt as Date) ?? 0).getTime()) - (new Date((b.lastRunAt as Date) ?? 0).getTime()))
        return options?.limit ? out.slice(0, options.limit) : out
      },
    }),
    updateOne: async () => ({ matchedCount: 1 }),
    aggregate: (pipeline: Document[]) => ({
      toArray: async () => {
        const match = pipeline[0].$match as Filter<Document>
        const groups = new Map<string, Date | null>()
        for (const row of rows.filter((row) => matches(row, match))) {
          const key = String(row.universe)
          const last = (row.lastRunAt as Date | undefined) ?? null
          const known = groups.get(key)
          groups.set(key, known && last && known > last ? known : last ?? known ?? null)
        }
        return [...groups].map(([_id, last]) => ({ _id, last }))
      },
    }),
  })
  return { collection } as unknown as Db
}

test('the keywords tickets take the universes in turn, and open a new probe when asked to', async () => {
  const rows = [
    probe({ _id: 'topic:a', label: 'a', universe: 'art', state: 'running', lastRunAt: new Date('2026-10-01T10:00Z'), passes: { dailymotion: [{ at: new Date(), read: 1, kept: 1, inserted: 9, searches: 0 }] }, ingested: 9 }),
    probe({ _id: 'topic:b', label: 'b', universe: 'art', state: 'queued' }),
    probe({ _id: 'topic:c', label: 'c', universe: 'food', state: 'queued' }),
    probe({ _id: 'topic:d', label: 'd', universe: 'music', state: 'running', lastRunAt: new Date('2026-10-01T08:00Z'), passes: { dailymotion: [{ at: new Date(), read: 1, kept: 1, inserted: 9, searches: 0 }] }, ingested: 9 }),
  ]
  const db = queueDb(rows)
  assert.deepEqual(await universeTurns(db), ['food', 'music', 'art'])
  assert.equal((await takeSubject(db, 'keywords', new Set(), undefined, true, 'art', 'running'))?._id, 'topic:a')
  assert.equal((await takeSubject(db, 'keywords', new Set(), undefined, true, 'art', 'queued'))?._id, 'topic:b')
  assert.equal((await takeSubject(db, 'keywords', new Set(), undefined, true, 'art', 'probe'))?._id, 'topic:b')
  assert.equal((await takeSubject(db, 'keywords', new Set(), undefined, true, 'food'))?._id, 'topic:c')
  assert.equal(await takeSubject(db, 'keywords', new Set(), undefined, true, 'sport'), null)
})

test('with the searches spent, a name still gets its channel pass and a channel subject its read; a topic waits', () => {
  const entity = { ...probe({ _id: 'entity:x', label: 'X', kind: 'entity', probe: false, passes: { top: [{ at: new Date(), read: 1, kept: 1, inserted: 1, searches: 1 }], dailymotion: [{ at: new Date(), read: 1, kept: 1, inserted: 1, searches: 0 }] }, channelsToRead: [{ id: 'c', title: 'c', hits: 3 }] }) } as QueuedSubject
  assert.equal(nextPass(entity, true, true), 'around')
  assert.equal(nextPass(entity, false, true), 'channel')
  assert.equal(nextPass(entity, false, false), 'dailymotion')
  const channel = { ...probe({ _id: 'channel:youtube:c', label: 'c', kind: 'channel', probe: false, passes: {} }) } as QueuedSubject
  assert.equal(nextPass(channel, false, true), 'channel')
  assert.equal(nextPass(channel, false, false), null)
})
