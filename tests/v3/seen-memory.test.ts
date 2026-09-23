import test from 'node:test'
import assert from 'node:assert/strict'

import { parseSeen, SEEN_KEYS_MAX } from '@/lib/discovery/handlers'
import { hardEligible, newSession, planDraw } from '@/lib/discovery/pool'
import { buildProfile } from '@/lib/discovery/profile'
import type { Candidate, Format } from '@/lib/discovery/types'

/** A window with a working localStorage, for the device memory. */
const store = new Map<string, string>()
;(globalThis as { window?: unknown }).window = {
  localStorage: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value) }, removeItem: (key: string) => { store.delete(key) } },
}
test('l_appareil retient ce qu_il a vu une semaine, quatre cents au plus, le plus ancien s_efface', async () => {
  const { rememberSeen, seenKeys, SEEN_LIMIT, SEEN_TTL_MS } = await import('@/utils/seenMemory')
  const now = Date.UTC(2026, 8, 23, 10)
  rememberSeen('youtube:a', now - 8 * 86_400_000)
  rememberSeen('youtube:b', now - 2 * 86_400_000)
  rememberSeen('giphy:c', now)
  assert.deepEqual(seenKeys(now), ['youtube:b', 'giphy:c'], 'huit jours, c_est oublié')
  rememberSeen('youtube:b', now)
  assert.deepEqual(seenKeys(now), ['giphy:c', 'youtube:b'], 'revu = remis en fin de liste, pas en double')
  for (let index = 0; index < SEEN_LIMIT + 20; index += 1) rememberSeen(`k${index}`, now)
  assert.equal(seenKeys(now).length, SEEN_LIMIT)
  assert.ok(!seenKeys(now).includes('giphy:c'), 'les plus anciens tombent')
  assert.ok(SEEN_TTL_MS >= 7 * 86_400_000)
})

test('le serveur lit la mémoire de l_appareil et l_ajoute aux refus de la session', () => {
  assert.deepEqual(parseSeen(['a', 'b', 3, '', 'c']), ['a', 'b', 'c'])
  assert.equal(parseSeen(Array.from({ length: 600 }, (_, index) => `k${index}`)).length, SEEN_KEYS_MAX)
  assert.deepEqual(parseSeen('nope'), [])
  const item = (key: string): Candidate<string> => ({ key, type: 'video' as Format, provider: 'youtube', profile: buildProfile({ title: 'x' }), payload: key, stock: false, available: true })
  const state = newSession(1)
  const drawState = { ...state, recent: [...state.recent, ...parseSeen(['youtube:seen']).map((key) => ({ key, type: 'video' as Format, stock: false, family: 'seen' }))] }
  assert.equal(hardEligible(item('youtube:seen'), planDraw(state, 'video'), drawState), false, 'vu cette semaine : refusé')
  assert.equal(hardEligible(item('youtube:new'), planDraw(state, 'video'), drawState), true)
})
