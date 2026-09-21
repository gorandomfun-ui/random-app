import test from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_BAG, coolBag, pickBagSource, type CoolSource } from '@/lib/v3/cool/bag'

const tally = (sources: CoolSource[]) => sources.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s]: (acc[s] ?? 0) + 1 }), {})

test('le sac par défaut : un gaming, deux old school, deux musique, deux ailleurs, deux likes, une tendance', () => {
  assert.equal(DEFAULT_BAG.length, 10)
  assert.deepEqual(tally(DEFAULT_BAG), { gaming: 1, oldschool: 2, music: 2, elsewhere: 2, like: 2, trend: 1 })
})

test('le réglage RANDOM_COOL_BAG est lu, et ignoré quand il ne tient pas debout', () => {
  assert.deepEqual(tally(coolBag('gaming:1,like:3,music:2')), { gaming: 1, like: 3, music: 2 })
  assert.deepEqual(coolBag('trend:6,music:1'), DEFAULT_BAG, 'jamais plus de cinq tickets tendance')
  assert.deepEqual(coolBag('disco:4'), DEFAULT_BAG, 'une source inconnue rend le sac par défaut')
  assert.deepEqual(coolBag(''), DEFAULT_BAG)
  assert.deepEqual(coolBag(undefined), DEFAULT_BAG)
})

test('sur mille sessions, les départs suivent le sac, et jamais deux fois la même source d_affilée', () => {
  const counts: Record<string, number> = {}
  let repeats = 0
  for (let seed = 1; seed <= 1000; seed += 1) {
    let previous: CoolSource | null = null
    for (let index = 0; index < 10; index += 1) {
      const source = pickBagSource(seed, index, previous)
      counts[source] = (counts[source] ?? 0) + 1
      if (source === previous) repeats += 1
      previous = source
    }
  }
  const total = 10_000
  assert.equal(repeats, 0)
  assert.ok(Math.abs(counts.gaming / total - 0.1) < 0.05, `gaming ${counts.gaming / total}`)
  assert.ok(Math.abs(counts.oldschool / total - 0.2) < 0.05, `old school ${counts.oldschool / total}`)
  assert.ok(Math.abs(counts.music / total - 0.2) < 0.05)
  assert.ok(Math.abs(counts.elsewhere / total - 0.2) < 0.05)
  assert.ok(Math.abs(counts.like / total - 0.2) < 0.05)
  assert.ok(Math.abs(counts.trend / total - 0.1) < 0.05)
})
