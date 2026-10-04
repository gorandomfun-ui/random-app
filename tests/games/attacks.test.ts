/**
 * RANDOM ATTACKS' rules: the same seed and moves play the same game; the
 * squirt goes when fire is held, one in the air at a time; hits in a row
 * multiply the points and a lost squirt breaks the chain; foil takes two
 * hits; every level of the plan is well formed and every fourth has its
 * boss; the careful robot (it sees only what a player sees) wins the first
 * level every time, the last (the MEGA BURGER) most times, and whole games
 * now and then — so every level can be won, and the start is gentle.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { ATTACKS_BOARD, ATTACKS_LAST_LEVEL, ATTACKS_PLAN, burgerAt, createAttacks, levelPlan, multiplier, stepAttacks } from '@/lib/games/attacks-rules'
import { maxScore } from '@/lib/games/plausible'
import { robotGame, robotLevel, robotMove } from './attacks-robot'

/** Past the level's announcement, while the burgers hold still. */
const settle = (s: ReturnType<typeof createAttacks>) => { while (s.banner > 0) stepAttacks(s, 0, false) }

test('attacks: the same seed and moves, the same game', () => {
  const play = () => {
    const s = createAttacks('landscape', 3, 42)
    for (let i = 0; i < 3000 && s.phase === 'play'; i += 1) stepAttacks(s, i % 200 < 100 ? 1 : -1, i % 30 < 4)
    return JSON.stringify({ score: s.score, lives: s.lives, x: s.cook.x, left: s.burgers.filter((b) => b.alive).length, f: s.formation, steps: s.steps })
  }
  assert.equal(play(), play())
})

test('attacks: the squirt goes when fire is held, one in the air at a time', () => {
  const s = createAttacks('landscape', 1, 1)
  stepAttacks(s, 0, false)
  assert.equal(s.shots.length, 0)
  stepAttacks(s, 0, true)
  assert.equal(s.shots.length, 1)
  assert.ok(s.heard.includes('squirt'))
  for (let i = 0; i < 10; i += 1) stepAttacks(s, 0, true)
  assert.equal(s.shots.length, 1, 'still one in the air')
})

test('attacks: hits in a row multiply the points; a squirt lost breaks the chain', () => {
  assert.deepEqual([0, 5, 6, 13, 14, 23, 24, 60].map(multiplier), [1, 1, 2, 2, 3, 3, 4, 4])
  const s = createAttacks('landscape', 1, 1)
  settle(s)
  s.chain = 10
  // straight up through an empty column: lost
  s.burgers.forEach((b) => { b.alive = false })
  s.burgers[0].alive = true
  s.cook.x = s.width - 20
  stepAttacks(s, 0, true)
  for (let i = 0; i < 60 && s.shots.length; i += 1) stepAttacks(s, 0, false)
  assert.equal(s.chain, 0)
})

test('attacks: foil takes two hits', () => {
  const s = createAttacks('landscape', 5, 1)
  settle(s)
  const b = s.burgers.find((x) => x.foil > 0)!
  assert.ok(b, 'level 5 has foil')
  const at = () => burgerAt(s, b)
  const shootAt = () => { s.shots = [{ x: at().x, y: at().y + 6, torch: false }]; s.throws = []; stepAttacks(s, 0, false) }
  shootAt()
  assert.equal(b.alive, true)
  assert.equal(b.foil, 0)
  shootAt()
  assert.equal(b.alive, false)
})

test('attacks: every level of the plan is well formed, a boss every fourth', () => {
  assert.equal(ATTACKS_PLAN.length, ATTACKS_LAST_LEVEL)
  ATTACKS_PLAN.forEach((p, i) => {
    const level = i + 1
    if (level % 4 === 0) { assert.ok(p.boss, `level ${level} has a boss`); assert.equal(p.wide.length, 0); return }
    assert.equal(p.boss, null)
    assert.equal(p.wide.length, 5); assert.equal(p.tall.length, 5)
    p.wide.forEach((row) => assert.equal(row.length, ATTACKS_BOARD.landscape.cols, `level ${level} wide`))
    p.tall.forEach((row) => assert.equal(row.length, ATTACKS_BOARD.portrait.cols, `level ${level} tall`))
  })
  assert.equal(levelPlan(16).boss, 4)
})

test('attacks: divers come back to places that are on the board', () => {
  for (const layout of ['landscape', 'portrait'] as const) {
    const s = createAttacks(layout, 11, 3, { single: true, lives: 99 })
    for (let i = 0; i < 60 * 90 && s.phase === 'play'; i += 1) {
      const c = robotMove(s)
      stepAttacks(s, c.move, c.fire)
      for (const b of s.burgers) if (b.alive) { const x = burgerAt(s, b).x; assert.ok(x > 0 && x < s.width, `${layout}: a place at ${x}`) }
    }
  }
})

test('attacks: a boss beaten clears its level', () => {
  const s = createAttacks('portrait', 16, 2, { single: true })
  assert.ok(s.boss)
  s.boss!.hp = 1
  s.boss!.y = 104
  for (let i = 0; i < 400 && s.phase === 'play'; i += 1) { if (s.boss && s.boss.dying === 0 && s.shots.length === 0) s.shots = [{ x: s.boss.x, y: s.boss.y + 10, torch: false }]; stepAttacks(s, 0, false) }
  assert.equal(s.phase, 'won')
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
    assert.ok(won >= 2, `${layout}: ${won}/6`)
  }
})

test('attacks: a level\'s score stays within what the server finds plausible', () => {
  for (const level of [1, 8, 12, 16]) {
    const s = createAttacks('landscape', level, 5, { single: true })
    while (s.phase === 'play' && s.steps < 60 * 300) { const c = robotMove(s); stepAttacks(s, c.move, c.fire) }
    assert.ok(s.score <= maxScore('attacks', 1) + 50 * level, `level ${level}: ${s.score} > ${maxScore('attacks', 1) + 50 * level}`)
  }
})

test('attacks: a throw on the cook costs a life and a moment of blinking; a burger at his height ends the game', () => {
  const s = createAttacks('portrait', 1, 1)
  s.throws.push({ x: s.cook.x, y: s.height - 20, kind: 0, vy: 1, vx: 0, zig: 0, t: 0 })
  stepAttacks(s, 0)
  assert.equal(s.lives, 2)
  assert.ok(s.cook.hurt > 0)
  assert.equal(s.chain, 0)
  const t = createAttacks('portrait', 1, 1)
  settle(t)
  t.formation.y = t.height - 120
  stepAttacks(t, 0)
  assert.equal(t.phase, 'over')
})
