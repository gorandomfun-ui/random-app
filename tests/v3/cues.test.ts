import test from 'node:test'
import assert from 'node:assert/strict'

import { cueText, universeFromCues } from '@/lib/v3/tagging/cues'

test('les indices lisent l_univers dans le titre, mot entier, le plus précis d_abord', () => {
  assert.equal(universeFromCues('1000 Players Simulate UNDERGROUND Civilization in Minecraft'), 'gaming')
  assert.equal(universeFromCues('Tutorial: Watch Leeds chef Natalie Firth cook her tasty chicken shawarma recipe'), 'food')
  assert.equal(universeFromCues('Beyoncé - Love That Never Fails (Official Music Video)'), 'music')
  assert.equal(universeFromCues('Barry Brown — Showcase (1978) | Full Album | Roots'), 'music')
  assert.equal(universeFromCues('Wire Weaving Tutorial'), 'craft')
  assert.equal(universeFromCues('Lucky Charms Cereal 90s Commercial (1998)'), null, 'une pub sans indice reste sans univers')
  assert.equal(universeFromCues('Episode 3 gameplay walkthrough'), 'gaming', 'gameplay avant épisode')
  assert.equal(universeFromCues('Любит Не Любит 71 Серия (Русский Дубляж)'), null)
  assert.equal(universeFromCues('WRC Rally Finland 2019 crashes'), 'sport')
  assert.equal(universeFromCues('Political rally in Ohio'), null, '« rally » seul est ambigu')
  assert.equal(universeFromCues('Carson City walking tour at night'), 'travel')
  assert.equal(universeFromCues(''), null)
})

test('le titre seul : les mots-clés et les tags des fournisseurs ne comptent pas', () => {
  assert.equal(universeFromCues(cueText({ title: 'February Book Recap', keywords: ['book', 'recap'] })), null)
  assert.equal(universeFromCues(cueText({ title: 'Samsung VP-D371 Camcorder', tags: ['party', 'wedding'] })), null)
  assert.equal(cueText({ title: 'A', keywords: ['b', 3], tags: null }), 'A')
})

test('les mots à double sens ne classent pas', () => {
  assert.equal(universeFromCues('Labour Party conference 2024'), null)
  assert.equal(universeFromCues('Single mom shares her story'), null)
  assert.equal(universeFromCues('Samsung Galaxy S25 review'), null)
  assert.equal(universeFromCues('State of the art'), null)
  assert.equal(universeFromCues('Rally car onboard WRC Finland'), 'sport')
  assert.equal(universeFromCues('Birthday party at the lake'), 'events-parties')
})
