import assert from 'node:assert/strict'
import test from 'node:test'

import { CARDS, cardsOf, censusNote, emptyCensus, parisDay } from '../../lib/v3/cards/census'

test('a stored video is sorted into the cards it could fill', () => {
  assert.deepEqual(cardsOf({ title: 'Full match', duration: 'PT1H30M', v3: { line: 'dig', universe: 'sport', dig: { base: 'people' } } }), ['long', 'world'])
  assert.deepEqual(cardsOf({ title: 'Goal of the week', duration: 'PT1M', viewCount: 500, v3: { line: 'fresh', universe: 'sport', subjects: [{ id: 'x' }] } }), ['buzz', 'short', 'deep'])
  assert.deepEqual(cardsOf({ title: 'Old TV ad', duration: 'PT30S', v3: { line: 'dig', era: 'retro', universe: 'history', dig: { base: 'keywords' } } }), ['retro', 'short', 'weird'])
  assert.deepEqual(cardsOf({ title: 'Live stream now', duration: 'PT2H', liveBroadcastContent: 'live', v3: { line: 'dig', universe: 'gaming', subjects: [{ id: 'g' }], dig: { base: 'likes' } } }), ['taste'])
  assert.deepEqual(cardsOf({ title: 'Speedrun history', duration: 'PT12M', v3: { universe: 'gaming', subjects: [{ id: 'g' }] } }), ['bonus:gaming'])
  assert.deepEqual(cardsOf({ title: "Minecraft let's play ep 3", duration: 'PT12M', v3: { universe: 'gaming', subjects: [{ id: 'g' }] } }), [])
  assert.deepEqual(cardsOf({ title: 'A song live', duration: 'PT3M', v3: { universe: 'music' } }), ['short', 'bonus:music'])
  assert.deepEqual(cardsOf({ title: 'Cat fails', duration: 'PT1M', v3: { universe: 'humor-memes' } }), ['short', 'bonus:humor-memes'])
})

test('the census starts empty for every card and reads as one line', () => {
  const census = emptyCensus('2026-10-01', new Date('2026-10-01T20:00:00Z'))
  assert.deepEqual(Object.keys(census.cards), [...CARDS])
  assert.match(censusNote(census), /^0 vidéos · buzz 0 · long 0/)
  assert.equal(parisDay(new Date('2026-10-01T22:30:00Z')), '2026-10-02')
  assert.equal(parisDay(new Date('2026-10-01T21:30:00Z')), '2026-10-01')
})
