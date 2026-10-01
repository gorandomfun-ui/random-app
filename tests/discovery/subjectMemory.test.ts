import assert from 'node:assert/strict'
import test from 'node:test'

import { rememberSubjects, seenSubjects, SUBJECTS_LIMIT, SUBJECTS_TTL_MS } from '../../utils/subjectMemory'
import { parseSeenSubjects, SEEN_SUBJECTS_MAX } from '../../lib/discovery/handlers'

class Storage {
  private map = new Map<string, string>()
  getItem(key: string) { return this.map.get(key) ?? null }
  setItem(key: string, value: string) { this.map.set(key, value) }
}

test('the device remembers subjects for two weeks, the oldest falling off past the limit', () => {
  ;(globalThis as { window?: unknown }).window = { localStorage: new Storage() }
  try {
    const t0 = 1_000_000
    rememberSubjects([11, 22], t0)
    rememberSubjects([33, -1, 1.5], t0 + 1000)
    assert.deepEqual(seenSubjects(t0 + 2000), [11, 22, 33])
    rememberSubjects([11], t0 + 3000)
    assert.deepEqual(seenSubjects(t0 + 4000), [22, 33, 11])
    assert.deepEqual(seenSubjects(t0 + SUBJECTS_TTL_MS + 2500), [11])
    rememberSubjects(Array.from({ length: SUBJECTS_LIMIT + 50 }, (_, i) => 1000 + i), t0 + 5000)
    assert.equal(seenSubjects(t0 + 6000).length, SUBJECTS_LIMIT)
  } finally {
    delete (globalThis as { window?: unknown }).window
  }
})

test('the server keeps only well-formed hashes, six hundred at most', () => {
  assert.deepEqual([...parseSeenSubjects([1, 2, 'x', -3, 2 ** 40, 7])], [1, 2, 7])
  assert.equal(parseSeenSubjects(Array.from({ length: SEEN_SUBJECTS_MAX + 10 }, (_, i) => i)).size, SEEN_SUBJECTS_MAX)
  assert.equal(parseSeenSubjects('nope').size, 0)
})
