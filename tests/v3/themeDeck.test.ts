import assert from 'node:assert/strict'
import test from 'node:test'

import { selectCool } from '../../lib/discovery/coolPool'
import { unseenSample } from '../../lib/discovery/freshPool'
import { newSession, planDraw, type Intent, type Session } from '../../lib/discovery/pool'
import { seeded } from '../../lib/discovery/random'
import { byLiveliness, livelyRank, themeAt, themeDeck, trailersSeenIn, TRAILERS_PER_SESSION } from '../../lib/v3/cool/themes'
import { fakeDb, fakeVideo } from '../support/fakeDb'

test('a session turns its cards deck after deck: every universe has its turn, never the same twice in a row', () => {
  const deck = themeDeck()
  for (const seed of [1, 7, 42, 99_999]) {
    const cards = Array.from({ length: deck.length * 3 }, (_, index) => themeAt(seed, index))
    for (let index = 1; index < cards.length; index += 1) assert.notEqual(cards[index], cards[index - 1], `seed ${seed}, card ${index}`)
    for (let round = 0; round < 3; round += 1) {
      const drawn = cards.slice(round * deck.length, (round + 1) * deck.length).sort()
      assert.deepEqual(drawn, [...deck].sort(), 'one deck holds every card once')
    }
    assert.equal(themeAt(seed, 5), themeAt(seed, 5), 'the same session, the same card: the page and the server agree')
  }
  const first20 = new Set(Array.from({ length: 20 }, (_, index) => themeAt(3, index)))
  assert.ok(first20.size >= 14, `many universes in the first twenty visuals (${first20.size})`)
  assert.ok(deck.filter((card) => card === 'gaming').length === 1 && deck.filter((card) => card === 'humor-memes').length === 3)
})

test('lively and short first: a clip before a four-hour live, a moving video before a still album cover', () => {
  assert.equal(livelyRank({ type: 'video', duration: 'PT2M30S', title: 'Skate stunts' }), 0)
  assert.equal(livelyRank({ type: 'video', duration: 'PT12M', title: 'A walk in Hanoi' }), 1)
  assert.equal(livelyRank({ type: 'video', duration: 'PT4H1M', title: 'Fortnite world cup' }), 2)
  assert.equal(livelyRank({ type: 'video', duration: 'PT3M', channelTitle: 'Mavo - Topic', title: 'Find My Babe' }), 2)
  assert.equal(livelyRank({ type: 'video', duration: 'PT45M', title: '🔴 LIVE NOW Free Fire' }), 2)
  assert.equal(livelyRank({ type: 'image', title: 'Cat GIF' }), 0)
  const rows = [
    { _id: 'a', type: 'video', duration: 'PT1H', title: 'long' },
    { _id: 'b', type: 'video', duration: 'PT1M', title: 'short' },
    { _id: 'c', type: 'video', duration: 'PT2M', title: 'Official Trailer' },
  ]
  assert.deepEqual(byLiveliness(rows).map((row) => row._id), ['b', 'a', 'c'], 'a trailer comes last, after even a long video')
  assert.deepEqual(byLiveliness(rows, TRAILERS_PER_SESSION).map((row) => row._id), ['b', 'a'], 'a trailer past the session\'s two is left out')
  assert.equal(trailersSeenIn([{ practices: ['film-trailer'] }, { practices: [] }, { practices: ['film-trailer', 'cinema'] }]), 2)
})

test('the fresh list gives only the places of the card\'s universe', () => {
  const universes = ['music', 'sport', 'music', 'gaming', 'sport']
  const picks = unseenSample(universes.length, '2026-09-28', null, 10, seeded(4), (index) => universes[index] === 'sport')
  assert.deepEqual([...picks].sort(), [1, 4])
})

const NOW = Date.UTC(2026, 8, 28)
const coolTicket = (state: Session): Intent => ({ ...planDraw(state, 'video'), type: 'video', mode: 'cool', branch: 'autonomous' })

test('a cool ticket looks in the session\'s universe first, and falls back to its source when the universe has nothing', async () => {
  const humour = [1, 2, 3, 4].map((n) => fakeVideo('elsewhere', { v3: { universe: 'humor-memes', registers: [], popularity: 'niche', usable: true, era: 'recent', line: 'trend' }, duration: 'PT1M', publishedAt: new Date(NOW - n * 86_400_000), title: `sketch ${n}` }))
  const others = [fakeVideo('music'), fakeVideo('archive'), fakeVideo('elsewhere'), fakeVideo('gaming')]
  for (const seed of [2, 5, 8]) {
    const state = newSession(seed)
    const themed = await selectCool(fakeDb([...humour, ...others]), coolTicket(state), state, (row) => row, seeded(seed), NOW, 'humor-memes')
    assert.ok(themed)
    if (themed.cool.asked !== 'like') assert.equal((themed.item.payload as { v3: { universe: string } }).v3.universe, 'humor-memes', `seed ${seed}: ${themed.cool.asked}`)
    const fallback = await selectCool(fakeDb(others), coolTicket(state), state, (row) => row, seeded(seed), NOW, 'history')
    assert.ok(fallback, 'nothing in the universe: the source as before')
  }
})


test('with the cards, a cool ticket never falls back to the reserved music or gaming source', async () => {
  const rows = [fakeVideo('music'), fakeVideo('music'), fakeVideo('gaming'), fakeVideo('gaming'), fakeVideo('archive'), fakeVideo('archive'), fakeVideo('elsewhere'), fakeVideo('elsewhere')]
  for (let seed = 1; seed <= 40; seed += 1) {
    for (const coolTickets of [0, 1, 2, 3, 4, 5]) {
      const state: Session = { ...newSession(seed), coolTickets }
      const result = await selectCool(fakeDb(rows), coolTicket(state), state, (row) => row, seeded(seed * 7 + coolTickets), NOW, 'history')
      if (!result || result.cool.asked === 'like') continue
      assert.ok(!['music', 'gaming'].includes(result.cool.source), `seed ${seed}, ticket ${coolTickets}: ${result.cool.source}`)
      assert.ok(!result.cool.niche || ['oldschool', 'elsewhere'].includes(result.cool.niche))
    }
  }
})

test('made by AI, news filed elsewhere, lessons and institutions\' GIFs wait; what has none of it comes first', () => {
  assert.equal(livelyRank({ type: 'video', duration: 'PT1M', title: 'Jai Hanuman: The Power of Devotion | Cinematic 3D Animation #aivideo' }), Infinity)
  assert.equal(livelyRank({ type: 'video', duration: 'PT2M', title: 'The snail that carries a castle', description: 'Made with AI (Kling)' }), Infinity)
  assert.equal(livelyRank({ type: 'video', duration: 'PT3M', title: 'BREAKING: Cabinet moves to fire army chief', v3: { universe: 'history' } }), 2)
  assert.equal(livelyRank({ type: 'video', duration: 'PT3M', title: 'BREAKING: Cabinet moves to fire army chief', v3: { universe: 'news-society' } }), 0, 'the news card may have its news')
  assert.equal(livelyRank({ type: 'video', duration: 'PT4M', title: 'How to Insert an Image in Adobe InDesign – Easy Beginner Tutorial' }), 2)
  assert.equal(livelyRank({ type: 'video', duration: 'PT5M', title: 'Top 7 AI Tools to Make Money Online in 2025 | Passive Income' }), 2)
  assert.equal(livelyRank({ type: 'image', title: 'Indiana Hoosiers Football GIF by Indiana University Bloomington' }), 2)
  assert.equal(livelyRank({ type: 'image', title: 'Cat Cuteness GIF' }), 0)
  assert.equal(livelyRank({ type: 'video', duration: 'PT1M', title: 'Cette araignée paon danse sur YMCA' }), 0)
  assert.equal(livelyRank({ type: 'video', duration: 'PT2M', title: 'A documentary about artificial intelligence and jobs' }), 0, 'a film about AI is not made by AI')
})

test('a session does not show the same film twice, in another language or not', async () => {
  const { echoesSession, appendExposure } = await import('../../lib/discovery/diversity')
  const candidate = (key: string, titleTokens: string[]) => ({ key, type: 'video', provider: 'youtube', payload: null, stock: false, available: true,
    profile: { family: 'cinema', titleTokens, titlePractices: [] } }) as never
  const history = appendExposure([], candidate('youtube:a', ['toy', 'story', '2019', 'trailer', 'spanish']))
  assert.equal(echoesSession(candidate('youtube:b', ['bande', 'annonce', 'toy', 'story']), history), true)
  assert.equal(echoesSession(candidate('youtube:c', ['surf', 'festival', 'round']), history), false)
})
