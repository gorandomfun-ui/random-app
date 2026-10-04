/**
 * RANDOM ATTACKS' rules: the same seed and moves play the same game; the
 * careful robot (it sees only what a player sees) wins the first level every
 * time, the last level most times, and a whole game now and then — so every
 * level can be won, and the start is gentle.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { ATTACKS_LAST_LEVEL, createAttacks, stepAttacks } from '@/lib/games/attacks-rules'
import { maxScore } from '@/lib/games/plausible'
import { robotGame, robotLevel, robotMove } from './attacks-robot'

test('attacks: the same seed and moves, the same game', () => {
  const play = () => {
    const s = createAttacks('landscape', 3, 42)
    for (let i = 0; i < 3000 && s.phase === 'play'; i += 1) stepAttacks(s, i % 200 < 100 ? 1 : -1)
    return JSON.stringify({ score: s.score, lives: s.lives, x: s.cook.x, left: s.burgers.filter((b) => b.alive).length, f: s.formation, steps: s.steps })
  }
  assert.equal(play(), play())
})

test('attacks: the first level, won every time, wide and tall', () => {
  for (const layout of ['landscape', 'portrait'] as const) for (let seed = 1; seed <= 6; seed += 1) assert.ok(robotLevel(layout, 1, seed).won, `${layout} seed ${seed}`)
})

test('attacks: the last level, won most times', () => {
  for (const layout of ['landscape', 'portrait'] as const) {
    let won = 0
    for (let seed = 1; seed <= 8; seed += 1) if (robotLevel(layout, ATTACKS_LAST_LEVEL, seed).won) won += 1
    assert.ok(won >= 5, `${layout}: ${won}/8`)
  }
})

test('attacks: a whole game, won now and then', () => {
  for (const layout of ['landscape', 'portrait'] as const) {
    let won = 0
    for (let seed = 1; seed <= 6; seed += 1) if (robotGame(layout, seed).won) won += 1
    assert.ok(won >= 1, `${layout}: ${won}/6`)
  }
})

test('attacks: a level\'s score stays within what the server finds plausible', () => {
  for (const level of [1, 8, 16]) {
    const s = createAttacks('landscape', level, 5, { single: true })
    while (s.phase === 'play' && s.steps < 60 * 300) stepAttacks(s, robotMove(s))
    assert.ok(s.score <= maxScore('attacks', 1) + 50 * level, `level ${level}: ${s.score} > ${maxScore('attacks', 1) + 50 * level}`)
  }
})

test('attacks: a throw on the cook costs a life and a moment of blinking; a burger at his height ends the game', () => {
  const s = createAttacks('portrait', 1, 1)
  s.throws.push({ x: s.cook.x, y: s.height - 20, kind: 0, vy: 1 })
  stepAttacks(s, 0)
  assert.equal(s.lives, 2)
  assert.ok(s.cook.hurt > 0)
  const t = createAttacks('portrait', 1, 1)
  t.formation.y = t.height - 120
  stepAttacks(t, 0)
  assert.equal(t.phase, 'over')
})
