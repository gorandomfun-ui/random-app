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

import { flipSprite, rotateSprite } from './pixels'

export type Direction = 'up' | 'right' | 'down' | 'left'

/**
 * The eater is drawn from the side, crawling on his belly, head first, and
 * every piece is drawn facing right: the other directions are the same
 * pixels turned or mirrored. Hair `h`, skin `p`, the far arm `q` (skin in
 * shadow), shirt `c`, its second colour `d`, jeans `j`, sneakers `s` with their sole `S`, dark `k`.
 */

/** The head in profile: hair, an eye, the mouth open on whatever is ahead, a neck going back to the shoulders. */
export const CRAWL_HEAD: Sprite = [
  '................',
  '....hhhhhhhh....',
  '...hhhhhhhhhh...',
  '..hhhhhhhhhhhh..',
  '..hhhhpppppppp..',
  '..hhhppppppkpp..',
  '..hhhppppppppp..',
  '..hhppppppppppp.',
  '...ppppppppkkkk.',
  '...pppppppkkkk..',
  'ppppppppppppp...',
  'pppppppppppp....',
  'pppppppppp......',
  '................',
  '................',
  '................',
]

/** The shoulders: the top of the shirt, both arms fixed to it and planted on the ground ahead; two frames, the arms swap. */
export const CRAWL_SHOULDERS: Sprite[] = [
  [
    '................',
    '................',
    '................',
    '..cccccccccccc..',
    '.cccccccccccccc.',
    '.cccccccccccccc.',
    '.cccccccccccccc.',
    '.ccccccccccqqcc.',
    '.cccccccccqqccc.',
    '.cccccccccqqppp.',
    '.cccccccccqqpp..',
    '.cccccccccqqpp..',
    '.........qqppp..',
    '.........qqpp...',
    '........qqqppp..',
    '................',
  ],
  [
    '................',
    '................',
    '................',
    '..cccccccccccc..',
    '.cccccccccccccc.',
    '.cccccccccccccc.',
    '.cccccccccccccc.',
    '.cccccccccccqqc.',
    '.ccccccccccqqcc.',
    '.cccccccppppqq..',
    '.cccccccpp.qq...',
    '.cccccccpp.qq...',
    '.......ppp.qqq..',
    '.......pp..qqq..',
    '......ppp.qqqq..',
    '................',
  ],
]

/** The legs at the end, trailing: two jeans legs one over the other, chunky sneakers with a grey sole; two frames, the near leg crawls. */
export const CRAWL_LEGS: Sprite[] = [
  [
    '................',
    '................',
    '................',
    '................',
    '.....jjjjjjjjjjj',
    '..sssjjjjjjjjjjj',
    '.ssssjjjjjjjjjjj',
    '.sssssjjjjjjjjjj',
    'SSSSSS..........',
    '................',
    '.......jjjjjjjjj',
    '....sssjjjjjjjjj',
    '...ssssjjjjjjjjj',
    '...sssssjjjjjjjj',
    '..SSSSSS........',
    '................',
  ],
  [
    '................',
    '................',
    '................',
    '................',
    '.......jjjjjjjjj',
    '....sssjjjjjjjjj',
    '...ssssjjjjjjjjj',
    '...sssssjjjjjjjj',
    '..SSSSSS........',
    '................',
    '.....jjjjjjjjjjj',
    '..sssjjjjjjjjjjj',
    '.ssssjjjjjjjjjjj',
    '.sssssjjjjjjjjjj',
    'SSSSSS..........',
    '................',
  ],
]

export type TorsoPattern = 'plain' | 'bands' | 'stripes' | 'diagonal' | 'checks' | 'dots'
export const TORSO_PATTERNS: readonly TorsoPattern[] = ['bands', 'stripes', 'diagonal', 'checks', 'dots', 'plain']

/** A piece of torso: a patch of shirt with a pattern in two colours, a pixel of air on every side so the pieces read apart. */
export function torsoPiece(pattern: TorsoPattern): Sprite {
  const rows: string[] = []
  for (let y = 0; y < CELL; y += 1) {
    let row = ''
    for (let x = 0; x < CELL; x += 1) {
      if (x < 1 || x > 14 || y < 3 || y > 12) { row += '.'; continue }
      const px = x - 1, py = y - 3
      let second = false
      if (pattern === 'bands') second = Math.floor(py / 2) % 2 === 1
      else if (pattern === 'stripes') second = Math.floor(px / 2) % 2 === 1
      else if (pattern === 'diagonal') second = (px + py) % 4 < 2
      else if (pattern === 'checks') second = (Math.floor(px / 3) + Math.floor(py / 3)) % 2 === 1
      else if (pattern === 'dots') second = px % 4 === 1 && py % 4 === 1
      row += second ? 'd' : 'c'
    }
    rows.push(row)
  }
  return rows
}
export const TORSO_PIECES: Record<TorsoPattern, Sprite> = Object.fromEntries(TORSO_PATTERNS.map((pattern) => [pattern, torsoPiece(pattern)])) as Record<TorsoPattern, Sprite>

/** The shirt colours a meal can add, in pairs: the cloth and its pattern. */
export const TORSO_COLORS: ReadonlyArray<readonly [string, string]> = [
  ['#3d42cc', '#f8f5e6'], ['#d90845', '#f2c33c'], ['#f2c33c', '#121210'], ['#af3bf2', '#f8f5e6'], ['#0fc55d', '#121210'], ['#f8f5e6', '#d92d2d'], ['#e39a3b', '#3d42cc'],
]

/** The piece `index` back from the shoulders: which pattern, which colours. The first piece wears the shirt of the shoulders. */
export function torsoLook(index: number, shirt: string): { sprite: Sprite; palette: Palette } {
  const pattern = TORSO_PATTERNS[index % TORSO_PATTERNS.length]
  const [c, d] = index === 0 ? [shirt, '#f8f5e6'] : TORSO_COLORS[(index - 1) % TORSO_COLORS.length]
  return { sprite: TORSO_PIECES[pattern], palette: { c, d } }
}

/** A right-facing piece turned to face a direction. */
export function facing(sprite: Sprite, direction: Direction): Sprite {
  if (direction === 'right') return sprite
  if (direction === 'left') return flipSprite(sprite)
  return rotateSprite(sprite, direction === 'down' ? 1 : 3)
}

export const eaterPalette = (shirt: string): Palette => ({ h: '#5a3319', p: '#f2c9a0', q: '#c9a07a', c: shirt, d: '#f8f5e6', j: '#3a5fc4', s: '#f8f5e6', S: '#8a8a82', k: '#121210' })

/** What the eater eats and grows on: a little burger. */
export const MINI_BURGER: Sprite = ['...oooooo...', '..oyooooyo..', '.oooooooooo.', '.llllllllll.', '.rrrrrrrrrr.', '.nnnnnnnnnn.', '..oooooooo..', '...oooooo...']
export const MINI_BURGER_PALETTE: Palette = BURGER_PALETTE
