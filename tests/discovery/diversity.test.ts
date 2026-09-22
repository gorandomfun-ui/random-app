import test from 'node:test'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { buildProfile } from '../../lib/discovery/profile'
import { seeded } from '../../lib/discovery/random'
import { diversityWeights, exposureOf, EXPOSURE_LIMIT } from '../../lib/discovery/diversity'
import { newSession, planDraw, pickPool, commitDraw, recordWave, type Intent } from '../../lib/discovery/pool'
import { parseSession } from '../../lib/discovery/sessionCodec'
import { createSearchSeeds } from '../../lib/discovery/seeds'
import { planVideoQueries } from '../../lib/ingest/daily-auto/videoPortfolio'
import { createRandomSequence } from '../../lib/random/sequence'
import type { Candidate } from '../../lib/discovery/types'
import { beats } from '../../lib/v3/cool/score'

const now = Date.UTC(2026, 8, 13)
const item = (key: string, title: string, extra: Partial<Candidate<string>> = {}): Candidate<string> => ({
  key, type: 'video', profile: buildProfile({ title }), provider: 'youtube', available: true, stock: false, payload: key, ...extra,
})
const general = (state: ReturnType<typeof newSession>): Intent => ({ ...planDraw(state, 'video'),
  mode: 'random', branch: 'general', lane: 'any' })

test('walking tours across countries share a practice; a train or craft archive remains distinct', () => {
  const walk = item('a', 'Central Park fall walking tour')
  const repeat = item('b', 'Walking tour Tokyo neon streets')
  const train = item('c', 'Train journey through valleys')
  const archive = item('d', 'Pottery archive in Mexico')
  const history = [exposureOf(walk)!]
  const weights = diversityWeights([repeat, train, archive], history)
  assert.ok(weights.get(repeat)! < weights.get(train)!)
  assert.equal(weights.get(train), weights.get(archive))
  assert.ok(weights.get(repeat)! > 0)
})
test('the same repetition rule applies to multiple practices and allows recovery', () => {
  for (const title of ['walking tour', 'stone carving', 'speedrunning', 'punk performance', 'AI romance story']) {
    const previous = item('previous', title), next = item('next', title)
    const alternatives = Array.from({ length: 100 }, (_, i) => exposureOf(item(`x${i}`, `unclassified specimen ${String.fromCharCode(97 + i % 26)}`))!)
    const recent = diversityWeights([next], [exposureOf(previous)!]).get(next)!
    const recovered = diversityWeights([next], [exposureOf(previous)!, ...alternatives]).get(next)!
    assert.ok(recent < recovered, title)
    assert.ok(recent > 0, title)
  }
})
test('a minority practice receives a bounded boost rather than half the traffic regardless of supply', () => {
  const candidates = [...Array.from({ length: 950 }, (_, i) => item(`walk${i}`, 'Walking tour city')),
    ...Array.from({ length: 50 }, (_, i) => item(`train${i}`, 'Train journey mountains'))]
  const random = seeded(92), state = newSession(92), ticket = general(state)
  let walks = 0
  for (let i = 0; i < 1000; i++) walks += Number(pickPool(candidates, ticket, state, random, now)?.item.key.startsWith('walk'))
  assert.ok(walks > 750 && walks < 900, `${walks}/1000 walks in a 95% walking sample`)
})
test('Cool, general and actually displayed Wave items share exposure memory', () => {
  let state = newSession(1)
  state = commitDraw(state, planDraw(state, 'video'), item('a', 'Walking tour Tokyo'))
  state = commitDraw(state, general(state), item('b', 'Walking tour NYC'))
  const before = state.displayed
  state = recordWave(state, item('c', 'Walking tour Berlin'))
  assert.equal(state.displayed, before)
  assert.equal(state.exposures?.length, 3)
  const next = item('d', 'Walking tour Paris'), other = item('e', 'Stone carving sculpture')
  const weights = diversityWeights([next, other], state.exposures!)
  assert.ok(weights.get(next)! < weights.get(other)!)
})
test('a repeated but eligible genre always produces a choice when it is the only available genre', () => {
  let state = newSession(8)
  const candidates = Array.from({ length: 80 }, (_, i) => item(`walk${i}`, 'Walking tour city'))
  const random = seeded(8)
  for (let i = 0; i < 200; i++) {
    const ticket = planDraw(state, 'video'), choice = pickPool(candidates, ticket, state, random, now)
    assert.ok(choice, `draw ${i}`)
    state = commitDraw(state, ticket, choice.item)
  }
  assert.equal(state.exposures?.length, EXPOSURE_LIMIT)
})
test('long exposure history is bounded, survives restoration and remains inside the request byte budget', () => {
  let state = newSession(21)
  for (let i = 0; i < 250; i++) state = commitDraw(state, planDraw(state, 'video'),
    item(`youtube:abcdefgh${i}`, 'Walking tour historical city museum night garden river market autumn local neighborhood architecture',
      { authorKey: `youtube:channel-${i}`, publishedAt: now }))
  assert.equal(state.exposures?.length, 100)
  assert.deepEqual(parseSession(JSON.parse(JSON.stringify(state))), JSON.parse(JSON.stringify(state)))
  const bytes = Buffer.byteLength(JSON.stringify({ session: state, type: 'video', lang: 'fr' }))
  assert.ok(bytes < 65536, `${bytes} bytes`)
  assert.ok(parseSession({ ...state, exposures: undefined }))
  assert.equal(parseSession({ ...state, exposures: new Array(101).fill(state.exposures![0]) }), null)
  assert.equal(parseSession({ ...state, exposures: [{ ...state.exposures![0], terms: [NaN] }] }), null)
  console.log(JSON.stringify({ exposureRequestBytes: bytes }))
})
test('owner affinity can yield probabilistically to diversity without blocking the editorial lane', () => {
  let state = newSession(2)
  for (let i = 0; i < 5; i++) state = commitDraw(state, planDraw(state, 'video'), item(`old${i}`, 'Walking tour city'))
  const ticket: Intent = { ...planDraw(state, 'video'), mode: 'cool', branch: 'editorial', lane: 'described' }
  const neighbor = item('neighbor', 'Walking tour village', { editorialFamilies: ['travel'] })
  const other = item('other', 'Stone carving workshop')
  let relaxed = 0, editorial = 0
  const random = seeded(3)
  for (let i = 0; i < 1000; i++) {
    const choice = pickPool([neighbor, other], ticket, state, random, now, { travel: 20 })!
    relaxed += Number(choice.selection?.reasons.includes('editorial-diversity-relaxed'))
    editorial += Number(choice.branch === 'editorial')
  }
  assert.ok(relaxed > 300 && editorial > 0)
})
test('text slots consume no diversity history and keep a uniform choice', () => {
  const state = newSession(99), ticket = planDraw(state, 'quote')
  const a = item('a', 'Walking tour', { type: 'quote' }), b = item('b', 'Different quotation', { type: 'quote' })
  const after = commitDraw(state, ticket, a)
  assert.deepEqual(after.exposures, [])
  assert.equal(pickPool([a, b], ticket, state, () => .1, now)?.item.key, 'a')
  assert.equal(pickPool([a, b], ticket, state, () => .9, now)?.item.key, 'b')
})
test('the actual forty-slot application sequence retains its video, image, text, web and quiz counts', () => {
  const random = seeded(721)
  let state = newSession(721), serial = 0
  for (let cycle = 0; cycle < 5; cycle++) {
    const sequence = createRandomSequence(random), counts: Record<string, number> = {}
    assert.equal(sequence.length, 40)
    for (const entry of sequence) {
      const type = entry.kind === 'text' ? 'quote' : entry.itemType
      const candidate = item(`slot${serial++}`, 'Stone carving', { type, quiz: entry.kind === 'quiz' })
      const ticket = planDraw(state, type), result = pickPool([candidate], ticket, state, random, now)
      assert.ok(result); assert.equal(result.item.type, type)
      counts[entry.kind === 'quiz' ? 'quiz' : type] = (counts[entry.kind === 'quiz' ? 'quiz' : type] ?? 0) + 1
      state = commitDraw(state, ticket, result.item)
    }
    assert.ok(counts.video === 24 || counts.video === 25)
    assert.ok(counts.image === 9 || counts.image === 10)
    assert.ok(counts.web === 1 || counts.web === 2)
    assert.equal(counts.quote, 3); assert.equal(counts.quiz, 2)
  }
  assert.equal(state.displayed, 200)
})
test('ingestion rotates current/unusual/legacy searches at the same query count', () => {
  const legacy = Array.from({ length: 60 }, (_, i) => `legacy archive subject ${i}`)
  const one = planVideoQueries(legacy, { count: 8, seed: 'pass-1', offset: 0, now })
  const two = planVideoQueries(legacy, { count: 8, seed: 'pass-1', offset: 8, now })
  assert.equal(one.length, 8); assert.equal(two.length, 8)
  for (const batch of [one, two]) {
    assert.equal(batch.filter(x => x.lane === 'existing').length, 4)
    assert.equal(batch.filter(x => x.lane === 'contemporary').length, 2)
    assert.equal(batch.filter(x => x.lane === 'unusual').length, 2)
    assert.equal(new Set(batch.map(x => x.query)).size, 8)
  }
  const routes = one.filter(x => x.route).map(x => x.route)
  assert.ok(two.filter(x => x.route).every(x => !routes.includes(x.route)))
  const fallback = planVideoQueries([], { count: 8, seed: 'pass-1', now })
  assert.equal(fallback.length, 8)
  assert.ok(fallback.every(x => x.query.length))
})
test('consecutive exploration workers rotate queries without discarding page contents', () => {
  const a = createSearchSeeds(seeded(1), now, 20, undefined, 0)
  const b = createSearchSeeds(seeded(2), now, 20, undefined, 1)
  const keys = new Set(a.map(x => x.kind === 'search' ? `${x.language}:${x.query}` : ''))
  assert.equal(a.length, 20); assert.equal(b.length, 20)
  assert.ok(b.every(x => x.kind === 'search' && !keys.has(`${x.language}:${x.query}`)))
})
test('200-draw sessions preserve format/mode planning and remain random with bounded samples', () => {
  const titles = ['Walking tour Tokyo', 'Train journey hills', 'Stone carving workshop', 'Guitar concert',
    'Skateboarding ollie', 'Cooking noodles', 'Stop motion puppet', 'Football goal', 'AI romance story', 'Astronomy telescope',
    'Pottery sculpture', 'Short film science fiction', 'Robotique demonstration', 'Publicite ancienne']
  const candidates = Array.from({ length: 156 }, (_, i) => item(`c${i}`, titles[i % titles.length],
    { type: i % 4 ? 'video' : 'image', authorKey: `creator${i % 71}`, ...(i % 5 === 0 ? { publishedAt: now - 86400000 } : {}) }))
  const counts: Record<string, number> = {}, started = performance.now()
  const durations: number[] = [], sequences: string[] = []
  for (let s = 0; s < 10; s++) {
    let state = newSession(s), cool = 0, visuals = 0
    const random = seeded(s), sequence: string[] = []
    for (let i = 0; i < 200; i++) {
      const type = i % 10 === 9 ? 'quote' : i % 4 ? 'video' : 'image', ticket = planDraw(state, type)
      const pool = type === 'quote' ? [item(`q${i}`, 'A quotation', { type: 'quote' })] : candidates
      const start = performance.now(), result = pickPool(pool, ticket, state, random, now)
      durations.push(performance.now() - start)
      assert.ok(result); assert.equal(result.item.type, type)
      if (type !== 'quote') { visuals++; cool += Number(ticket.mode === 'cool') }
      counts[result.item.profile.family] = (counts[result.item.profile.family] ?? 0) + 1
      sequence.push(result.item.key); state = commitDraw(state, ticket, result.item)
    }
    assert.equal(cool, beats(s, visuals).filter(beat => beat === 'cool').length, `${cool} cool sur ${visuals} visuels : la partition décide`)
    sequences.push(sequence.join(','))
  }
  assert.equal(new Set(sequences).size, 10)
  durations.sort((a, b) => a - b)
  console.log(JSON.stringify({ simulation: 'diversity', sessions: 10, draws: 2000, counts,
    totalMs: Math.round(performance.now() - started), selectionP95Ms: durations[Math.floor(durations.length * .95)] }))
})
