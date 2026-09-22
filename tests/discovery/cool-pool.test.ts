import test from 'node:test'
import assert from 'node:assert/strict'

import type { Db, Document, Filter } from 'mongodb'

import { selectCool } from '../../lib/discovery/coolPool'
import { newSession, planDraw, type Intent, type Session } from '../../lib/discovery/pool'
import { seeded } from '../../lib/discovery/random'
import { pickBagSource } from '../../lib/v3/cool/bag'

/** Enough of a database for the draw: equality, `$in`, `$ne`, `$gte`, `$lt`, a sort on `rand` and a limit. */
function fakeDb(items: Document[]): Db {
  const read = (row: Document, path: string) => path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], row)
  const holds = (value: unknown, wanted: unknown) => (Array.isArray(value) ? value.includes(wanted) : value === wanted)
  const matches = (row: Document, filter: Filter<Document>) => Object.entries(filter).every(([key, condition]) => {
    const value = read(row, key)
    if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
      const ops = condition as Record<string, unknown>
      if ('$in' in ops) return (ops.$in as unknown[]).some((wanted) => holds(value, wanted))
      if ('$ne' in ops) return value !== ops.$ne
      if ('$gte' in ops && !((value as number) >= (ops.$gte as number))) return false
      if ('$lt' in ops && !((value as number) < (ops.$lt as number))) return false
      return true
    }
    return holds(value, condition)
  })
  const collection = (name: string) => ({
    find: (filter: Filter<Document>, options?: { limit?: number; sort?: Record<string, number> }) => ({
      toArray: async () => {
        if (name !== 'items') return []
        let rows = items.filter((row) => matches(row, filter))
        if (options?.sort?.rand) rows = [...rows].sort((a, b) => (a.rand as number) - (b.rand as number))
        return options?.limit ? rows.slice(0, options.limit) : rows
      },
    }),
  })
  return { collection } as unknown as Db
}

const NOW = Date.UTC(2026, 8, 22)
let counter = 0
function video(register: string, extra: Document = {}): Document {
  counter += 1
  return {
    _id: `aaaaaaaaaaaaaaaaaaaaaa${String(counter).padStart(2, '0')}`, type: 'video', provider: 'youtube', videoId: `vid${counter}`,
    title: `contenu ${counter}`, rand: counter / 100, v3: { registers: [register], popularity: 'niche', usable: true }, ...extra,
  }
}
/** Something for every source the bag can ask for, so the test holds whatever the seed picks. */
const catalogue = () => [
  video('gaming'), video('gaming'), video('archive'), video('archive'), video('music'), video('music'),
  video('elsewhere'), video('elsewhere'), video('archive', { v3: { registers: ['archive'], line: 'trend', popularity: 'mid', usable: true } }),
]
const coolTicket = (state: Session): Intent => ({ ...planDraw(state, 'video'), type: 'video', mode: 'cool', branch: 'autonomous' })

test('un tirage cool = un seul contenu, tiré dans la source que le sac demande, sans clé de série', async () => {
  const state = newSession(7)
  const result = await selectCool(fakeDb(catalogue()), coolTicket(state), state, (row) => row, seeded(3), NOW)
  assert.ok(result, 'un contenu')
  assert.equal(result.item.type, 'video')
  assert.equal(result.item.seriesKey, undefined, 'rien ne suit un contenu cool : pas de fil, pas de série')
  assert.equal(result.cool.asked, pickBagSource(7, 0, null), 'la source demandée est celle du sac, au rang du ticket')
  assert.equal(typeof result.cool.source, 'string')
  assert.equal(result.cool.id, String(result.item.payload._id))
  assert.ok(['autonomous', 'editorial'].includes(result.branch))
})

test('ce que la session a déjà vu est refusé, et sans rien d_éligible le tirage rend null', async () => {
  const rows = catalogue()
  const state: Session = { ...newSession(7), recent: rows.map((row) => ({ key: `youtube:${row.videoId}`, type: 'video' as const, stock: false, family: 'unknown' })) }
  assert.equal(await selectCool(fakeDb(rows), coolTicket(state), state, (row) => row, seeded(3), NOW), null)
  const fresh = newSession(7)
  assert.equal(await selectCool(fakeDb([]), coolTicket(fresh), fresh, (row) => row, seeded(3), NOW), null, 'catalogue vide : les couloirs prennent le relais')
})

test('le rang du ticket cool avance la source : deux tickets de suite ne lisent pas la même case du sac', async () => {
  const first = pickBagSource(11, 0, null)
  const second = pickBagSource(11, 1, null)
  const state: Session = { ...newSession(11), coolTickets: 1, visuals: 1, displayed: 1, autonomousTickets: 1 }
  const result = await selectCool(fakeDb(catalogue()), coolTicket(state), state, (row) => row, seeded(5), NOW)
  assert.ok(result)
  assert.equal(result.cool.asked, second)
  assert.notEqual([first, second].join(), '')
})
