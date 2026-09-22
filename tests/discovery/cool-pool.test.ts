import test from 'node:test'
import assert from 'node:assert/strict'

import { selectCool } from '../../lib/discovery/coolPool'
import { newSession, planDraw, type Intent, type Session } from '../../lib/discovery/pool'
import { seeded } from '../../lib/discovery/random'
import { bagSourceAt } from '../../lib/v3/cool/bag'
import { fakeDb, fakeVideo } from '../support/fakeDb'

const NOW = Date.UTC(2026, 8, 22)
/** Something for every source the bag can ask for, so the test holds whatever the seed picks. */
const catalogue = () => [
  fakeVideo('gaming'), fakeVideo('gaming'), fakeVideo('archive'), fakeVideo('archive'), fakeVideo('music'), fakeVideo('music'),
  fakeVideo('elsewhere'), fakeVideo('elsewhere'), fakeVideo('archive', { v3: { registers: ['archive'], line: 'trend', popularity: 'mid', usable: true } }),
]
const coolTicket = (state: Session): Intent => ({ ...planDraw(state, 'video'), type: 'video', mode: 'cool', branch: 'autonomous' })

test('un tirage cool = un seul contenu, tiré dans la source que le sac demande, sans clé de série', async () => {
  const state = newSession(7)
  const result = await selectCool(fakeDb(catalogue()), coolTicket(state), state, (row) => row, seeded(3), NOW)
  assert.ok(result, 'un contenu')
  assert.equal(result.item.type, 'video')
  assert.equal(result.item.seriesKey, undefined, 'rien ne suit un contenu cool : pas de fil, pas de série')
  assert.equal(result.cool.asked, bagSourceAt(7, 0), 'la source demandée est celle du sac, au rang du ticket')
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

test('le rang du ticket cool avance dans le sac : deux tickets de suite ne demandent jamais la même source', async () => {
  const second = bagSourceAt(11, 1)
  assert.notEqual(bagSourceAt(11, 0), second)
  const state: Session = { ...newSession(11), coolTickets: 1, visuals: 1, displayed: 1, autonomousTickets: 1 }
  const result = await selectCool(fakeDb(catalogue()), coolTicket(state), state, (row) => row, seeded(5), NOW)
  assert.ok(result)
  assert.equal(result.cool.asked, second)
  if (second === 'niche') assert.ok(result.cool.niche, 'un ticket niche dit quel registre il visait')
})
