import test from 'node:test'
import assert from 'node:assert/strict'

import { LOGO, LOGO_HEIGHT, LOGO_WIDTH } from '@/lib/games/logo'
import { catcherLogoSize, secondNeon } from '@/lib/games/logos'
import { cellsOf, MAZE, MAZE_HEIGHT, MAZE_TALL, MAZE_WIDTH, reachable } from '@/lib/games/maze'
import { drawText, FONT, FONT7, PixelBuffer, rotateSprite, spriteSize, textWidth } from '@/lib/games/pixels'
import { boardSize, playSize, renderAll, renderGameOver, renderPlay, renderTitle, SCENE_SIZE } from '@/lib/games/screens'
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
  assert.ok(catcherLogoSize(4).width <= SCENE_SIZE.portrait.width - 16)
  for (const accent of TEXT_COLORS) assert.notEqual(secondNeon(accent).toLowerCase(), accent.toLowerCase())
})

test('chaque sprite est rectangulaire et tient dans une cellule de seize', () => {
  const all: Array<[string, readonly string[]]> = [
    ...sprites.BURGER.map((s, i): [string, readonly string[]] => [`burger ${i}`, s]), ['tomate', sprites.TOMATO], ['cornichon', sprites.PICKLE], ['oignon', sprites.ONION], ['sauce', sprites.SAUCE],
    ...sprites.HUMAN.map((s, i): [string, readonly string[]] => [`humain ${i}`, s]), ['mini burger', sprites.MINI_BURGER], ['graine', sprites.PELLET], ['tête', sprites.CRAWL_HEAD],
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

test('le labyrinthe : 28 sur 20, clos sauf le tunnel, un départ, un enclos, des pastilles toutes atteignables ; tourné, il reste jouable', () => {
  assert.equal(MAZE.length, MAZE_HEIGHT)
  for (const row of MAZE) assert.equal(row.length, MAZE_WIDTH)
  assert.equal(cellsOf('B').length, 1, 'un départ')
  assert.ok(cellsOf('H').length >= 4, 'de la place pour quatre humains')
  assert.equal(cellsOf('S').length, 4, 'quatre sauces')
  const [start] = cellsOf('B')
  const reach = reachable(start)
  for (const cell of cellsOf('.')) assert.ok(reach.has(`${cell.x},${cell.y}`), `pastille hors d_atteinte en ${cell.x},${cell.y}`)
  assert.ok(cellsOf('.').length > 150, `${cellsOf('.').length} pastilles`)
  MAZE.forEach((row, y) => { if (y !== 8 && y !== 10 && y !== 12) { assert.equal(row[0], '#', `bord gauche ${y}`); assert.equal(row[MAZE_WIDTH - 1], '#', `bord droit ${y}`) } })
  assert.equal(MAZE_TALL.length, MAZE_WIDTH)
  for (let y = 0; y < MAZE_HEIGHT; y += 1) for (let x = 0; x < MAZE_WIDTH; x += 1) assert.equal(MAZE_TALL[x][y], MAZE[y][x])
})

test('les écrans de base : titre, jeu, GAME OVER, en paysage et en portrait, aux tailles annoncées', () => {
  const shots = renderAll('#0FC55D')
  assert.equal(shots.length, 14, 'deux titres, trois jeux, deux GAME OVER, fois deux formats')
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
    assert.ok(renderPlay(game, 'landscape', accent, { frame: 1, floor: 'tiles' }).countNot('#000000') > 1000)
    assert.ok(renderGameOver(game, 'landscape', accent).countNot('#000000') > 1000)
  }
})
