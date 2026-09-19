import test from 'node:test'
import assert from 'node:assert/strict'

import {
  EMPTY_HISTORY,
  SPACING,
  familyWeight,
  isAllowed,
  popularityWeight,
  remember,
  type DrawCandidate,
  type DrawHistory,
} from '@/lib/v3/draw/rules'
import type { Popularity, Universe } from '@/lib/v3/types'

let counter = 0
function item(options: Partial<DrawCandidate['v3']> & { subjectId?: string } = {}): DrawCandidate {
  counter += 1
  return {
    id: `i${counter}`,
    v3: {
      universe: options.universe ?? 'music',
      popularity: options.popularity ?? 'mid',
      subjects: options.subjectId
        ? [{ id: options.subjectId, role: 'primary', evidence: 'alias' }]
        : [],
      channelKey: options.channelKey,
      nearFamily: options.nearFamily,
      formatFamily: options.formatFamily,
    },
  }
}

function play(history: DrawHistory, candidates: DrawCandidate[]): DrawHistory {
  return candidates.reduce((current, candidate) => remember(current, candidate), history)
}

test('jamais deux fois le même auteur dans les 100 derniers tirages', () => {
  const auteur = item({ channelKey: 'youtube:UCaaa' })
  const history = play(EMPTY_HISTORY, [auteur])
  assert.equal(isAllowed(history, item({ channelKey: 'youtube:UCaaa' })), false)
  assert.equal(isAllowed(history, item({ channelKey: 'youtube:UCbbb' })), true)
})

test('l_auteur redevient possible passé la fenêtre', () => {
  let history = play(EMPTY_HISTORY, [item({ channelKey: 'youtube:UCaaa' })])
  // 100 autres auteurs passent entre-temps, en alternant les univers pour
  // que ce soit bien la règle de l_auteur qu_on mesure, et pas celle des
  // univers — la première version de ce test se trompait de règle.
  const univers: Universe[] = ['music', 'sport', 'food']
  for (let index = 0; index < SPACING.channel; index += 1) {
    history = remember(history, item({ channelKey: `youtube:UC${index}`, universe: univers[index % 3] }))
  }
  assert.equal(isAllowed(history, item({ channelKey: 'youtube:UCaaa', universe: 'travel' })), true)
})

test('jamais le même sujet principal dans les 25 derniers', () => {
  const history = play(EMPTY_HISTORY, [item({ subjectId: 'entity:south-park' })])
  assert.equal(isAllowed(history, item({ subjectId: 'entity:south-park' })), false)
  assert.equal(isAllowed(history, item({ subjectId: 'entity:daft-punk' })), true)
})

test('pas trois fois le même univers d_affilée, mais deux oui', () => {
  const deux = play(EMPTY_HISTORY, [item({ universe: 'music' }), item({ universe: 'music' })])
  assert.equal(isAllowed(deux, item({ universe: 'music' })), true, 'le troisième passe encore')

  const trois = remember(deux, item({ universe: 'music' }))
  assert.equal(isAllowed(trois, item({ universe: 'music' })), false, 'le quatrième est bloqué')
  assert.equal(isAllowed(trois, item({ universe: 'sport' })), true)
})

test('un quasi-doublon ne revient pas avant 100 tirages', () => {
  const history = play(EMPTY_HISTORY, [item({ nearFamily: 'abcd' })])
  assert.equal(isAllowed(history, item({ nearFamily: 'abcd' })), false)
  assert.equal(isAllowed(history, item({ nearFamily: 'efgh' })), true)
})

test('une famille de format ne revient pas avant 15 tirages', () => {
  const history = play(EMPTY_HISTORY, [item({ formatFamily: 'topic:danse×tutorial×hi' })])
  assert.equal(isAllowed(history, item({ formatFamily: 'topic:danse×tutorial×hi' })), false)
  assert.equal(isAllowed(history, item({ formatFamily: 'topic:danse×tutorial×fr' })), true)
})

test('la popularité est rééquilibrée vers ce qui manque', () => {
  // Dix contenus confidentiels d_affilée : le catalogue en est plein.
  const queDuNiche: DrawHistory = { ...EMPTY_HISTORY, popularities: Array(10).fill('niche' as Popularity) }
  assert.ok(
    popularityWeight(queDuNiche, 'mainstream') > popularityWeight(queDuNiche, 'niche'),
    'après dix confidentiels, un contenu connu doit être privilégié',
  )
  // Et l_inverse
  const queDuMainstream: DrawHistory = { ...EMPTY_HISTORY, popularities: Array(10).fill('mainstream' as Popularity) }
  assert.ok(popularityWeight(queDuMainstream, 'niche') > popularityWeight(queDuMainstream, 'mainstream'))
})

test('la popularité inconnue est servie, mais rarement', () => {
  const poids = popularityWeight(EMPTY_HISTORY, 'unknown')
  assert.ok(poids > 0, 'jamais exclue : 9 032 vidéos sont dans ce cas')
  assert.ok(poids <= 1)
})

test('une grosse famille pèse à peine plus qu_un contenu unique', () => {
  assert.equal(familyWeight(1), 1)
  // 150 contenus presque identiques ne doivent pas être 150 fois plus probables.
  assert.ok(familyWeight(150) < 13, `obtenu ${familyWeight(150)}`)
  assert.ok(familyWeight(150) > familyWeight(10))
})

test('un contenu sans étiquettes reste tirable', () => {
  // Les images de stock n_ont ni sujet ni auteur : elles doivent quand même sortir.
  const sansRien = item({})
  const history = play(EMPTY_HISTORY, [sansRien, item({}), item({})])
  assert.equal(isAllowed(history, item({ universe: 'other' })), true)
})

test('la mémoire ne grandit pas indéfiniment', () => {
  let history = EMPTY_HISTORY
  for (let index = 0; index < 500; index += 1) {
    history = remember(history, item({ channelKey: `c${index}`, subjectId: `s${index}` }))
  }
  assert.equal(history.channelKeys.length, SPACING.channel)
  assert.equal(history.subjectIds.length, SPACING.subject)
  assert.ok(history.universes.length <= SPACING.universeRun)
})
