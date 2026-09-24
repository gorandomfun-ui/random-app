/**
 * Every sprite of the two games, drawn here as rows of characters: nothing
 * copied, nothing loaded. A character maps to a colour through a palette;
 * '.' is transparent. Sixteen pixels a cell: twice the detail of a first
 * try at eight, which the owner found too plain.
 */

import type { Palette, Sprite } from './pixels'

export const CELL = 16

export const BASE_PALETTE: Palette = { k: '#121210', w: '#f8f5e6', d: '#3a3a36', g: '#8a8a82' }

// ---------------------------------------------------------------- RANDOM CATCHER

/** The burger: sesame bun `o` with seeds `y`, lettuce `l`, tomato `r`, cheese `c`, patty `n`; the eyes `k`/`w`. Mouth closed, mouth open. */
export const BURGER: Sprite[] = [
  [
    '.....oooooo.....',
    '...oooyoooyooo..',
    '..ooyooooooooyo.',
    '.oooooooyooooooo',
    '.oowwooooooowwoo',
    '.oowkooooooowkoo',
    '.ooooooooooooooo',
    '..llllllllllllll',
    '.llllllllllllll.',
    '.rrrrrrrrrrrrrr.',
    '.cccccccccccccc.',
    '.nnnnnnnnnnnnnn.',
    '.nnnnnnnnnnnnnn.',
    '..oooooooooooo..',
    '..oooooooooooo..',
    '...oooooooooo...',
  ],
  [
    '.....oooooo.....',
    '...oooyoooyooo..',
    '..ooyooooooooyo.',
    '.oooooooyooooooo',
    '.oowwooooooowwoo',
    '.oowkooooooowkoo',
    '.ooooooooooooooo',
    '..lllllllll.....',
    '.llllllll.......',
    '.rrrrrrr........',
    '.cccccc.........',
    '.nnnnnnnn.......',
    '.nnnnnnnnnnn....',
    '..oooooooooooo..',
    '..oooooooooooo..',
    '...oooooooooo...',
  ],
]
export const BURGER_PALETTE: Palette = { o: '#e39a3b', y: '#f8f5e6', l: '#5fbf4a', r: '#d92d2d', c: '#f2c33c', n: '#5a3319', w: '#f8f5e6', k: '#121210' }

export const TOMATO: Sprite = ['...rrrrrr...', '..rrppprrr..', '.rrpppppprr.', '.rppprrpppr.', '.rpprrrrppr.', '.rpprrrrppr.', '.rppprrpppr.', '.rrpppppprr.', '..rrppprrr..', '...rrrrrr...']
export const PICKLE: Sprite = ['...gggggg...', '..gGggggGg..', '.gggGggGggg.', '.gGgggggggg.', '.gggggGgggg.', '.gggGggggGg.', '.gGgggggggg.', '.gggggGgggg.', '..gGggggGg..', '...gggggg...']
export const ONION: Sprite = ['...wwwwww...', '..ww....ww..', '.ww......ww.', '.w...ww...w.', '.w..w..w..w.', '.w..w..w..w.', '.w...ww...w.', '.ww......ww.', '..ww....ww..', '...wwwwww...']
export const ITEM_PALETTE: Palette = { r: '#d92d2d', p: '#f28c8c', g: '#4f9e3d', G: '#2f6b24', w: '#f8f5e6' }

/** The hot sauce: a red bottle with a cream label and a dark cap, the flame on the label. */
export const SAUCE: Sprite = ['....kkkk....', '....kkkk....', '.....rr.....', '....rrrr....', '...rrrrrr...', '..rrwwwwrr..', '..rrwyywrr..', '..rrwyywrr..', '..rrwwwwrr..', '..rrrrrrrr..', '..rrrrrrrr..', '...rrrrrr...']
export const SAUCE_PALETTE: Palette = { k: '#121210', r: '#e0301e', w: '#f8f5e6', y: '#f2c33c' }

/** The little humans who chase the burger: hair and shirt in their own colour `c`, skin `p`, jeans `j`, shoes `s`. Two frames, the legs swap. */
export const HUMAN: Sprite[] = [
  [
    '.....cccccc.....',
    '....cccccccc....',
    '....cppppppc....',
    '....cpkppkpc....',
    '.....pppppp.....',
    '......pppp......',
    '....cccccccc....',
    '...pccccccccp...',
    '...pccccccccp...',
    '...pccccccccp...',
    '....cccccccc....',
    '.....jjjjjj.....',
    '.....jj..jj.....',
    '.....jj..jj.....',
    '.....jj..jj.....',
    '....sss..sss....',
  ],
  [
    '.....cccccc.....',
    '....cccccccc....',
    '....cppppppc....',
    '....cpkppkpc....',
    '.....pppppp.....',
    '......pppp......',
    '....cccccccc....',
    '...pccccccccp...',
    '...pccccccccp...',
    '...pccccccccp...',
    '....cccccccc....',
    '.....jjjjjj.....',
    '....jjj..jj.....',
    '....jj...jj.....',
    '...jj....jj.....',
    '..sss....sss....',
  ],
]
/** Frightened, while the sauce burns: blue all over, eyes wide. */
export const HUMAN_SCARED: Sprite = HUMAN[0].map((row) => row.replace(/c/g, 'b').replace(/p/g, 'w'))
export const HUMAN_COLORS = ['#3d42cc', '#d90845', '#0fc55d', '#af3bf2']
export const humanPalette = (color: string): Palette => ({ c: color, p: '#f2c9a0', k: '#121210', j: '#2f4fa8', s: '#f8f5e6', b: '#3d42cc', w: '#f8f5e6' })

export const PELLET: Sprite = ['.ww.', 'wwww', 'wwww', '.ww.']

// ---------------------------------------------------------------- RANDOM EATER

export type Direction = 'up' | 'right' | 'down' | 'left'

/** The head from above: hair `h`, the face `p` on the side it goes, eyes `k`. */
export const EATER_HEAD: Record<Direction, Sprite> = {
  up: ['.....pppppp.....', '....pkpppppkp...', '....pppppppppp..', '....pppppppppp..', '...hhhhhhhhhhh..', '..hhhhhhhhhhhhh.', '..hhhhhhhhhhhhh.', '..hhhhhhhhhhhhh.', '..hhhhhhhhhhhhh.', '..hhhhhhhhhhhhh.', '..hhhhhhhhhhhhh.', '..hhhhhhhhhhhhh.', '...hhhhhhhhhhh..', '....hhhhhhhhh...', '.....hhhhhhh....', '................'],
  down: ['................', '.....hhhhhhh....', '....hhhhhhhhh...', '...hhhhhhhhhhh..', '..hhhhhhhhhhhhh.', '..hhhhhhhhhhhhh.', '..hhhhhhhhhhhhh.', '..hhhhhhhhhhhhh.', '..hhhhhhhhhhhhh.', '..hhhhhhhhhhhhh.', '..hhhhhhhhhhhhh.', '...hhhhhhhhhhh..', '....pppppppppp..', '....pppppppppp..', '....pkpppppkp...', '.....pppppp.....'],
  right: ['................', '....hhhhhhh.....', '...hhhhhhhhh....', '..hhhhhhhhhhpp..', '..hhhhhhhhhhppp.', '..hhhhhhhhhhppk.', '..hhhhhhhhhhppp.', '..hhhhhhhhhhppp.', '..hhhhhhhhhhppp.', '..hhhhhhhhhhppp.', '..hhhhhhhhhhppk.', '..hhhhhhhhhhppp.', '..hhhhhhhhhhpp..', '...hhhhhhhhh....', '....hhhhhhh.....', '................'],
  left: ['................', '.....hhhhhhh....', '....hhhhhhhhh...', '..pphhhhhhhhhh..', '.ppphhhhhhhhhh..', '.kpphhhhhhhhhh..', '.ppphhhhhhhhhh..', '.ppphhhhhhhhhh..', '.ppphhhhhhhhhh..', '.ppphhhhhhhhhh..', '.kpphhhhhhhhhh..', '.ppphhhhhhhhhh..', '..pphhhhhhhhhh..', '....hhhhhhhhh...', '.....hhhhhhh....', '................'],
}
/** The shoulders, right under the head: the shirt `c` with the two arms `p` fixed to it, hands `p`. Never stretches. */
export const EATER_SHOULDERS: Record<Direction, Sprite> = {
  up: ['....cccccccc....', '..pccccccccccp..', '.pppcccccccccpp.', '.pp.cccccccc.pp.', '.pp.cccccccc.pp.', '.pp.cccccccc.pp.', '.pp.cccccccc.pp.', '.pp.cccccccc.pp.', '.pp.cccccccc.pp.', '.pp.cccccccc.pp.', '.pp.cccccccc.pp.', '.pp.cccccccc.pp.', '.pp.cccccccc.pp.', '.pp.cccccccc.pp.', '.pp.cccccccc.pp.', '....cccccccc....'],
  down: ['....cccccccc....', '.pp.cccccccc.pp.', '.pp.cccccccc.pp.', '.pp.cccccccc.pp.', '.pp.cccccccc.pp.', '.pp.cccccccc.pp.', '.pp.cccccccc.pp.', '.pp.cccccccc.pp.', '.pp.cccccccc.pp.', '.pp.cccccccc.pp.', '.pp.cccccccc.pp.', '.pp.cccccccc.pp.', '.pp.cccccccc.pp.', '.pppcccccccccpp.', '..pccccccccccp..', '....cccccccc....'],
  right: ['.pppppppppppppp.', '.ppp..........p.', '.....ccccccccc..', '.cccccccccccccc.', '.cccccccccccccc.', '.cccccccccccccc.', '.cccccccccccccc.', '.cccccccccccccc.', '.cccccccccccccc.', '.cccccccccccccc.', '.cccccccccccccc.', '.cccccccccccccc.', '.cccccccccccccc.', '.....ccccccccc..', '.ppp..........p.', '.pppppppppppppp.'],
  left: ['.pppppppppppppp.', '.p..........ppp.', '..ccccccccc.....', '.cccccccccccccc.', '.cccccccccccccc.', '.cccccccccccccc.', '.cccccccccccccc.', '.cccccccccccccc.', '.cccccccccccccc.', '.cccccccccccccc.', '.cccccccccccccc.', '.cccccccccccccc.', '.cccccccccccccc.', '..ccccccccc.....', '.p..........ppp.', '.pppppppppppppp.'],
}
/** A piece of torso: the shirt, straight along an axis. These are what a meal adds. */
export const EATER_TORSO: Record<'vertical' | 'horizontal', Sprite> = {
  vertical: Array.from({ length: 16 }, () => '....cccccccc....'),
  horizontal: ['................', '................', '................', '................', 'cccccccccccccccc', 'cccccccccccccccc', 'cccccccccccccccc', 'cccccccccccccccc', 'cccccccccccccccc', 'cccccccccccccccc', 'cccccccccccccccc', 'cccccccccccccccc', '................', '................', '................', '................'],
}
/** The torso bending at a corner: which two sides it connects. */
export const EATER_TURN: Record<'up-right' | 'right-down' | 'down-left' | 'left-up', Sprite> = {
  'up-right': ['....cccccccc....', '....cccccccc....', '....cccccccc....', '....cccccccc....', '....cccccccccccc', '....cccccccccccc', '....cccccccccccc', '....cccccccccccc', '....cccccccccccc', '....cccccccccccc', '....cccccccccccc', '....cccccccccccc', '................', '................', '................', '................'],
  'right-down': ['................', '................', '................', '................', '....cccccccccccc', '....cccccccccccc', '....cccccccccccc', '....cccccccccccc', '....cccccccccccc', '....cccccccccccc', '....cccccccccccc', '....cccccccccccc', '....cccccccc....', '....cccccccc....', '....cccccccc....', '....cccccccc....'],
  'down-left': ['................', '................', '................', '................', 'cccccccccccc....', 'cccccccccccc....', 'cccccccccccc....', 'cccccccccccc....', 'cccccccccccc....', 'cccccccccccc....', 'cccccccccccc....', 'cccccccccccc....', '....cccccccc....', '....cccccccc....', '....cccccccc....', '....cccccccc....'],
  'left-up': ['....cccccccc....', '....cccccccc....', '....cccccccc....', '....cccccccc....', 'cccccccccccc....', 'cccccccccccc....', 'cccccccccccc....', 'cccccccccccc....', 'cccccccccccc....', 'cccccccccccc....', 'cccccccccccc....', 'cccccccccccc....', '................', '................', '................', '................'],
}
/** The legs at the end: jeans `j` and shoes `k`, seen from above, two frames of walking, four directions. */
export const EATER_LEGS: Record<Direction, Sprite[]> = {
  up: [
    ['....jjj..jjj....', '....jjj..jjj....', '....jjj..jjj....', '....jjj..jjj....', '....jjj..jjj....', '....jjj..jjj....', '....jjj..jjj....', '....jjj..jjj....', '....jjj..jjj....', '....jjj..jjj....', '....sss..sss....', '....sss..sss....', '....sss..sss....', '................', '................', '................'],
    ['....jjj..jjj....', '....jjj..jjj....', '....jjj..jjj....', '....jjj..jjj....', '....jjj..jjj....', '....jjj..jjj....', '....jjj..sss....', '....jjj..sss....', '....jjj..sss....', '....jjj.........', '....sss.........', '....sss.........', '....sss.........', '................', '................', '................'],
  ],
  down: [
    ['................', '................', '................', '....sss..sss....', '....sss..sss....', '....sss..sss....', '....jjj..jjj....', '....jjj..jjj....', '....jjj..jjj....', '....jjj..jjj....', '....jjj..jjj....', '....jjj..jjj....', '....jjj..jjj....', '....jjj..jjj....', '....jjj..jjj....', '....jjj..jjj....'],
    ['................', '................', '................', '.........sss....', '.........sss....', '.........sss....', '....sss..jjj....', '....sss..jjj....', '....sss..jjj....', '....jjj..jjj....', '....jjj..jjj....', '....jjj..jjj....', '....jjj..jjj....', '....jjj..jjj....', '....jjj..jjj....', '....jjj..jjj....'],
  ],
  right: [
    ['................', '................', '................', '................', 'jjjjjjjjjjsss...', 'jjjjjjjjjjsss...', 'jjjjjjjjjjsss...', '................', '................', 'jjjjjjjjjjsss...', 'jjjjjjjjjjsss...', 'jjjjjjjjjjsss...', '................', '................', '................', '................'],
    ['................', '................', '................', '................', 'jjjjjjjsss......', 'jjjjjjjsss......', 'jjjjjjjsss......', '................', '................', 'jjjjjjjjjjsss...', 'jjjjjjjjjjsss...', 'jjjjjjjjjjsss...', '................', '................', '................', '................'],
  ],
  left: [
    ['................', '................', '................', '................', '...sssjjjjjjjjjj', '...sssjjjjjjjjjj', '...sssjjjjjjjjjj', '................', '................', '...sssjjjjjjjjjj', '...sssjjjjjjjjjj', '...sssjjjjjjjjjj', '................', '................', '................', '................'],
    ['................', '................', '................', '................', '......sssjjjjjjj', '......sssjjjjjjj', '......sssjjjjjjj', '................', '................', '...sssjjjjjjjjjj', '...sssjjjjjjjjjj', '...sssjjjjjjjjjj', '................', '................', '................', '................'],
  ],
}
export const eaterPalette = (shirt: string): Palette => ({ h: '#5a3319', p: '#f2c9a0', c: shirt, j: '#2f4fa8', s: '#f8f5e6', k: '#121210' })

/** What the eater eats and grows on: a little burger. */
export const MINI_BURGER: Sprite = ['...oooooo...', '..oyooooyo..', '.oooooooooo.', '.llllllllll.', '.rrrrrrrrrr.', '.nnnnnnnnnn.', '..oooooooo..', '...oooooo...']
export const MINI_BURGER_PALETTE: Palette = BURGER_PALETTE
