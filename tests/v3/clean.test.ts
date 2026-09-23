import test from 'node:test'
import assert from 'node:assert/strict'

import { isCleanTitle, isJunkTitle, isLatinTitle } from '@/lib/v3/cool/clean'

test('un titre propre : ni mots d_actualité, ni déchet', () => {
  assert.equal(isCleanTitle('Take That - Live from the Brits, 1995'), true)
  assert.equal(isCleanTitle('FILTRAN LLAMADAS sobre la TRÁGICA MUERTE del actor'), false, 'un fait divers')
  assert.equal(isCleanTitle('Pies Ella Beatty Feet HD'), false, 'du déchet fétichiste')
  assert.equal(isCleanTitle('Asmr ear licking tongue fluttering'), false)
  assert.equal(isCleanTitle('THE CARDS WERE HITTING LIKE CRAZY ON ULTIMATE TEXAS HOLD\'EM'), false, 'du jeu d_argent')
  assert.equal(isCleanTitle('Attack on Titan opening'), true, 'un mot d_un titre d_œuvre ne condamne pas')
  assert.equal(isCleanTitle('Pieds nickelés, le film'), true, 'pieds n_est pas feet')
  assert.equal(isCleanTitle(''), false)
  assert.equal(isJunkTitle('Bikini Bottom Day'), true)
})

test('un titre en lettres latines, ou pas', () => {
  assert.equal(isLatinTitle('Charli xcx - Always Everywhere (Official Video)'), true)
  assert.equal(isLatinTitle('【マインクラフト】日常組には最強の軍師がいます'), false)
  assert.equal(isLatinTitle('Реклама в СССР Часть 4'), false)
  assert.equal(isLatinTitle('Café crème & déjà-vu'), true)
})
