import test from 'node:test'
import assert from 'node:assert/strict'

import { CATCHER_CASH, CATCHER_LAST_LEVEL, CATCHER_MAX_LIVES, createCatcher, levelParams, nextLevel, positionOf, stepCatcher, walkable, type CatcherState } from '@/lib/games/catcher'
import { createEater, EATER_BONUSES, EATER_LAST_LEVEL, eaterParams, stepEater, turnEater, type EaterState } from '@/lib/games/eater'
import { crossDirection, FixedClock, keyDirection, seeded, swipeDirection } from '@/lib/games/engine'
import { addScore, cleanName, qualifies, topScores } from '@/lib/games/scores'

import { catcherRun } from './catcher-robot'

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
  const pad = { cx: 160, cy: 520, arm: 26, zone: { x: 0, y: 472, w: 320, h: 96 } }
  assert.equal(crossDirection(160, 490, pad), 'up'); assert.equal(crossDirection(160, 520, pad), null)
  assert.equal(crossDirection(20, 480, pad), 'left', 'loin à gauche, même en haut du bandeau : gauche'); assert.equal(crossDirection(300, 560, pad), 'right')
  assert.equal(crossDirection(170, 475, pad), 'up', 'au-dessus de la croix : haut'); assert.equal(crossDirection(150, 600, pad), 'down', 'sous le dessin, même hors du canvas : bas')
  assert.equal(crossDirection(160, 400, pad), null, 'sur le plateau : rien')
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
    s.bonusTimer = 1e9
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
  s.bonusTimer = 1e9
  s.body = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }, { x: 8, y: 11 }, { x: 9, y: 11 }, { x: 10, y: 11 }, { x: 11, y: 11 }]
  s.food = null
  turnEater(s, 'down')
  tick(s)
  assert.equal(s.phase, 'over', 'son propre corps')
  // a piece of furniture
  const f = createEater('landscape', 5, 4)
  f.bonusTimer = 1e9
  f.islands.forEach((e) => { e.solid = true }); f.solid = new Set(f.islands.flatMap((e) => e.island.flatMap((p) => Array.from({ length: p.w * p.h }, (_, k) => `${p.x + (k % p.w)},${p.y + Math.floor(k / p.w)}`))))
  f.body = [{ x: 18, y: 9 }, { x: 17, y: 9 }, { x: 16, y: 9 }]
  f.dir = 'right'; f.food = null
  tick(f)
  assert.equal(f.phase, 'over', 'une chaise de la table')
})

test('EATER : la longueur visée atteinte, LEVEL UP sans s_arrêter, plus vite, les meubles attendent qu_il y ait la place', () => {
  const s = createEater('landscape', 2, 13)
  s.bonusTimer = 1e9
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

// ---------------------------------------------------------------- sixteen levels, bonuses, WINNER

test('EATER : 16 niveaux, 6 cases par seconde au début, 12 au niveau 16 (la vitesse du vieux jeu) ; un niveau commencé plus loin, aussi long qu_en y arrivant', () => {
  const p1 = eaterParams(1), p16 = eaterParams(16)
  assert.ok(Math.abs(60 / p1.interval - 6) < 1e-9 && Math.abs(60 / p16.interval - 12) < 1e-9)
  for (let l = 2; l <= 16; l += 1) {
    assert.ok(eaterParams(l).interval < eaterParams(l - 1).interval, `niveau ${l} plus rapide`)
    assert.ok(eaterParams(l).target >= eaterParams(l - 1).target)
    // a piece for every burger of the levels before
    assert.equal(eaterParams(l).length, eaterParams(l - 1).length + eaterParams(l - 1).target, `niveau ${l} : sa longueur en y arrivant`)
  }
  assert.equal(EATER_LAST_LEVEL, 16)
  for (const layout of ['landscape', 'portrait'] as const) {
    const s = createEater(layout, 16, 3)
    assert.equal(s.body.length, eaterParams(16).length, `${layout} : la longueur du niveau 16 au départ`)
    for (let i = 1; i < s.body.length; i += 1) assert.equal(Math.abs(s.body[i].x - s.body[i - 1].x) + Math.abs(s.body[i].y - s.body[i - 1].y), 1, 'un corps d_un seul tenant')
  }
})

test('EATER : au LEVEL UP il garde toute sa longueur, comme dans le vieux jeu — il ne raccourcit jamais ; le niveau 16 fini, WINNER', () => {
  const s = createEater('landscape', 1, 5)
  s.bonusTimer = 1e9
  s.body = [{ x: 12, y: 5 }, { x: 11, y: 5 }, { x: 10, y: 5 }, { x: 9, y: 5 }, { x: 8, y: 5 }, { x: 7, y: 5 }, { x: 6, y: 5 }, { x: 5, y: 5 }]
  s.dir = 'right'; s.eaten = s.target - 1; s.food = { x: 13, y: 5 }
  tick(s)
  assert.equal(s.level, 2)
  const before = s.body.length
  s.food = null
  for (let i = 0; i < 10; i += 1) tick(s)
  // the last burger's piece grown on, nothing digested
  assert.equal(s.body.length, before + 1, 'il ne raccourcit pas')
  const w = createEater('landscape', 16, 5)
  w.bonusTimer = 1e9; w.eaten = w.target - 1; w.food = eaterAhead(w)
  tick(w)
  assert.equal(w.phase, 'won')
})

test('EATER : les bonus — frites, milkshake, donut, et le burger doré à partir du niveau 3 — rapportent leurs points', () => {
  const kinds = (level: number) => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 60; seed += 1) {
      const s = createEater('landscape', level, seed)
      s.bonusTimer = 1
      stepEater(s)
      if (s.bonus) seen.add(s.bonus.kind)
    }
    return seen
  }
  assert.ok(!kinds(1).has('gold'), 'pas d_or au niveau 1')
  assert.deepEqual([...kinds(5)].sort(), ['donut', 'fries', 'gold', 'shake'])
  const s = createEater('landscape', 3, 2)
  s.bonus = { ...eaterAhead(s), kind: 'gold', timer: 100, life: 240 }
  s.food = null
  const score = s.score
  tick(s)
  assert.equal(s.score - score, EATER_BONUSES.gold.points)
  assert.equal(s.bonus, null)
})

type C = { x: number; y: number }
const DIRS = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]] as const
const REV = { up: 'down', down: 'up', left: 'right', right: 'left' } as const
/** A player who knows the old game: to the burger only by a way after which its tail can still be reached, else after its own tail, else into the most room. */
function expertTurn(s: EaterState): void {
  const k = (x: number, y: number) => x * 64 + y
  const wall = new Set<number>()
  for (const c of s.solid) { const [x, y] = c.split(',').map(Number); wall.add(k(x, y)) }
  for (const e of s.islands) if (!e.solid) for (const f of e.island) for (let y = f.y; y < f.y + f.h; y += 1) for (let x = f.x; x < f.x + f.w; x += 1) wall.add(k(x, y))
  const open = (x: number, y: number) => x >= 1 && y >= 1 && x < s.cols - 1 && y < s.rows - 1 && !wall.has(k(x, y))
  // shortest ways from a cell over a body (all of it in the way but its tail, which moves on)
  const bfs = (from: C, body: C[], to: C | null, growing = 0) => {
    const busy = new Set((growing > 0 ? body : body.slice(0, -1)).map((c) => k(c.x, c.y)))
    const prev = new Map<number, number>([[k(from.x, from.y), -1]]), q: C[] = [from]
    while (q.length) {
      const c = q.shift()!
      if (to && c.x === to.x && c.y === to.y) { const path: C[] = []; let at = k(c.x, c.y); while (at !== k(from.x, from.y)) { path.unshift({ x: Math.floor(at / 64), y: at % 64 }); at = prev.get(at)! } return { path, seen: prev.size } }
      for (const [, dx, dy] of DIRS) { const nx = c.x + dx, ny = c.y + dy, nk = k(nx, ny); if (open(nx, ny) && !busy.has(nk) && !prev.has(nk)) { prev.set(nk, k(c.x, c.y)); q.push({ x: nx, y: ny }) } }
    }
    return { path: null as C[] | null, seen: prev.size }
  }
  const move = (body: C[], path: C[], grow: number) => { const next = [...[...path].reverse(), ...body]; return next.slice(0, body.length + grow) }
  const tailReach = (body: C[]) => body.length < 3 || bfs(body[0], body, body[body.length - 1]).path !== null
  const head = s.body[0], pending = s.grow
  const go = (d: typeof DIRS[number][0]) => { s.queue = d === s.dir ? [] : [d] }
  const dirTo = (c: C) => DIRS.find(([, dx, dy]) => head.x + dx === c.x && head.y + dy === c.y)![0]
  // to the burger, if the tail can be reached once there
  if (s.food) {
    const way = bfs(head, s.body, s.food, pending).path
    if (way && way.length && dirTo(way[0]) !== REV[s.dir]) {
      const after = move(s.body, way, Math.min(way.length, pending) + 1)
      if (tailReach(after)) { go(dirTo(way[0])); return }
    }
  }
  // else after its tail, the long way round
  let best: { d: typeof DIRS[number][0]; score: number } | null = null
  for (const [d, dx, dy] of DIRS) {
    if (d === REV[s.dir]) continue
    const c = { x: head.x + dx, y: head.y + dy }
    if (!open(c.x, c.y) || s.body.slice(0, pending > 0 ? s.body.length : -1).some((b) => b.x === c.x && b.y === c.y)) continue
    const after = move(s.body, [c], pending > 0 ? 1 : 0)
    const toTail = after.length >= 3 ? bfs(after[0], after, after[after.length - 1]).path : []
    const room = bfs(after[0], after, null).seen
    const score = (toTail ? 10000 + toTail.length : 0) + room
    if (!best || score > best.score) best = { d, score }
  }
  if (best) go(best.d)
}

test('EATER : un joueur qui connaît le vieux jeu va du niveau 1 à WINNER, en paysage et en portrait, sans jamais raccourcir — le niveau 16 est dur mais faisable', () => {
  let wins = 0, games = 0
  for (const layout of ['landscape', 'portrait'] as const) for (let seed = 1; seed <= 4; seed += 1) {
    const s = createEater(layout, 1, seed)
    games += 1
    for (let i = 0; i < 2000000 && s.phase === 'play'; i += 1) { if (s.tick <= 1) expertTurn(s); stepEater(s) }
    if (s.phase === 'won') wins += 1
    else assert.ok(s.level >= 12, `${layout} graine ${seed} : arrêté trop tôt, au niveau ${s.level}`)
  }
  assert.ok(wins >= games - 1, `${wins} victoires sur ${games}`)
})

test('CATCHER : 16 niveaux, un cinquième client à partir du 12, jamais aussi rapide que le burger, la liste toujours posée en entier', () => {
  assert.equal(CATCHER_LAST_LEVEL, 16)
  for (let l = 1; l <= 16; l += 1) {
    const p = levelParams(l)
    assert.ok(p.shopperSpeed <= p.burgerSpeed * 0.86, `niveau ${l} : clients trop rapides`)
    if (l > 1) assert.ok(p.need.reduce((a, b) => a + b, 0) >= levelParams(l - 1).need.reduce((a, b) => a + b, 0))
    assert.equal(p.shoppers, l >= 12 ? 5 : Math.min(4, 1 + Math.ceil(l / 2)))
    assert.ok(p.calm >= 4 * 60, `niveau ${l} : au moins quatre secondes de calme`)
    for (const layout of ['landscape', 'portrait'] as const) for (const seed of [1, 7, 13]) {
      const s = createCatcher(layout, l, seed)
      assert.equal(s.items.length, p.need.reduce((a, b) => a + b, 0), `${layout} niveau ${l} graine ${seed} : ingrédients manquants`)
    }
  }
  assert.equal(createCatcher('landscape', 12, 1).shoppers[4].role, 'pincer')
  assert.equal(createCatcher('landscape', 11, 1).shoppers.length, 4)
  // a life back for every level won, never more than five
  const s = createCatcher('landscape', 1, 1)
  s.lives = 2
  const n = nextLevel(s, 2)
  assert.equal(n.lives, 3)
  n.lives = CATCHER_MAX_LIVES
  assert.equal(nextLevel(n, 3).lives, CATCHER_MAX_LIVES)
})

test('CATCHER : l_argent tombe loin du burger et rapporte ; la liste du niveau 16 remplie, WINNER', () => {
  const s = createCatcher('landscape', 5, 3)
  s.shoppers.forEach((sh) => { sh.inside = false }); s.enterTimer = 1e9
  s.cashTimer = 1
  stepCatcher(s)
  assert.ok(s.cash, 'de l_argent')
  assert.ok(Math.abs(s.cash!.x - s.burger.x) + Math.abs(s.cash!.y - s.burger.y) >= 5, 'loin du burger')
  const b = s.burger
  const dir = (['right', 'left', 'up', 'down'] as const).find((d) => walkable(s.maze, b.x + (d === 'right' ? 1 : d === 'left' ? -1 : 0), b.y + (d === 'down' ? 1 : d === 'up' ? -1 : 0)))!
  s.cash = { x: b.x + (dir === 'right' ? 1 : dir === 'left' ? -1 : 0), y: b.y + (dir === 'down' ? 1 : dir === 'up' ? -1 : 0), kind: 'bundle', timer: 300, life: 300 }
  const score = s.score
  walk(s, dir)
  assert.equal(s.score - score, CATCHER_CASH.bundle.points)
  const w = createCatcher('landscape', 16, 2)
  w.shoppers.forEach((sh) => { sh.inside = false }); w.enterTimer = 1e9
  const wb = w.burger
  const wd = (['right', 'left', 'up', 'down'] as const).find((d) => walkable(w.maze, wb.x + (d === 'right' ? 1 : d === 'left' ? -1 : 0), wb.y + (d === 'down' ? 1 : d === 'up' ? -1 : 0)))!
  w.items = [{ x: wb.x + (wd === 'right' ? 1 : wd === 'left' ? -1 : 0), y: wb.y + (wd === 'down' ? 1 : wd === 'up' ? -1 : 0), kind: 0 }]
  walk(w, wd)
  assert.equal(w.phase, 'clear')
  steps(200, () => stepCatcher(w))
  assert.equal(w.phase, 'won')
})

test('CATCHER : un joueur prudent va souvent du niveau 1 à WINNER, et toujours loin — dur mais faisable', () => {
  const runs = [1, 2, 3, 4, 5, 6].map((seed) => catcherRun(seed, 'landscape'))
  assert.ok(runs.filter((r) => r.won).length >= 2, `trop peu de victoires : ${runs.map((r) => (r.won ? 'WIN' : r.level)).join(', ')}`)
  for (const r of runs) assert.ok(r.won || r.level >= 11, `une partie arrêtée au niveau ${r.level}`)
})

test('CATCHER : le magasin en hauteur joue exactement la même partie que le magasin en largeur, tournée', () => {
  const turn = { up: 'left', right: 'down', down: 'right', left: 'up' } as const
  const flip = (c: { x: number; y: number }) => `${c.y},${c.x}`
  for (const [level, seed] of [[3, 5], [12, 9]] as const) {
    const wide = createCatcher('landscape', level, seed), tall = createCatcher('portrait', level, seed)
    assert.deepEqual(tall.items.map(flip), wide.items.map((c) => `${c.x},${c.y}`), 'la liste posée aux mêmes places, tournées')
    const moves = ['right', 'up', 'left', 'down', 'up', 'right', 'down', 'left'] as const
    for (let i = 0; i < 60 * 60; i += 1) {
      const want = i % 45 === 0 ? moves[(i / 45) % moves.length] : null
      stepCatcher(wide, want); stepCatcher(tall, want ? turn[want] : null)
      const w = positionOf(wide.burger), t = positionOf(tall.burger)
      assert.ok(Math.abs(w.x - t.y) < 1e-9 && Math.abs(w.y - t.x) < 1e-9, `niveau ${level}, pas ${i} : le burger s_écarte`)
      wide.shoppers.forEach((sh, k) => { const a = positionOf(sh), b = positionOf(tall.shoppers[k]); assert.ok(Math.abs(a.x - b.y) < 1e-9 && Math.abs(a.y - b.x) < 1e-9, `niveau ${level}, pas ${i} : le client ${k} s_écarte`) })
      assert.equal(tall.score, wide.score); assert.equal(tall.lives, wide.lives); assert.equal(tall.phase, wide.phase)
      assert.equal(tall.sauce ? flip(tall.sauce) : null, wide.sauce ? `${wide.sauce.x},${wide.sauce.y}` : null, `niveau ${level}, pas ${i} : la sauce`)
      assert.equal(tall.cash ? flip(tall.cash) : null, wide.cash ? `${wide.cash.x},${wide.cash.y}` : null, `niveau ${level}, pas ${i} : l_argent`)
      if (wide.phase === 'over') break
    }
  }
})
