import test from 'node:test'
import assert from 'node:assert/strict'

import { CATCHER_CASH, CATCHER_LAST_LEVEL, createCatcher, levelParams, positionOf, stepCatcher, walkable, type CatcherState } from '@/lib/games/catcher'
import { createEater, EATER_BONUSES, EATER_LAST_LEVEL, eaterParams, stepEater, turnEater, type EaterState } from '@/lib/games/eater'
import { crossDirection, FixedClock, keyDirection, seeded, swipeDirection } from '@/lib/games/engine'
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
  const pad = { cx: 160, cy: 520, arm: 26, top: 472 }
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

test('EATER : 16 niveaux, 3,5 cases par seconde au début, 8 au niveau 16, plus long à chaque niveau', () => {
  const p1 = eaterParams(1), p16 = eaterParams(16)
  assert.ok(Math.abs(60 / p1.interval - 3.5) < 1e-9 && Math.abs(60 / p16.interval - 8) < 1e-9)
  for (let l = 2; l <= 16; l += 1) {
    assert.ok(eaterParams(l).interval < eaterParams(l - 1).interval, `niveau ${l} plus rapide`)
    assert.ok(eaterParams(l).length > eaterParams(l - 1).length && eaterParams(l).target >= eaterParams(l - 1).target)
  }
  assert.equal(EATER_LAST_LEVEL, 16)
  for (const layout of ['landscape', 'portrait'] as const) {
    const s = createEater(layout, 16, 3)
    assert.equal(s.body.length, eaterParams(16).length, `${layout} : la longueur du niveau 16 au départ`)
    for (let i = 1; i < s.body.length; i += 1) assert.equal(Math.abs(s.body[i].x - s.body[i - 1].x) + Math.abs(s.body[i].y - s.body[i - 1].y), 1, 'un corps d_un seul tenant')
  }
})

test('EATER : au LEVEL UP il digère jusqu_à la longueur du niveau suivant, on le voit raccourcir ; le niveau 16 fini, WINNER', () => {
  const s = createEater('landscape', 1, 5)
  s.bonusTimer = 1e9
  s.body = [{ x: 12, y: 5 }, { x: 11, y: 5 }, { x: 10, y: 5 }, { x: 9, y: 5 }, { x: 8, y: 5 }, { x: 7, y: 5 }, { x: 6, y: 5 }, { x: 5, y: 5 }]
  s.dir = 'right'; s.eaten = s.target - 1; s.food = { x: 13, y: 5 }
  tick(s)
  assert.equal(s.level, 2)
  assert.equal(s.shrink, s.body.length - eaterParams(2).length, 'il reste à digérer')
  const before = s.body.length
  s.food = null
  tick(s)
  assert.equal(s.body.length, before - 1, 'un morceau de moins à chaque pas')
  for (let i = 0; i < 10; i += 1) tick(s)
  assert.equal(s.body.length, eaterParams(2).length)
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

/** A careful player: never into a wall, furniture or itself, never into a pocket smaller than its body, the shortest way to the burger otherwise. */
function robotTurn(s: EaterState): void {
  const key = (x: number, y: number) => `${x},${y}`
  const blocked = new Set<string>(s.solid)
  for (const e of s.islands) if (!e.solid) for (const f of e.island) for (let y = f.y; y < f.y + f.h; y += 1) for (let x = f.x; x < f.x + f.w; x += 1) blocked.add(key(x, y))
  for (const c of s.body.slice(0, -1)) blocked.add(key(c.x, c.y))
  const free = (x: number, y: number) => x >= 1 && y >= 1 && x < s.cols - 1 && y < s.rows - 1 && !blocked.has(key(x, y))
  const flood = (x: number, y: number, target: { x: number; y: number } | null) => {
    const seen = new Map<string, number>([[key(x, y), 0]]), queue: Array<[number, number]> = [[x, y]]
    let found = Infinity
    while (queue.length) {
      const [cx, cy] = queue.shift()!
      const d = seen.get(key(cx, cy))!
      if (target && cx === target.x && cy === target.y && found === Infinity) found = d
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (free(nx, ny) && !seen.has(key(nx, ny))) { seen.set(key(nx, ny), d + 1); queue.push([nx, ny]) } }
    }
    return { area: seen.size, food: found }
  }
  const head = s.body[0]
  const options = (['up', 'down', 'left', 'right'] as const).filter((d) => d !== ({ up: 'down', down: 'up', left: 'right', right: 'left' } as const)[s.dir]).map((d) => {
    const [dx, dy] = d === 'up' ? [0, -1] : d === 'down' ? [0, 1] : d === 'left' ? [-1, 0] : [1, 0]
    const nx = head.x + dx, ny = head.y + dy
    if (!free(nx, ny)) return null
    blocked.add(key(nx, ny))
    const { area, food } = flood(nx, ny, s.food)
    blocked.delete(key(nx, ny))
    return { d, area, food }
  }).filter((o): o is { d: 'up' | 'down' | 'left' | 'right'; area: number; food: number } => o !== null)
  if (!options.length) return
  const need = s.body.length + 2
  const safe = options.filter((o) => o.area >= need)
  const pick = safe.length ? safe.sort((a, b) => a.food - b.food || b.area - a.area)[0] : options.sort((a, b) => b.area - a.area)[0]
  s.queue = pick.d === s.dir ? [] : [pick.d]
}

test('EATER : un joueur prudent va du niveau 1 à WINNER, en paysage et en portrait — le niveau 16 est dur mais faisable', () => {
  let wins = 0, games = 0
  for (const layout of ['landscape', 'portrait'] as const) for (let seed = 1; seed <= 4; seed += 1) {
    const s = createEater(layout, 1, seed)
    games += 1
    for (let i = 0; i < 400000 && s.phase === 'play'; i += 1) { if (s.tick <= 1) robotTurn(s); stepEater(s) }
    if (s.phase === 'won') wins += 1
    else assert.ok(s.level >= 12, `${layout} graine ${seed} : arrêté trop tôt, au niveau ${s.level}`)
  }
  assert.ok(wins >= games - 1, `${wins} victoires sur ${games}`)
})

test('CATCHER : 16 niveaux, un cinquième client à partir du 9, jamais aussi rapide que le burger, la liste toujours posée en entier', () => {
  assert.equal(CATCHER_LAST_LEVEL, 16)
  for (let l = 1; l <= 16; l += 1) {
    const p = levelParams(l)
    assert.ok(p.shopperSpeed <= p.burgerSpeed * 0.86, `niveau ${l} : clients trop rapides`)
    if (l > 1) assert.ok(p.need.reduce((a, b) => a + b, 0) >= levelParams(l - 1).need.reduce((a, b) => a + b, 0))
    assert.equal(p.shoppers, l >= 9 ? 5 : Math.min(4, 1 + Math.ceil(l / 2)))
    for (const layout of ['landscape', 'portrait'] as const) for (const seed of [1, 7, 13]) {
      const s = createCatcher(layout, l, seed)
      assert.equal(s.items.length, p.need.reduce((a, b) => a + b, 0), `${layout} niveau ${l} graine ${seed} : ingrédients manquants`)
    }
  }
  assert.equal(createCatcher('landscape', 9, 1).shoppers[4].role, 'pincer')
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
