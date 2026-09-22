import test from 'node:test'
import assert from 'node:assert/strict'

import { seeded } from '../../lib/discovery/random'
import { ALL_ITEM_TYPES, INITIAL_VIDEO_POOLS, RANDOM_SEQUENCE_SIZE, STRONG_POOL_INITIAL_DRAWS, createSequenceState, nextSlot, type RandomSequenceState } from '../../lib/random/sequence'
import type { ItemType } from '../../lib/random/types'

const allowed = new Set<ItemType>(ALL_ITEM_TYPES)

test('le lecteur de cycle lit quarante pas, puis ouvre un nouveau cycle', () => {
  let state: RandomSequenceState = createSequenceState(seeded(1))
  const random = seeded(2)
  for (let index = 0; index < RANDOM_SEQUENCE_SIZE; index += 1) {
    const next = nextSlot(state, allowed, ALL_ITEM_TYPES, random)
    assert.equal(next.slot.kind, 'content')
    state = next.state
    assert.equal(state.draws, index + 1)
    assert.equal(state.round, 0)
  }
  assert.equal(state.step, RANDOM_SEQUENCE_SIZE)
  const next = nextSlot(state, allowed, ALL_ITEM_TYPES, random)
  assert.equal(next.state.round, 1, 'un cycle épuisé en ouvre un autre')
  assert.equal(next.state.step, 1)
  assert.equal(next.state.draws, RANDOM_SEQUENCE_SIZE + 1)
  assert.notEqual(next.state.cycle, state.cycle)
})

test('les vingt premiers tirages sont forts et les vidéos suivent la table des pools ; ensuite non', () => {
  let state = createSequenceState(seeded(3))
  const random = seeded(4)
  for (let draw = 0; draw < 60; draw += 1) {
    const { slot, state: after } = nextSlot(state, allowed, ALL_ITEM_TYPES, random)
    assert.equal(slot.kind, 'content')
    if (slot.kind !== 'content') return
    if (draw < STRONG_POOL_INITIAL_DRAWS) {
      assert.equal(slot.strong, true, `tirage ${draw}`)
      if (slot.itemType === 'video') assert.equal(slot.videoPool, INITIAL_VIDEO_POOLS[draw] ?? 'fresh')
    } else {
      assert.equal(slot.strong, false)
      assert.equal(slot.videoPool, undefined)
    }
    state = after
  }
})

test('un pas texte choisit parmi les types permis, un pas interdit est sauté', () => {
  const onlyQuotes = new Set<ItemType>(['video', 'image', 'quote'])
  let state = createSequenceState(seeded(5))
  const random = seeded(6)
  const types = new Set<string>()
  for (let draw = 0; draw < 80; draw += 1) {
    const { slot, state: after } = nextSlot(state, onlyQuotes, ['video', 'image', 'quote'], random)
    if (slot.kind === 'content') types.add(slot.itemType)
    state = after
  }
  assert.deepEqual([...types].sort(), ['image', 'quote', 'video'])
})
