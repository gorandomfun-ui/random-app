import assert from 'node:assert/strict'
import test from 'node:test'

import { dislikedIds, DISLIKES_LIMIT, DISLIKES_PER_DRAW, DISLIKES_TTL_MS, rememberDislike } from '../../utils/dislikeMemory'
import { DISLIKED_MAX, parseDisliked } from '../../lib/discovery/handlers'
import { makeRandomLoader } from '../../lib/discovery/controller'
import { newSession } from '../../lib/discovery/pool'

const id = (n: number) => n.toString(16).padStart(24, '0')

class Storage {
  private map = new Map<string, string>()
  getItem(key: string) { return this.map.get(key) ?? null }
  setItem(key: string, value: string) { this.map.set(key, value) }
}

test('the device keeps what it refused for a month, the latest few riding with a draw, the oldest falling off past the limit', () => {
  ;(globalThis as { window?: unknown }).window = { localStorage: new Storage() }
  try {
    const t0 = 1_000_000
    rememberDislike(id(1), t0)
    rememberDislike('not-an-id', t0 + 500)
    rememberDislike(id(2), t0 + 1000)
    assert.deepEqual(dislikedIds(t0 + 2000), [id(1), id(2)])
    rememberDislike(id(1), t0 + 3000)
    assert.deepEqual(dislikedIds(t0 + 4000), [id(2), id(1)])
    assert.deepEqual(dislikedIds(t0 + DISLIKES_TTL_MS + 2500), [id(1)])
    for (let n = 100; n < 100 + DISLIKES_LIMIT + 10; n += 1) rememberDislike(id(n), t0 + 5000 + n)
    assert.equal(dislikedIds(t0 + 6000).length, DISLIKES_PER_DRAW)
    assert.equal(dislikedIds(t0 + 6000).at(-1), id(100 + DISLIKES_LIMIT + 9))
  } finally {
    delete (globalThis as { window?: unknown }).window
  }
  assert.deepEqual(dislikedIds(), [])
})

test('the refusals ride with the draw, and the site keeps only well-formed ids, the latest few', async () => {
  const bodies: Record<string, unknown>[] = []
  const request: typeof fetch = async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return new Response(null, { status: 204 }) }
  const store = { read: () => null, mark: () => undefined }
  const load = makeRandomLoader('fr', request, () => [], store, () => [], () => [], () => [id(7), id(8)])
  await load(newSession(1), 'video', new AbortController().signal)
  assert.deepEqual(bodies[0].disliked, [id(7), id(8)])
  const quiet = makeRandomLoader('fr', request, () => [], store, () => [], () => [], () => [])
  await quiet(newSession(1), 'video', new AbortController().signal)
  assert.equal('disliked' in bodies[1], false)
  assert.deepEqual(parseDisliked([id(1), 'nope', 3, id(2)]), [id(1), id(2)])
  assert.equal(parseDisliked(Array.from({ length: DISLIKED_MAX + 5 }, (_, n) => id(n))).length, DISLIKED_MAX)
  assert.deepEqual(parseDisliked('x'), [])
})
