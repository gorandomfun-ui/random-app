import test from 'node:test'
import assert from 'node:assert/strict'

import { LOGO, LOGO_HEIGHT, LOGO_WIDTH } from '@/lib/games/logo'
import { cellsOf, MAZE, MAZE_HEIGHT, MAZE_WIDTH, reachable } from '@/lib/games/maze'
import { drawText, FONT, PixelBuffer, rotateSprite, spriteSize, textWidth } from '@/lib/games/pixels'
import { canvasSize, renderAll, renderEnd, renderPlay, renderTitle } from '@/lib/games/screens'
import * as sprites from '@/lib/games/sprites'

test('la police maison couvre lettres, chiffres et signes, chaque glyphe sur 3×5', () => {
  for (const char of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .-:!?/><') assert.ok(FONT[char], `glyphe ${char}`)
  for (const [char, glyph] of Object.entries(FONT)) { const { width, height } = spriteSize(glyph); assert.equal(height, 5, char); assert.equal(width, 3, char) }
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

test('chaque sprite est rectangulaire et ne sort pas d_une cellule de seize', () => {
  const all: Array<[string, readonly string[]]> = [
    ...sprites.BURGER.map((s, i): [string, readonly string[]] => [`burger ${i}`, s]), ['tomate', sprites.TOMATO], ['cornichon', sprites.PICKLE], ['oignon', sprites.ONION], ['sauce', sprites.SAUCE],
    ...sprites.HUMAN.map((s, i): [string, readonly string[]] => [`humain ${i}`, s]), ['humain effrayé', sprites.HUMAN_SCARED], ['mini burger', sprites.MINI_BURGER], ['tête', sprites.CRAWL_HEAD],
    ...sprites.CRAWL_SHOULDERS.map((s, i): [string, readonly string[]] => [`épaules ${i}`, s]),
    ...sprites.CRAWL_LEGS.map((s, i): [string, readonly string[]] => [`jambes ${i}`, s]),
    ...Object.entries(sprites.TORSO_PIECES).map(([k, s]): [string, readonly string[]] => [`torse ${k}`, s]),
  ]
  for (const [name, sprite] of all) {
    const { width, height } = spriteSize(sprite)
    assert.ok(width <= 16 && height <= 16, `${name} : ${width}×${height}`)
    for (const row of sprite) assert.equal(row.length, width, `${name} : rangée irrégulière`)
  }
})

test('le mangeur : les morceaux de torse se distinguent tous, les chaussures existent, une pièce tournée quatre fois revient', () => {
  const looks = sprites.TORSO_PATTERNS.map((p) => sprites.TORSO_PIECES[p].join(''))
  assert.equal(new Set(looks).size, looks.length, 'six motifs différents')
  for (const legs of sprites.CRAWL_LEGS) { assert.ok(legs.join('').includes('s'), 'des baskets'); assert.ok(legs.join('').includes('S'), 'une semelle'); assert.ok(legs.join('').includes('j'), 'un jean') }
  assert.ok(sprites.CRAWL_SHOULDERS.every((s) => s.join('').includes('p')), 'les bras sur les épaules')
  assert.deepEqual(rotateSprite(sprites.CRAWL_HEAD, 4), sprites.CRAWL_HEAD)
  assert.deepEqual(rotateSprite(rotateSprite(sprites.CRAWL_HEAD, 1), 3), sprites.CRAWL_HEAD)
  const up = sprites.facing(sprites.CRAWL_HEAD, 'up')
  assert.equal(up.length, 16)
  assert.notDeepEqual(up, sprites.CRAWL_HEAD)
  const colours = new Set([0, 1, 2, 3, 4, 5, 6].map((i) => sprites.torsoLook(i, '#0FC55D').palette.c))
  assert.ok(colours.size >= 5, 'des couleurs différentes le long du corps')
})

test('le labyrinthe : 28 sur 20, clos sauf le tunnel, un départ, un enclos, des pastilles toutes atteignables', () => {
  assert.equal(MAZE.length, MAZE_HEIGHT)
  for (const row of MAZE) assert.equal(row.length, MAZE_WIDTH)
  assert.equal(cellsOf('B').length, 1, 'un départ')
  assert.ok(cellsOf('H').length >= 4, 'de la place pour quatre humains')
  assert.equal(cellsOf('S').length, 4, 'quatre sauces')
  const [start] = cellsOf('B')
  const reach = reachable(start)
  for (const cell of cellsOf('.')) assert.ok(reach.has(`${cell.x},${cell.y}`), `pastille hors d_atteinte en ${cell.x},${cell.y}`)
  assert.ok(cellsOf('.').length > 150, `${cellsOf('.').length} pastilles`)
  // the outer wall holds everywhere but the tunnel row
  MAZE.forEach((row, y) => { if (y !== 8 && y !== 10 && y !== 12) { assert.equal(row[0], '#', `bord gauche ${y}`); assert.equal(row[MAZE_WIDTH - 1], '#', `bord droit ${y}`) } })
})

test('les écrans se dessinent, dans les tailles annoncées, sans rien lever', () => {
  for (const game of ['catcher', 'eater'] as const) {
    const size = canvasSize(game)
    for (const { name, buffer } of renderAll(game, '#0FC55D')) {
      assert.equal(buffer.width, size.width, `${game} ${name}`)
      assert.equal(buffer.height, size.height, `${game} ${name}`)
      assert.ok(buffer.countNot('#000000') > 500, `${game} ${name} : presque vide`)
    }
    assert.ok(renderTitle(game, '#D90845', { frame: 1 }).countNot('#000000') > 500)
    assert.ok(renderPlay(game, '#3D42CC', { frame: 1 }).countNot('#000000') > 500)
    assert.ok(renderEnd(game, '#AF3BF2', 'lost').countNot('#000000') > 500)
  }
})
