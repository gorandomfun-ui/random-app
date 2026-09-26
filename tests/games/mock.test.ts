import test from 'node:test'
import assert from 'node:assert/strict'

import { LOGO, LOGO_HEIGHT, LOGO_WIDTH } from '@/lib/games/logo'
import { catcherLogoSize, eaterLogoSize, secondNeon } from '@/lib/games/logos'
import { BLOCKING, cellsOf, MAZE, MAZE_HEIGHT, MAZE_TALL, MAZE_WIDTH, reachable } from '@/lib/games/maze'
import { drawText, FONT, FONT7, PixelBuffer, rotateSprite, scale2x, spriteSize, textWidth } from '@/lib/games/pixels'
import { boardSize, EATER_LEVELS, EATER_PATH, obstacleCells, playSize, renderAll, renderGameOver, renderPlay, renderTitle, SCENE_SIZE } from '@/lib/games/screens'
import * as sprites from '@/lib/games/sprites'
import { TEXT_COLORS } from '@/lib/theme'

test('les deux polices maison : 3×5 et 5×7, chaque glyphe à sa taille', () => {
  for (const char of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .-:!?/><') { assert.ok(FONT[char], `glyphe 3×5 ${char}`); assert.ok(FONT7[char], `glyphe 5×7 ${char}`) }
  for (const [char, glyph] of Object.entries(FONT)) { const { width, height } = spriteSize(glyph); assert.equal(height, 5, char); assert.equal(width, 3, char) }
  for (const [char, glyph] of Object.entries(FONT7)) { const { width, height } = spriteSize(glyph); assert.equal(height, 7, char); assert.equal(width, 5, char) }
  const buffer = new PixelBuffer(40, 8)
  assert.equal(drawText(buffer, 'RANDOM', 0, 0, '#ffffff'), textWidth('RANDOM'))
  assert.ok(buffer.countNot('#000000') > 30)
})

test('le logo pixel : 96 sur 22, rectangulaire, dessiné', () => {
  assert.equal(LOGO.length, LOGO_HEIGHT)
  for (const row of LOGO) assert.equal(row.length, LOGO_WIDTH)
  const on = LOGO.join('').split('').filter((c) => c === '#').length
  assert.ok(on > LOGO_WIDTH * LOGO_HEIGHT * 0.4 && on < LOGO_WIDTH * LOGO_HEIGHT * 0.95, 'ni vide ni un bloc plein')
})

test('les marques : CATCHER tient dans un écran en hauteur, le second néon d_EATER se distingue de l_accent', () => {
  assert.ok(catcherLogoSize(0.72).width <= SCENE_SIZE.portrait.width - 60, 'CATCHER tient en portrait')
  for (const name of ['meow', 'yesteryear'] as const) assert.ok(eaterLogoSize(name).width <= SCENE_SIZE.portrait.width, `le néon ${name} tient en portrait`)
  assert.ok(catcherLogoSize(1).width <= SCENE_SIZE.landscape.width - 200)
  for (const accent of TEXT_COLORS) assert.notEqual(secondNeon(accent).toLowerCase(), accent.toLowerCase())
})

test('chaque sprite est rectangulaire et tient dans une cellule de seize', () => {
  const all: Array<[string, readonly string[]]> = [
    ...sprites.BURGER.map((s, i): [string, readonly string[]] => [`burger ${i}`, s]), ['tomate', sprites.TOMATO], ['cornichon', sprites.PICKLE], ['oignon', sprites.ONION], ['sauce', sprites.SAUCE],
    ...sprites.HUMAN.map((s, i): [string, readonly string[]] => [`humain ${i}`, s]), ['mini burger', sprites.MINI_BURGER], ['fromage', sprites.CHEESE], ['milkshake', sprites.MILKSHAKE], ['tête', sprites.CRAWL_HEAD],
    ...sprites.CRAWL_ARMS.map((s, i): [string, readonly string[]] => [`bras ${i}`, s]),
    ...sprites.CRAWL_LEGS.map((s, i): [string, readonly string[]] => [`jambes ${i}`, s]),
  ]
  for (const [name, sprite] of all) {
    const { width, height } = spriteSize(sprite)
    assert.ok(width <= 16 && height <= 16, `${name} : ${width}×${height}`)
    for (const row of sprite) assert.equal(row.length, width, `${name} : rangée irrégulière`)
  }
})

test('le mangeur : des baskets et un jean aux jambes, des bras sur les épaules, des morceaux tous différents', () => {
  for (const legs of sprites.CRAWL_LEGS) { const all = legs.join(''); assert.ok(all.includes('t'), 'des baskets'); assert.ok(all.includes('g'), 'une semelle'); assert.ok(all.includes('j') && all.includes('J'), 'un jean') }
  for (const arms of sprites.CRAWL_ARMS) assert.ok(arms.join('').includes('S'), 'des mains')
  assert.deepEqual(rotateSprite(sprites.CRAWL_HEAD, 4), sprites.CRAWL_HEAD)
  const looks = [0, 1, 2, 3, 4, 5].map((i) => sprites.tubePiece('right', 'left', sprites.torsoLook(i)).sprite.join(''))
  assert.equal(new Set(looks).size, looks.length, 'six motifs différents')
  const colours = new Set([0, 1, 2, 3, 4, 5, 6].map((i) => sprites.torsoLook(i).cloth))
  assert.ok(colours.size >= 6, 'des couleurs différentes le long du corps')
})

test('le mangeur : droit ou dans un virage, chaque morceau touche ses deux voisins bord à bord', () => {
  const dirs: sprites.Direction[] = ['up', 'right', 'down', 'left']
  const band = Array.from({ length: sprites.TUBE_TO - sprites.TUBE_FROM + 1 }, (_, i) => sprites.TUBE_FROM + i)
  const edge = (sprite: readonly string[], dir: sprites.Direction): number[] => {
    const at = (i: number) => (dir === 'up' ? sprite[0][i] : dir === 'down' ? sprite[15][i] : dir === 'left' ? sprite[i][0] : sprite[i][15])
    return Array.from({ length: 16 }, (_, i) => i).filter((i) => at(i) !== '.')
  }
  for (const front of dirs) for (const back of dirs) {
    if (front === back) continue
    const { sprite } = sprites.tubePiece(front, back, sprites.torsoLook(1))
    assert.equal(sprite.length, 16)
    assert.deepEqual(edge(sprite, front), band, `${front}/${back} : bord avant`)
    assert.deepEqual(edge(sprite, back), band, `${front}/${back} : bord arrière`)
    if (sprites.OPPOSITE[front] !== back) {
      // a turn is a quarter ring: its inner corner stays empty
      const corner = [front, back].includes('up') ? 0 : 15
      const side = [front, back].includes('left') ? 0 : 15
      assert.equal(sprite[corner][side], '.', `${front}/${back} : coin intérieur vide`)
    }
  }
})

test('le magasin : 28 sur 20, clos, une entrée, un départ, tout le sol atteignable ; ni enclos au centre ni tunnel sur les côtés', () => {
  assert.equal(MAZE.length, MAZE_HEIGHT)
  for (const row of MAZE) assert.equal(row.length, MAZE_WIDTH)
  for (const row of MAZE) for (const c of row) assert.ok('#F=KTD.B'.includes(c), `caractère inconnu ${c}`)
  assert.equal(cellsOf('B').length, 1, 'un départ')
  assert.ok(cellsOf('D').length >= 2, 'une porte d_entrée')
  assert.equal(cellsOf('H').length, 0, 'pas d_enclos')
  // closed all round: the border is wall, fridges or the door
  MAZE.forEach((row, y) => { assert.ok(BLOCKING.has(row[0]) && BLOCKING.has(row[MAZE_WIDTH - 1]), `bord ${y}`) })
  for (const c of MAZE[0] + MAZE[MAZE_HEIGHT - 1]) assert.ok(BLOCKING.has(c))
  const [start] = cellsOf('B')
  const reach = reachable(start)
  const floor = [...cellsOf('.'), ...cellsOf('B')]
  for (const cell of floor) assert.ok(reach.has(`${cell.x},${cell.y}`), `sol hors d_atteinte en ${cell.x},${cell.y}`)
  // no dead end: every floor cell has at least two ways out, so a shopper can never corner the burger in a cul-de-sac
  for (const { x, y } of floor) {
    const ways = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !BLOCKING.has(MAZE[y + dy]?.[x + dx] ?? '#')).length
    assert.ok(ways >= 2, `impasse en ${x},${y}`)
  }
  assert.equal(MAZE_TALL.length, MAZE_WIDTH)
  for (let y = 0; y < MAZE_HEIGHT; y += 1) for (let x = 0; x < MAZE_WIDTH; x += 1) assert.equal(MAZE_TALL[x][y], MAZE[y][x])
})

test('les huit niveaux du diner : sol noir puis damier léger, du mobilier de plus en plus, qui n_enferme jamais le mangeur', () => {
  assert.equal(EATER_LEVELS.length, 8)
  assert.deepEqual(EATER_LEVELS.slice(0, 2).map((l) => l.furniture.length), [0, 0], 'rien aux niveaux 1 et 2')
  assert.ok(EATER_LEVELS.slice(0, 2).every((l) => l.floor === 'plain') && EATER_LEVELS.slice(2).every((l) => l.floor === 'checker'), 'le damier à partir du niveau 3')
  for (let i = 1; i < EATER_LEVELS.length; i += 1) assert.ok(EATER_LEVELS[i].furniture.length >= EATER_LEVELS[i - 1].furniture.length, `le niveau ${i + 1} a au moins autant de meubles`)
  for (const layout of ['landscape', 'portrait'] as const) for (let level = 1; level <= 8; level += 1) {
    const { cols, rows } = boardSize(layout)
    const blocked = obstacleCells(layout, level)
    for (const [x, y] of EATER_PATH) assert.ok(!blocked.has(layout === 'portrait' ? `${y},${x}` : `${x},${y}`), `niveau ${level} : un meuble sous le corps en ${x},${y}`)
    // the row the eater starts on stays clear
    for (let x = 2; x <= 8; x += 1) assert.ok(!blocked.has(layout === 'portrait' ? `10,${x}` : `${x},10`), `niveau ${level} : départ encombré`)
    for (const key of blocked) { const [x, y] = key.split(',').map(Number); assert.ok(x >= 1 && y >= 1 && x < cols - 1 && y < rows - 1, `niveau ${level} : meuble hors du sol en ${key}`) }
    const free: string[] = []
    for (let y = 1; y < rows - 1; y += 1) for (let x = 1; x < cols - 1; x += 1) if (!blocked.has(`${x},${y}`)) free.push(`${x},${y}`)
    const seen = new Set([free[0]])
    const queue = [free[0]]
    while (queue.length) {
      const [x, y] = queue.shift()!.split(',').map(Number)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const key = `${x + dx},${y + dy}`
        if (x + dx < 1 || y + dy < 1 || x + dx >= cols - 1 || y + dy >= rows - 1 || blocked.has(key) || seen.has(key)) continue
        seen.add(key); queue.push(key)
      }
    }
    assert.equal(seen.size, free.length, `${layout} niveau ${level} : du sol coupé du reste`)
  }
})

test('les personnages des titres sont ceux du jeu, deux fois plus fins', () => {
  for (const sprite of [...sprites.BURGER, sprites.CRAWL_HEAD, ...sprites.HUMAN]) {
    const big = scale2x(sprite)
    assert.equal(big.length, sprite.length * 2)
    // every pixel of the play sprite is still there, in its colour, at the heart of its four
    sprite.forEach((row, y) => { for (let x = 0; x < row.length; x += 1) { const four = [big[y * 2][x * 2], big[y * 2][x * 2 + 1], big[y * 2 + 1][x * 2], big[y * 2 + 1][x * 2 + 1]]; assert.ok(four.includes(row[x]), `${x},${y}`) } })
  }
})

test('les écrans de base : titre, jeu, GAME OVER, en paysage et en portrait, aux tailles annoncées', () => {
  const shots = renderAll('#0FC55D')
  assert.equal(shots.length, 18, 'CATCHER : titre, jeu, GAME OVER ; EATER : deux titres, trois niveaux, GAME OVER ; fois deux formats')
  for (const { game, layout, name, buffer } of shots) {
    const size = name.startsWith('jeu') ? playSize(layout) : SCENE_SIZE[layout]
    assert.equal(buffer.width, size.width, `${game} ${name} ${layout}`)
    assert.equal(buffer.height, size.height, `${game} ${name} ${layout}`)
    assert.ok(buffer.countNot('#000000') > buffer.width * buffer.height * 0.5, `${game} ${name} ${layout} : presque vide`)
  }
  assert.ok(playSize('landscape').width > playSize('landscape').height, 'paysage : plus large que haut')
  assert.ok(playSize('portrait').height > playSize('portrait').width, 'portrait : plus haut que large')
  assert.deepEqual(boardSize('portrait'), { cols: boardSize('landscape').rows, rows: boardSize('landscape').cols })
  for (const accent of TEXT_COLORS) for (const game of ['catcher', 'eater'] as const) {
    assert.ok(renderTitle(game, 'portrait', accent, { frame: 3 }).countNot('#000000') > 1000)
    assert.ok(renderPlay(game, 'landscape', accent, { frame: 1, level: 8, bonus: true }).countNot('#000000') > 1000)
    assert.ok(renderGameOver(game, 'landscape', accent).countNot('#000000') > 1000)
  }
})
