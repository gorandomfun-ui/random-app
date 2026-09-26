import test from 'node:test'
import assert from 'node:assert/strict'

import { createCatcher, levelParams, positionOf, stepCatcher, walkable, type CatcherState } from '@/lib/games/catcher'
import { createEater, stepEater, turnEater, type EaterState } from '@/lib/games/eater'
import { FixedClock, keyDirection, seeded, swipeDirection, dpadDirection } from '@/lib/games/engine'
import { addScore, cleanName, qualifies, topScores } from '@/lib/games/scores'

const steps = (n: number, fn: () => void) => { for (let i = 0; i < n; i += 1) fn() }

test('le moteur : la boucle à pas fixe donne le même nombre de pas quel que soit le découpage des images', () => {
  const count = (frames: number[]) => { const clock = new FixedClock(); let n = 0; for (const f of frames) clock.advance(f, () => { n += 1 }); return n }
  const total = 1000
  assert.equal(count(Array.from({ length: 60 }, () => total / 60)), count(Array.from({ length: 144 }, () => total / 144)))
  assert.equal(count([total]), 6, 'une image très lente ne rattrape pas plus de six pas')
  const a = seeded(42), b = seeded(42)
  assert.deepEqual([a(), a(), a()], [b(), b(), b()])
  assert.equal(keyDirection('ArrowLeft'), 'left'); assert.equal(keyDirection('z'), 'up'); assert.equal(keyDirection('d'), 'right'); assert.equal(keyDirection('x'), null)
  assert.equal(swipeDirection(40, 5), 'right'); assert.equal(swipeDirection(3, -2), null)
  assert.equal(dpadDirection(100, 70, 100, 100, 26), 'up'); assert.equal(dpadDirection(100, 100, 100, 100, 26), null)
})

/** Puts the burger somewhere and lets it walk one cell in `dir`. */
function walk(s: CatcherState, dir: 'up' | 'down' | 'left' | 'right'): void {
  s.burger.want = dir
  const before = { x: s.burger.x, y: s.burger.y }
  for (let i = 0; i < 60 && s.burger.x === before.x && s.burger.y === before.y && s.phase === 'play'; i += 1) stepCatcher(s)
}

test('CATCHER : la liste de courses posée au sol, le burger ramasse, la liste remplie gagne le niveau', () => {
  for (const layout of ['landscape', 'portrait'] as const) {
    const s = createCatcher(layout, 1, 7)
    const need = levelParams(1).need.reduce((a, b) => a + b, 0)
    assert.equal(s.items.length, need, `${layout} : tous les ingrédients sont posés`)
    for (const it of s.items) assert.ok(walkable(s.maze, it.x, it.y), 'sur le sol')
    // an ingredient right next to the burger, the others cleared
    const b = s.burger
    s.shoppers.forEach((sh) => { sh.inside = false }); s.enterTimer = 1e9
    const dir = (['right', 'left', 'up', 'down'] as const).find((d) => walkable(s.maze, b.x + (d === 'right' ? 1 : d === 'left' ? -1 : 0), b.y + (d === 'down' ? 1 : d === 'up' ? -1 : 0)))!
    const nx = b.x + (dir === 'right' ? 1 : dir === 'left' ? -1 : 0), ny = b.y + (dir === 'down' ? 1 : dir === 'up' ? -1 : 0)
    s.items = [{ x: nx, y: ny, kind: 2 }]
    walk(s, dir)
    assert.equal(s.have[2], 1, 'un oignon dans le sac')
    assert.equal(s.phase, 'clear', 'plus rien à ramasser : niveau gagné')
    assert.ok(s.score >= 10 + 50)
  }
})

test('CATCHER : touché par un client, une vie en moins, retour au départ ; trois fois, fin de partie', () => {
  const s = createCatcher('landscape', 1, 3)
  for (let lost = 1; lost <= 3; lost += 1) {
    const sh = s.shoppers[0]
    Object.assign(sh, { x: s.burger.x, y: s.burger.y, inside: true, progress: 0, dir: null, stunned: 0 })
    stepCatcher(s)
    assert.equal(s.lives, 3 - lost)
    assert.equal(s.phase, 'caught')
    steps(120, () => stepCatcher(s))
    if (lost < 3) { assert.equal(s.phase, 'play'); assert.deepEqual({ x: s.burger.x, y: s.burger.y }, s.burger.start) }
  }
  assert.equal(s.phase, 'over')
})

test('CATCHER : la sauce répandue fait glisser un client, qui reste étourdi et ne touche plus', () => {
  const s = createCatcher('landscape', 1, 5)
  const sh = s.shoppers[0]
  // a shopper about to step on a puddle
  const from = { x: 13, y: 9 }, to = { x: 14, y: 9 }
  assert.ok(walkable(s.maze, from.x, from.y) && walkable(s.maze, to.x, to.y))
  Object.assign(sh, { ...from, inside: true, dir: 'right', progress: 0.99, stunned: 0 })
  s.puddles.set(`${to.x},${to.y}`, 300)
  s.shoppers.slice(1).forEach((o) => { o.inside = false }); s.enterTimer = 1e9
  s.rush = true; s.modeTimer = 1e9
  stepCatcher(s)
  assert.ok(sh.stunned > 0, 'étourdi')
  assert.ok(!s.puddles.has(`${to.x},${to.y}`), 'la flaque est partie avec lui')
  // stunned, the burger passes through
  Object.assign(s.burger, { x: sh.x, y: sh.y, dir: null, progress: 0 })
  const lives = s.lives
  stepCatcher(s)
  assert.equal(s.lives, lives)
})

test('CATCHER : les clients restent dans les rayons et finissent par venir chercher le burger', () => {
  const s = createCatcher('landscape', 3, 11)
  let reached = false
  for (let i = 0; i < 60 * 90 && !reached; i += 1) {
    stepCatcher(s)
    for (const sh of s.shoppers) if (sh.inside) assert.ok(walkable(s.maze, sh.x, sh.y), 'jamais dans un rayon')
    if (s.phase === 'caught') reached = true
  }
  assert.ok(reached, 'un burger immobile finit attrapé')
  const p = positionOf(s.burger)
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y))
})

function eaterAhead(s: EaterState) {
  const h = s.body[0]
  return s.dir === 'right' ? { x: h.x + 1, y: h.y } : s.dir === 'left' ? { x: h.x - 1, y: h.y } : s.dir === 'down' ? { x: h.x, y: h.y + 1 } : { x: h.x, y: h.y - 1 }
}
const tick = (s: EaterState) => { const before = s.moves; for (let i = 0; i < 60 && s.moves === before && s.phase === 'play'; i += 1) stepEater(s) }

test('EATER : il avance, mange, grandit d_un morceau ; le mur, un meuble ou son propre corps l_arrêtent', () => {
  for (const layout of ['landscape', 'portrait'] as const) {
    const s = createEater(layout, 1, 9)
    assert.equal(s.body.length, 3, 'tête, épaules, jambes')
    s.shakeTimer = 1e9
    s.food = eaterAhead(s)
    tick(s)
    assert.equal(s.eaten, 1)
    tick(s)
    assert.equal(s.body.length, 4, 'un morceau de plus')
    // straight into the wall
    for (let i = 0; i < 40 && s.phase === 'play'; i += 1) { s.food = null; tick(s) }
    assert.equal(s.phase, 'over', `${layout} : le mur`)
  }
  // his own body: a long eater turning round on himself
  const s = createEater('landscape', 1, 2)
  s.shakeTimer = 1e9
  s.body = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }, { x: 8, y: 11 }, { x: 9, y: 11 }, { x: 10, y: 11 }, { x: 11, y: 11 }]
  s.food = null
  turnEater(s, 'down')
  tick(s)
  assert.equal(s.phase, 'over', 'son propre corps')
  // a piece of furniture
  const f = createEater('landscape', 5, 4)
  f.shakeTimer = 1e9
  f.islands.forEach((e) => { e.solid = true }); f.solid = new Set(f.islands.flatMap((e) => e.island.flatMap((p) => Array.from({ length: p.w * p.h }, (_, k) => `${p.x + (k % p.w)},${p.y + Math.floor(k / p.w)}`))))
  f.body = [{ x: 18, y: 9 }, { x: 17, y: 9 }, { x: 16, y: 9 }]
  f.dir = 'right'; f.food = null
  tick(f)
  assert.equal(f.phase, 'over', 'une chaise de la table')
})

test('EATER : la longueur visée atteinte, LEVEL UP sans s_arrêter, plus vite, les meubles attendent qu_il y ait la place', () => {
  const s = createEater('landscape', 2, 13)
  s.shakeTimer = 1e9
  const interval = s.interval
  s.eaten = s.target - 1
  s.food = eaterAhead(s)
  tick(s)
  assert.equal(s.level, 3); assert.equal(s.passed, 1); assert.equal(s.phase, 'play')
  assert.ok(s.levelUp > 0, 'LEVEL UP à l_écran')
  assert.ok(s.interval < interval, 'plus vite')
  assert.ok(s.islands.length > 0, 'des chaises arrivent')
  // an island under the body stays faint until the body has gone
  const s2 = createEater('landscape', 3, 1)
  const first = s2.islands[0]
  const cell = { x: first.island[0].x, y: first.island[0].y }
  s2.islands.forEach((e) => { e.solid = false }); s2.solid = new Set()
  s2.body = [{ x: cell.x + 1, y: cell.y + 5 }, { x: cell.x, y: cell.y + 5 }, cell]
  stepEater(s2)
  assert.equal(s2.islands[0].solid, false, 'sous le corps : pas encore là')
})

test('EATER : un burger n_apparaît jamais contre un meuble ni sur le corps', () => {
  for (let seed = 1; seed <= 25; seed += 1) {
    const s = createEater(seed % 2 ? 'landscape' : 'portrait', 8, seed)
    const furniture = new Set(s.islands.flatMap((e) => e.island.flatMap((p) => Array.from({ length: p.w * p.h }, (_, k) => `${p.x + (k % p.w)},${p.y + Math.floor(k / p.w)}`))))
    const f = s.food!
    assert.ok(f, 'un burger')
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) assert.ok(!furniture.has(`${f.x + dx},${f.y + dy}`), 'contre un meuble')
    assert.ok(!s.body.some((c) => c.x === f.x && c.y === f.y))
  }
})

test('les meilleurs scores de l_appareil : dix, du meilleur au moins bon, un nom propre ; sans stockage, rien ne casse', () => {
  const store = new Map<string, string>()
  ;(globalThis as { window?: unknown }).window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } } }
  for (let i = 1; i <= 12; i += 1) addScore('catcher', { name: `joueur ${i}`, score: i * 10, level: 1 })
  const top = topScores('catcher')
  assert.equal(top.length, 10)
  assert.equal(top[0].score, 120)
  assert.equal(top[9].score, 30)
  assert.ok(!qualifies('catcher', 20) && qualifies('catcher', 35))
  assert.equal(cleanName('  <b>yann</b> the great!! '), 'BYANNB THE')
  ;(globalThis as { window?: unknown }).window = { get localStorage(): Storage { throw new Error('private') } }
  assert.deepEqual(topScores('eater'), [])
  assert.equal(addScore('eater', { name: 'x', score: 5, level: 1 }), 0)
  delete (globalThis as { window?: unknown }).window
})
