import test from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_BAG, NICHE_SOURCES, bagSequence, bagSourceAt, coolBag, nicheAt, type CoolSource } from '@/lib/v3/cool/bag'

const tally = (sources: string[]) => sources.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s]: (acc[s] ?? 0) + 1 }), {})

test('le sac par défaut : quatre tendances, trois likes, trois niches', () => {
  assert.equal(DEFAULT_BAG.length, 10)
  assert.deepEqual(tally(DEFAULT_BAG), { trend: 4, like: 3, niche: 3 })
})

test('le réglage RANDOM_COOL_BAG est lu, et ignoré quand il ne tient pas debout', () => {
  assert.deepEqual(tally(coolBag('trend:2,like:3,niche:5')), { trend: 2, like: 3, niche: 5 })
  assert.deepEqual(tally(coolBag('trend:5,like:5')), { trend: 5, like: 5 }, 'cinq tendances, c_est le plafond')
  assert.deepEqual(coolBag('trend:6,niche:1'), DEFAULT_BAG, 'jamais plus de cinq tickets tendance')
  assert.deepEqual(coolBag('gaming:4'), DEFAULT_BAG, 'les registres ne sont plus des sources : le sac par défaut')
  assert.deepEqual(coolBag(''), DEFAULT_BAG)
  assert.deepEqual(coolBag(undefined), DEFAULT_BAG)
})

test('sur mille sessions, les tickets suivent le sac 4/3/3 et jamais deux fois la même source d_affilée, d_un sac à l_autre aussi', () => {
  const counts: Record<string, number> = {}
  let repeats = 0
  for (let seed = 1; seed <= 1000; seed += 1) {
    const sequence = bagSequence(seed, 30)
    assert.equal(sequence.length, 30)
    for (let index = 0; index < sequence.length; index += 1) {
      counts[sequence[index]] = (counts[sequence[index]] ?? 0) + 1
      if (index && sequence[index] === sequence[index - 1]) repeats += 1
      assert.equal(bagSourceAt(seed, index), sequence[index], 'lire un rang seul donne le même ticket que la suite')
    }
    assert.deepEqual(tally(sequence.slice(0, 10)), { trend: 4, like: 3, niche: 3 }, 'chaque sac tient ses dix tickets')
  }
  const total = 30_000
  assert.equal(repeats, 0)
  assert.ok(Math.abs(counts.trend / total - 0.4) < 0.01, `trend ${counts.trend / total}`)
  assert.ok(Math.abs(counts.like / total - 0.3) < 0.01, `like ${counts.like / total}`)
  assert.ok(Math.abs(counts.niche / total - 0.3) < 0.01, `niche ${counts.niche / total}`)
})

test('un sac serré (cinq tendances, cinq likes) alterne encore sans jamais se répéter', () => {
  const bag = coolBag('trend:5,like:5')
  for (let seed = 1; seed <= 200; seed += 1) {
    const sequence = bagSequence(seed, 40, bag)
    for (let index = 1; index < sequence.length; index += 1) assert.notEqual(sequence[index], sequence[index - 1], `graine ${seed}, rang ${index}`)
  }
})

test('la niche tourne entre les quatre registres, jamais le même deux fois de suite — donc jamais gaming deux fois', () => {
  const counts: Record<string, number> = {}
  for (let seed = 1; seed <= 500; seed += 1) {
    const sequence = bagSequence(seed, 40)
    const niches = sequence.map((source, index) => (source === 'niche' ? nicheAt(seed, index) : null)).filter((niche): niche is NonNullable<typeof niche> => niche !== null)
    assert.equal(niches.length, 12, 'trois niches par sac, quatre sacs')
    for (let index = 0; index < niches.length; index += 1) {
      assert.ok(NICHE_SOURCES.includes(niches[index]))
      if (index) assert.notEqual(niches[index], niches[index - 1], `graine ${seed}`)
      counts[niches[index]] = (counts[niches[index]] ?? 0) + 1
    }
    assert.deepEqual(new Set(niches.slice(0, 4)), new Set(NICHE_SOURCES), 'les quatre premières niches sont les quatre registres')
  }
  for (const niche of NICHE_SOURCES) assert.ok(Math.abs(counts[niche] / 6000 - 0.25) < 0.01, `${niche} ${counts[niche] / 6000}`)
})

test('un rang se lit sans dépendre de ce qui a été servi : la même graine donne toujours la même suite', () => {
  const sources: CoolSource[] = bagSequence(42, 25)
  assert.deepEqual(bagSequence(42, 25), sources)
  assert.equal(nicheAt(42, sources.indexOf('niche')), nicheAt(42, sources.indexOf('niche')))
})
