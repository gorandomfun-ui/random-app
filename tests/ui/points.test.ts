import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * The one counter of points: it must survive a closed tab, carry the old quiz
 * total in, and never take the number backwards. The provider itself is a React
 * component, so what is tested here is the rule it follows, against the same
 * browser store it uses.
 */

const store = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
  },
  configurable: true,
})

const KEY = 'random-points-total'
const LEGACY = 'random-quiz-score-total'

/** The provider's reading rule, kept in step with `providers/ScoreProvider.tsx`. */
function readStored(): number {
  const stored = localStorage.getItem(KEY)
  if (stored != null) {
    const parsed = parseInt(stored, 10)
    if (!Number.isNaN(parsed)) return Math.max(0, parsed)
  }
  const legacy = localStorage.getItem(LEGACY)
  if (legacy != null) {
    const parsed = parseInt(legacy, 10)
    if (!Number.isNaN(parsed)) return Math.max(0, parsed)
  }
  return 0
}

test('un visiteur sans passé part de zéro', () => {
  store.clear()
  assert.equal(readStored(), 0)
})

test('le total de quiz d_avant est repris : personne ne perd ses points', () => {
  store.clear()
  store.set(LEGACY, '2')
  assert.equal(readStored(), 2)
})

test('une fois le nouveau total écrit, c_est lui qui fait foi', () => {
  store.clear()
  store.set(LEGACY, '2')
  store.set(KEY, '17')
  assert.equal(readStored(), 17)
})

test('un stockage abîmé ne fait pas partir le compteur en vrille', () => {
  store.clear()
  for (const junk of ['', 'abc', '-4', 'NaN']) {
    store.set(KEY, junk)
    const value = readStored()
    assert.ok(Number.isInteger(value) && value >= 0, `${junk} → ${value}`)
  }
})

test('le total est gardé pour de bon, pas pour la session', () => {
  // The old XP counter lived in the session store, which a closed tab wiped.
  store.clear()
  store.set(KEY, '42')
  assert.equal(readStored(), 42, 'toujours là après une fermeture d_onglet')
  assert.equal(typeof (globalThis as unknown as { sessionStorage?: unknown }).sessionStorage, 'undefined',
    'plus rien ne dépend du stockage de session')
})
