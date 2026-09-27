import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProfile } from '../../lib/discovery/profile'
import { commitDraw, newSession, planDraw, restartRhythm, type Session } from '../../lib/discovery/pool'
import { parseSession } from '../../lib/discovery/sessionCodec'
import { FRESH_PER_SESSION, freshStart, parseFreshCursor } from '../../lib/discovery/freshPool'
import { makeRandomLoader, type FreshStore } from '../../lib/discovery/controller'
import type { Candidate } from '../../lib/discovery/types'

const DAY = '2026-09-28'
const video = (n: number, fresh = false): Candidate => ({
  key: `youtube:v${n}`, type: 'video', provider: 'youtube', profile: buildProfile({ title: `contenu ${n}` }), payload: {}, stock: false, available: true,
  ...(fresh ? { fresh: true, freshDay: DAY, freshPosition: n } : {}),
})

test('a fresh video takes no cool ticket and leaves the score where it was', () => {
  let state: Session = newSession(7)
  for (let n = 1; n <= FRESH_PER_SESSION; n += 1) state = commitDraw(state, planDraw(state, 'video'), video(n, true))
  assert.equal(state.freshServed, FRESH_PER_SESSION)
  assert.equal(state.beat, 0, 'the cool pool starts at its beginning after the fresh ten')
  assert.equal(state.coolTickets, 0)
  assert.equal(state.visuals, FRESH_PER_SESSION)
  const after = commitDraw(state, planDraw(state, 'video'), video(99))
  assert.equal(after.beat, 1)
  assert.ok(parseSession(JSON.parse(JSON.stringify(after))), 'the session stays valid on the wire')
})

test('coming back opens on ten new fresh videos', () => {
  const state = { ...newSession(3), visuals: 12, displayed: 12, freshServed: 10 }
  assert.equal(restartRhythm(state).freshServed, 0)
})

test('a session claiming more fresh videos than it showed is refused', () => {
  assert.equal(parseSession({ ...newSession(1), freshServed: 3 }), null)
  assert.equal(parseSession({ ...newSession(1), freshServed: 'x' }), null)
})

test('the device cursor: the same day resumes, another day starts at the top', () => {
  assert.deepEqual(parseFreshCursor({ day: DAY, position: 12 }), { day: DAY, position: 12 })
  assert.equal(parseFreshCursor({ day: 'yesterday', position: 12 }), null)
  assert.equal(parseFreshCursor({ day: DAY, position: -1 }), null)
  assert.equal(freshStart({ day: DAY, position: 12 }, DAY), 12)
  assert.equal(freshStart({ day: '2026-09-27', position: 40 }, DAY), 0)
  assert.equal(freshStart(null, DAY), 0)
})

test('the loader sends where the device is and moves it on when a fresh video comes back', async () => {
  let stored: { day: string; position: number } | null = { day: DAY, position: 4 }
  const store: FreshStore = { read: () => stored, write: (cursor) => { stored = cursor } }
  let sent: { fresh?: unknown } = {}
  const request = (async (_url: string, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ candidate: video(5, true) }), { status: 200 })
  }) as unknown as typeof fetch
  const load = makeRandomLoader('fr', request, () => [], store)
  await load(newSession(1), 'video', new AbortController().signal)
  assert.deepEqual(sent.fresh, { day: DAY, position: 4 })
  assert.deepEqual(stored, { day: DAY, position: 5 })
})
