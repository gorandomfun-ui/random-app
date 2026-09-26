import test from 'node:test'
import assert from 'node:assert/strict'

import { POOL_FLOOR, POOL_UNIVERSES, QUERIES_ABOVE_FLOOR, QUERIES_MAX, QUERIES_PER_NIGHT, queriesTonight } from '@/lib/v3/pools/facets'
import { computeUniverseRecap, drawable } from '@/lib/v3/pools/recap'
import { nightPlan, rounds } from '@/lib/v3/ingest/lines/pools'
import { CINEMA_PULLING_FORMATS, fallbackFormats } from '@/lib/ingest/daily-auto/queries'
import { universeFromCues } from '@/lib/v3/tagging/cues'

const NOW = new Date('2026-09-27T02:40:00Z')

test('plancher : plus un pool est loin des 20 000, plus il reçoit de recherches, jusqu_au double', () => {
  assert.equal(queriesTonight(0), QUERIES_MAX)
  assert.equal(queriesTonight(5_000), 14)
  assert.equal(queriesTonight(15_000), 10)
  assert.equal(queriesTonight(POOL_FLOOR), QUERIES_ABOVE_FLOOR, 'au plancher, il continue, un peu moins vite')
  assert.equal(queriesTonight(46_829), QUERIES_ABOVE_FLOOR, 'la musique continue')
  assert.equal(queriesTonight(undefined), QUERIES_PER_NIGHT, 'taille inconnue : la nuit ordinaire')
  assert.ok(!POOL_UNIVERSES.includes('cinema-tv' as never) && !POOL_UNIVERSES.includes('news-society' as never), 'ni cinéma ni actualité')
  for (const universe of ['art', 'science', 'history', 'tech', 'animation', 'fashion', 'vehicles', 'people-everyday', 'nature-animals']) {
    assert.ok(POOL_UNIVERSES.includes(universe as never), `${universe} a son pool`)
  }
})

test('la nuit : les plus petits pools d_abord, à tour de rôle, une recherche chacun', () => {
  const plan = nightPlan({ music: 46_829, art: 7_169, history: 5_362, sport: 27_493 }, NOW)
  assert.equal(plan[0].universe, 'history')
  assert.equal(plan[1].universe, 'art')
  assert.equal(plan.find((entry) => entry.universe === 'music')?.queries.length, QUERIES_ABOVE_FLOOR)
  assert.equal(plan.find((entry) => entry.universe === 'history')?.queries.length, queriesTonight(5_362))
  const order = rounds(plan)
  assert.deepEqual(order.slice(0, 2).map((step) => step.entry.universe), ['history', 'art'], 'premier tour : chacun sa première recherche')
  assert.equal(order.length, plan.reduce((sum, entry) => sum + entry.queries.length, 0), 'aucune recherche perdue')
  const firstRound = order.slice(0, plan.length).map((step) => step.entry.universe)
  assert.equal(new Set(firstRound).size, plan.length, 'tout le monde passe au premier tour')
})

test('tirables : le stocké moins ce qu_un nettoyage a mis de côté', async () => {
  assert.deepEqual(drawable({ 'cinema-tv': 161_861, music: 46_829, art: -1 }, { 'cinema-tv': 12_703, music: 411 }), { 'cinema-tv': 149_158, music: 46_418, art: -1 })
  const db = {} as import('mongodb').Db
  const recap = await computeUniverseRecap(db, NOW, {
    sizes: async () => ({ 'cinema-tv': 161_861, art: 7_169 }),
    added: async () => ({ art: 112 }),
    setAside: async () => ({ 'cinema-tv': 12_703, art: 29 }),
  })
  assert.deepEqual(recap.sizes, { 'cinema-tv': 149_158, art: 7_140 })
  assert.deepEqual(recap.setAside, { 'cinema-tv': 12_703, art: 29 })
})

test('le classement : un titre de film banal ne suffit plus pour le cinéma, l_univers cherché gagne', async () => {
  const { buildSubjectIndex } = await import('@/lib/v3/tagging/subjectIndex')
  const { tagItem } = await import('@/lib/v3/tagging/tagItem')
  const index = buildSubjectIndex([
    { _id: 'entity:the-truth', label: 'The Truth', universe: 'cinema-tv', kind: 'entity', aliases: ['the truth'], ambiguous: false },
    { _id: 'entity:barbecue-film', label: 'Barbecue', universe: 'cinema-tv', kind: 'entity', aliases: ['barbecue'], ambiguous: false },
  ] as never)
  const tag = (title: string, extra: Record<string, unknown> = {}) => tagItem({ type: 'video', title, provider: 'dailymotion', ...extra } as never, index, NOW).universe
  assert.notEqual(tag('Is This the End of the World? The Truth Will Shock You!'), 'cinema-tv')
  assert.equal(tag('The Truth (2019) official trailer'), 'cinema-tv', 'avec un mot de cinéma, le film compte')
  assert.equal(tag('The Truth will shock you', { categoryId: 'shortfilms' }), 'cinema-tv', 'ou avec une catégorie film')
  assert.equal(tag('Barbecue', { universeHint: 'food' }), 'food', 'la passe cherchait de la cuisine')
  assert.equal(tagItem({ type: 'gif', title: 'The Truth GIF', provider: 'giphy' } as never, index, NOW).universe, 'cinema-tv', 'un GIF de film reste au film')
})

test('le mot « tv » ou « scene » seul ne classe plus en cinéma', () => {
  assert.notEqual(universeFromCues('Canal 13 TV en vivo'), 'cinema-tv')
  assert.notEqual(universeFromCues('The punk scene in Berlin'), 'cinema-tv')
  assert.equal(universeFromCues('Season 2 episode 4 recap'), 'cinema-tv')
})

test('l_ancien passage ne cherche plus avec les formats qui attirent le cinéma et les feuilletons', () => {
  const formats = fallbackFormats({ energies: [], subjects: [], formats: ['clip', 'trailer', 'teaser', 'episode', 'series', 'feature', 'session'], locales: [], eras: [], extras: [] })
  for (const pulling of CINEMA_PULLING_FORMATS) assert.ok(!formats.includes(pulling), `${pulling} retiré`)
  assert.ok(formats.includes('public domain film') && formats.includes('home movie') && formats.includes('session'), 'les films oubliés et le reste restent')
})
