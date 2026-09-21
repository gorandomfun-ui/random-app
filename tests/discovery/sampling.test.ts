import test from 'node:test'
import assert from 'node:assert/strict'
import { pickPool, newSession, planDraw } from '../../lib/discovery/pool'
import { pickDiverse } from '../../lib/discovery/diversity'
import { seeded } from '../../lib/discovery/random'
import { buildProfile } from '../../lib/discovery/profile'
import { randomWindow, FOCUS_WINDOW_WIDTH } from '../../lib/discovery/sampling'
import type { Candidate } from '../../lib/discovery/types'

const now = Date.UTC(2026, 8, 14)
const make = (key: string, title = 'Stone carving'): Candidate => ({ key, type: 'video', provider: 'youtube',
  stock: false, available: true, payload: key, profile: buildProfile({ title }) })

test('without any exposure history a singleton cell cannot receive half the lottery', () => {
  const items = Array.from({ length: 127 }, (_, i) => make(`many:${i}`))
  const singleton = make('single', 'South Park miniature')
  items.push(singleton)
  const random = seeded(111), weights = new Map(items.map(c => [c, 1]))
  let hits = 0
  for (let i = 0; i < 12000; i++) hits += Number(pickDiverse(items, weights, random)?.key === 'single')
  assert.ok(hits > 0 && hits < 900, `${hits}/12000 singleton exposures without history`)
})

test('a sole trend/owner match improves its chances without monopolising a fresh session', () => {
  const items = Array.from({ length: 127 }, (_, i) => make(`many:${i}`))
  const preferred = { ...make('preferred'), trendObservedAt: now, editorialFamilies: ['craft'] }
  items.push(preferred)
  const random = seeded(11), state = newSession(11)
  // The first draw of a session is no longer always cool: the test asks for a cool ticket outright.
  const ticket = { ...planDraw(state, 'video'), mode: 'cool' as const, lane: 'trend' as const, branch: 'editorial' as const }
  let hits = 0, alternatives = 0
  for (let i = 0; i < 10000; i++) {
    const selected = pickPool(items, ticket, state, random, now, { craft: 1000 })!
    hits += Number(selected.item.key === preferred.key)
    alternatives += Number(selected.selection?.reasons.includes('requested-lane-balanced'))
  }
  assert.ok(hits > 250 && hits < 800, `${hits}/10000 preferred singleton; original implementation chose 100%`)
  assert.ok(alternatives > 9000)
})

test('focused retrieval rotates over the whole rand range, including wraparound, with no successor fallback', () => {
  const rng = seeded(37)
  const points = [0, .001, .25, .5, .999999], hits = points.map(() => 0)
  for (let i = 0; i < 100000; i++) {
    const query = randomWindow(rng)
    const ranges = ('$or' in query ? query.$or : [query]) as { rand: { $gte: number; $lt: number } }[]
    assert.ok(Math.abs(ranges.reduce((sum, q) => sum + q.rand.$lt - q.rand.$gte, 0) - FOCUS_WINDOW_WIDTH) < 1e-12)
    points.forEach((point, j) => { if (ranges.some(q => point >= q.rand.$gte && point < q.rand.$lt)) hits[j]++ })
  }
  assert.ok(hits.every(n => n > 280 && n < 510), JSON.stringify(hits))
})

test('session exclusion remains 40 items; a genre or content is not banned by a longer hidden filter', () => {
  const state = newSession(4), item = make('candidate')
  state.exposures = Array.from({ length: 100 }, () => ({ type: 'video', family: 'craft', terms: [], practices: [] }))
  assert.equal(pickPool([item], planDraw(state, 'video'), state, seeded(4), now)?.item.key, item.key)
})
