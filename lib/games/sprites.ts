/**
 * Every sprite of the two games, drawn here as rows of characters: nothing
 * copied, nothing loaded. A character maps to a colour through a palette;
 * '.' is transparent. Eight pixels a cell.
 */

import type { Palette, Sprite } from './pixels'

export const CELL = 8

/** The shared colours; the accent (`a`) comes from the site's theme at draw time. */
export const BASE_PALETTE: Palette = {
  k: '#121210', // deep black
  w: '#f8f5e6', // cream
  d: '#3a3a36', // dark grey
  g: '#8a8a82', // grey
}

// ---------------------------------------------------------------- RANDOM CATCHER

/** The burger, mouth closed and mouth open. Bun `o`/`y`, lettuce `l`, tomato `r`, patty `n`. */
export const BURGER: Sprite[] = [
  [
    '..oooo..',
    '.oyoyoo.',
    'oooooooo',
    '.llllll.',
    '.rrrrrr.',
    '.nnnnnn.',
    '.oooooo.',
    '..oooo..',
  ],
  [
    '..oooo..',
    '.oyoyoo.',
    'oooooooo',
    '.llll...',
    '.rrr....',
    '.nnnn...',
    '.oooooo.',
    '..oooo..',
  ],
]
export const BURGER_PALETTE: Palette = { o: '#e39a3b', y: '#f8f5e6', l: '#5fbf4a', r: '#d92d2d', n: '#5a3319' }

export const TOMATO: Sprite = ['.rrr.', 'rrprr', 'rpppr', 'rrprr', '.rrr.']
export const PICKLE: Sprite = ['.ggg.', 'gGgGg', 'ggGgg', 'gGgGg', '.ggg.']
export const ONION: Sprite = ['.www.', 'w...w', 'w...w', 'w...w', '.www.']
export const ITEM_PALETTE: Palette = { r: '#d92d2d', p: '#f28c8c', g: '#4f9e3d', G: '#2f6b24', w: '#f8f5e6' }

/** The hot sauce: a red bottle, a cream label, a dark cap. */
export const SAUCE: Sprite = ['..kk.', '..kk.', '.rrr.', '.rwr.', '.rwr.', '.rrr.', '.rrr.']
export const SAUCE_PALETTE: Palette = { k: '#121210', r: '#e0301e', w: '#f8f5e6' }

/**
 * The little humans who chase the burger: skin `p`, hair and shirt in the
 * human's own colour `c`, legs `k`. Two frames, the legs swap.
 */
export const HUMAN: Sprite[] = [
  [
    '..cccc..',
    '.cpppppc',
    '.cpkpkp.',
    '..pppp..',
    '.cccccc.',
    'c.cccc.c',
    '..k..k..',
    '.kk..kk.',
  ],
  [
    '..cccc..',
    '.cpppppc',
    '.cpkpkp.',
    '..pppp..',
    '.cccccc.',
    'c.cccc.c',
    '..k..k..',
    '..k..kk.',
  ],
]
/** A frightened human, while the sauce burns: blue, wide eyes. */
export const HUMAN_SCARED: Sprite = [
  '..bbbb..',
  '.bwwwwwb',
  '.bwkwkw.',
  '..wwww..',
  '.bbbbbb.',
  'b.bbbb.b',
  '..k..k..',
  '.kk..kk.',
]
export const HUMAN_COLORS = ['#3d42cc', '#d90845', '#0fc55d', '#af3bf2']
export const humanPalette = (color: string): Palette => ({ c: color, p: '#f2c9a0', k: '#121210', b: '#3d42cc', w: '#f8f5e6' })

/** The maze walls: a cell of wall, drawn as a block with a lighter top edge. */
export const WALL: Sprite = ['aaaaaaaa', 'aAAAAAAa', 'aAAAAAAa', 'aAAAAAAa', 'aAAAAAAa', 'aAAAAAAa', 'aAAAAAAa', 'aaaaaaaa']
export const wallPalette = (accent: string): Palette => ({ a: accent, A: '#121210' })
export const PELLET: Sprite = ['.', 'w', '.']

// ---------------------------------------------------------------- RANDOM EATER

/**
 * The little human seen from above: a head (hair `h`, the face `p` on the
 * side it goes), a torso (shirt `c`, arms `p`), legs (trousers `t`, shoes
 * `k`). Each part in the four directions; the torso also as four corners.
 */
export type Direction = 'up' | 'right' | 'down' | 'left'

export const EATER_HEAD: Record<Direction, Sprite> = {
  up: ['..pppp..', '.pkppkp.', '.pppppp.', '.hhhhhh.', 'hhhhhhhh', 'hhhhhhhh', '.hhhhhh.', '..hhhh..'],
  right: ['..hhhh..', '.hhhhhp.', 'hhhhhppk', 'hhhhhppp', 'hhhhhppp', 'hhhhhppk', '.hhhhhp.', '..hhhh..'],
  down: ['..hhhh..', '.hhhhhh.', 'hhhhhhhh', 'hhhhhhhh', '.hhhhhh.', '.pppppp.', '.pkppkp.', '..pppp..'],
  left: ['..hhhh..', '.phhhhh.', 'kpphhhhh', 'ppphhhhh', 'ppphhhhh', 'kpphhhhh', '.phhhhh.', '..hhhh..'],
}
/** A straight torso along an axis, arms out. */
export const EATER_TORSO: Record<'vertical' | 'horizontal', Sprite> = {
  vertical: ['p.cccc.p', 'p.cccc.p', 'p.cccc.p', 'p.cccc.p', 'p.cccc.p', 'p.cccc.p', 'p.cccc.p', 'p.cccc.p'],
  horizontal: ['pppppppp', '........', 'cccccccc', 'cccccccc', 'cccccccc', 'cccccccc', '........', 'pppppppp'],
}
/** The torso bending at a corner: which two sides it connects. */
export const EATER_TURN: Record<'up-right' | 'right-down' | 'down-left' | 'left-up', Sprite> = {
  'up-right': ['p.cccc..', 'p.cccc..', 'p.cccccc', 'p.cccccc', 'p.cccccc', '..cccccc', '........', '........'],
  'right-down': ['........', '........', '..cccccc', '..cccccc', '..cccccc', 'p.cccccc', 'p.cccc..', 'p.cccc..'],
  'down-left': ['........', '........', 'cccccc..', 'cccccc..', 'cccccc..', 'cccccc.p', '..cccc.p', '..cccc.p'],
  'left-up': ['..cccc.p', '..cccc.p', 'cccccc.p', 'cccccc.p', 'cccccc.p', 'cccccc..', '........', '........'],
}
/** The legs, two frames of walking, for each direction. */
export const EATER_LEGS: Record<Direction, Sprite[]> = {
  up: [['..t..t..', '..t..t..', '..t..t..', '..t..t..', '..t..t..', '..t..t..', '..k..k..', '........'], ['..t..t..', '..t..t..', '..t..t..', '..t..t..', '..t..k..', '..k.....', '........', '........']],
  down: [['........', '..k..k..', '..t..t..', '..t..t..', '..t..t..', '..t..t..', '..t..t..', '..t..t..'], ['........', '........', '.....k..', '..k..t..', '..t..t..', '..t..t..', '..t..t..', '..t..t..']],
  right: [['........', '........', 'tttttk..', '........', '........', 'tttttk..', '........', '........'], ['........', '........', 'tttk....', '........', '........', 'tttttk..', '........', '........']],
  left: [['........', '........', '..kttttt', '........', '........', '..kttttt', '........', '........'], ['........', '........', '....kttt', '........', '........', '..kttttt', '........', '........']],
}
export const eaterPalette = (shirt: string): Palette => ({ h: '#5a3319', p: '#f2c9a0', c: shirt, t: '#3d42cc', k: '#121210' })

/** What the eater eats: small Random contents — a video, an image, a text bubble. */
export const FOOD_VIDEO: Sprite = ['wwwwww', 'w.k..w', 'w.kk.w', 'w.kk.w', 'w.k..w', 'wwwwww']
export const FOOD_IMAGE: Sprite = ['wwwwww', 'w....w', 'w.a..w', 'w.aa.w', 'waaaaw', 'wwwwww']
export const FOOD_TEXT: Sprite = ['.wwww.', 'w....w', 'w.ww.w', 'w....w', '.wwww.', '.w....']
export const foodPalette = (accent: string): Palette => ({ w: '#f8f5e6', k: '#121210', a: accent })
