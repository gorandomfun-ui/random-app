import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProfile } from '../../lib/discovery/profile'
import { commitDraw, newSession, planDraw, restartRhythm, type Session } from '../../lib/discovery/pool'
import { parseSession } from '../../lib/discovery/sessionCodec'
import { FRESH_PER_SESSION, unseenSample } from '../../lib/discovery/freshPool'
import { hasSeen, markSeen, parseFreshSeen, type FreshSeen } from '../../lib/discovery/freshSeen'
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

test('the device remembers which of the day\'s places it saw; another day starts a new memory', () => {
  let memory: FreshSeen | null = null
  for (const index of [0, 7, 8, 999]) memory = markSeen(memory, DAY, index)
  assert.ok(memory && memory.seen.length <= 172, 'a thousand places fit in a few lines')
  for (const index of [0, 7, 8, 999]) assert.ok(hasSeen(memory, DAY, index))
  assert.ok(!hasSeen(memory, DAY, 1) && !hasSeen(memory, DAY, 998))
  assert.ok(!hasSeen(memory, '2026-09-29', 0), 'tomorrow nothing is seen yet')
  assert.deepEqual(parseFreshSeen(JSON.parse(JSON.stringify(memory))), memory)
  assert.equal(parseFreshSeen({ day: DAY, seen: 'not base64!' }), null)
  assert.equal(parseFreshSeen({ day: 'yesterday', seen: '' }), null)
})

test('the fresh videos are drawn at random among the places not seen today', () => {
  let memory: FreshSeen | null = null
  for (let index = 0; index < 995; index += 1) memory = markSeen(memory, DAY, index)
  const sample = unseenSample(1000, DAY, memory, 24, Math.random)
  assert.deepEqual([...sample].sort((a, b) => a - b), [995, 996, 997, 998, 999])
  let seed = 7
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const first = unseenSample(1000, DAY, null, 24, random)
  assert.equal(new Set(first).size, 24)
  assert.ok(first.some((index) => index > 100), 'not the top of the list: anywhere in it')
  assert.deepEqual(unseenSample(1000, '2026-09-29', memory, 3, random).length, 3, 'yesterday\'s memory does not count today')
})

test('the loader sends what the device saw and marks the fresh video it gets', async () => {
  let stored: FreshSeen | null = markSeen(null, DAY, 4)
  const store: FreshStore = { read: () => stored, mark: (day, index) => { stored = markSeen(stored, day, index) } }
  let sent: { fresh?: unknown } = {}
  const request = (async (_url: string, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ candidate: video(5, true) }), { status: 200 })
  }) as unknown as typeof fetch
  const load = makeRandomLoader('fr', request, () => [], store)
  await load(newSession(1), 'video', new AbortController().signal)
  assert.deepEqual(sent.fresh, markSeen(null, DAY, 4))
  assert.ok(hasSeen(stored, DAY, 4) && hasSeen(stored, DAY, 5))
})
