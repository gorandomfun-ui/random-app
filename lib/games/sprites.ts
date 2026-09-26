/**
 * Every character and object of the two games, drawn here as rows of
 * characters: nothing copied, nothing loaded. A character maps to a colour
 * through a palette; '.' is transparent. Sixteen pixels a cell, a dark
 * outline and two tones of shading on everything that moves, so the
 * characters read at a glance on the title scenes and in play alike —
 * the same sprites in both places.
 */

import { dim, flipSprite, mix, rotateSprite, type Palette, type Sprite } from './pixels'

export const CELL = 16

const INK = '#1c1210'
const CREAM = '#f8f5e6'

// ---------------------------------------------------------------- RANDOM CATCHER

/**
 * The burger, facing right: a sesame bun `o` with its light `h` and shade
 * `O`, seeds `y`, two eyes looking ahead, lettuce `l`/`L`, tomato `r`,
 * cheese `c` with a drip, the patty `n`/`N`, the bottom bun. Frame 0 mouth
 * shut, frame 1 the mouth open on the side it goes.
 */
export const BURGER: Sprite[] = [
  [
    '................',
    '.....kkkkkk.....',
    '...kkhhhoookk...',
    '..khhyhhoooyok..',
    '.khhoooowkowkOk.',
    '.khoyooowkowkOk.',
    'kooooyoooooyooOk',
    'kOooooooooooooOk',
    'kkOOOOOOOOOOOOkk',
    'kLlllLlllLllLllk',
    '.krrrrrrrrrrrrk.',
    'kcccccccccccccck',
    'knnnnnnncnnnnnnk',
    'kNnNNnNNNnNNnNNk',
    '.kOooooooooooOk.',
    '..kkkkkkkkkkkk..',
  ],
  [
    '.....kkkkkk.....',
    '...kkhhhoookk...',
    '..khhyhhoooyok..',
    '.khhoooowkowkOk.',
    '.khoyooowkowkOk.',
    'kooooyoooooyooOk',
    'kOooooooooooooOk',
    'kkOOOOOOOOOOOOkk',
    '.kmmmmmmppppmmk.',
    'kLllmmmppppppmLk',
    '.krrrrrrrrrrrrk.',
    'kcccccccccccccck',
    'knnnnnnncnnnnnnk',
    'kNnNNnNNNnNNnNNk',
    '.kOooooooooooOk.',
    '..kkkkkkkkkkkk..',
  ],
]
export const BURGER_PALETTE: Palette = {
  k: '#2b1608', h: '#ffd27a', o: '#e89a3a', O: '#b8661c', y: '#fff6dc', w: '#ffffff',
  l: '#7ad04a', L: '#3f9a2c', r: '#e8412c', c: '#ffcc33', n: '#7a4320', N: '#512a12', m: '#5a0f14', p: '#ff7a8a',
}

/** What the burger picks up in the aisles: a tomato slice, a pickle slice, an onion ring. */
export const TOMATO: Sprite = ['..kkkkkk..', '.krrrrrrk.', 'krppwrpprk', 'krpprrpprk', 'krrrwwrrrk', 'krpprrpprk', 'krppwrpprk', '.krrrrrrk.', '..kkkkkk..']
export const PICKLE: Sprite = ['..kkkkkk..', '.kggggggk.', 'kgGyGGyGgk', 'kgGGyyGGgk', 'kgyyGGyygk', 'kgGGyyGGgk', 'kgGyGGyGgk', '.kggggggk.', '..kkkkkk..']
export const ONION: Sprite = ['..kkkkkk..', '.kwwwwwwk.', 'kwwkkkkwwk', 'kwk....kwk', 'kwk....kwk', 'kwk....kwk', 'kwwkkkkwwk', '.kwwwwwwk.', '..kkkkkk..']
/** A slice of cheese with its holes. */
export const CHEESE: Sprite = ['.kkkkkkkk.', 'kcccccccck', 'kccoccccck', 'kccccccock', 'kcccccccck', 'kcoccccock', 'kcccccccck', '.kkkkkkkk.']
export const ITEM_PALETTE: Palette = { k: INK, r: '#e8412c', p: '#ff9a7a', w: '#fff1e0', g: '#5aa83a', G: '#8fd05a', y: '#e6f0a0', c: '#ffd23f', o: '#d89a18' }

/** The shopping list's four ingredients, in the order the HUD shows them. */
export const INGREDIENTS = [TOMATO, PICKLE, ONION, CHEESE] as const

/** The crumbs that line the aisles: a sesame seed. */
export const PELLET: Sprite = ['.yy.', 'yyyy', '.yy.']
export const PELLET_PALETTE: Palette = { y: '#fff1c8' }

/** The hot sauce: a red bottle, a dark cap, a cream label with a flame. */
export const SAUCE: Sprite = ['....kkkk....', '....kddk....', '....kkkk....', '.....kk.....', '....krrk....', '...krrrrk...', '..krrrrrrk..', '..kwwwwwwk..', '..kwwyywwk..', '..kwyrrywk..', '..kwwwwwwk..', '..krrrrRrk..', '..krrrrRrk..', '...kkkkkk...']
export const SAUCE_PALETTE: Palette = { k: INK, d: '#3a3a36', r: '#e0301e', R: '#a01c10', w: CREAM, y: '#f2c33c' }

/**
 * The little humans who chase the burger, seen from the front: hair `h`,
 * skin `s`/`S`, eyes `e`, a shirt in their own colour `c`/`C`, jeans `j`,
 * sneakers `t`. Two frames, the legs step.
 */
export const HUMAN: Sprite[] = [
  [
    '....kkkkkkkk....',
    '...khhhhhhhhk...',
    '...khhhhhhhhk...',
    '...khsssssshk...',
    '...ksessssesk...',
    '...kssssssssk...',
    '...ksssmmsssk...',
    '....kssssssk....',
    '..kkccccccccck..',
    '.kcccCccccCccck.',
    '.ksk.cccccc.ksk.',
    '.kk.kccccccck.k.',
    '....kjjjjjjk....',
    '....kjjkkjjk....',
    '...kttk..kttk...',
    '...kkkk..kkkk...',
  ],
  [
    '....kkkkkkkk....',
    '...khhhhhhhhk...',
    '...khhhhhhhhk...',
    '...khsssssshk...',
    '...ksessssesk...',
    '...kssssssssk...',
    '...ksssmmsssk...',
    '....kssssssk....',
    '..kkccccccccck..',
    '.kcccCccccCccck.',
    '.ksk.cccccc.ksk.',
    '.kk.kccccccck.k.',
    '....kjjjjjjk....',
    '...kjjk.kjjk....',
    '..kttk...kttk...',
    '..kkkk...kkkk...',
  ],
]
/** Each human's look: shirt and hair. */
export const HUMAN_LOOKS: ReadonlyArray<{ shirt: string; hair: string }> = [
  { shirt: '#4a7cff', hair: '#2a1a10' },
  { shirt: '#ff4d6d', hair: '#f2c33c' },
  { shirt: '#ffb21f', hair: '#6a3a1a' },
  { shirt: '#b05cff', hair: '#121210' },
]
export const humanPalette = (index: number): Palette => {
  const { shirt, hair } = HUMAN_LOOKS[index % HUMAN_LOOKS.length]
  return { k: INK, h: hair, s: '#f2c29a', S: '#d49a70', e: INK, m: '#a0402a', c: shirt, C: dim(shirt, 0.72), j: '#3b5bb5', t: CREAM }
}
/** Frightened, while the sauce burns: pale blue all over, eyes wide. */
export const HUMAN_SCARED_PALETTE: Palette = { k: INK, h: '#7f9cff', s: '#c9d6ff', S: '#a0b4f0', e: '#ffffff', m: '#ffffff', c: '#5a78e6', C: '#4260c8', j: '#3a4ea0', t: '#c9d6ff' }

// ---------------------------------------------------------------- RANDOM EATER

export type Direction = 'up' | 'right' | 'down' | 'left'
export const OPPOSITE: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' }

/**
 * The eater is drawn from the side, crawling on his belly, head first, and
 * every end piece is drawn facing right: the other directions are the same
 * pixels turned or mirrored. The body between is a tube ten pixels thick
 * across the middle of its cell, so every piece meets the next edge to
 * edge, and a piece at a turn is a quarter ring that bends round the corner.
 * Hair `h`, skin `s`/`S`, eye `w`/`e`, mouth `m`, shirt `c`/`C`, jeans
 * `j`/`J`, sneakers `t` with a grey sole `g` and a red stripe `r`.
 */
export const TUBE_FROM = 3
export const TUBE_TO = 12

/** The head in profile, mouth open on whatever is ahead; the neck reaches back to the shoulders' edge. */
export const CRAWL_HEAD: Sprite = [
  '................',
  '....kkkkkkk.....',
  '..kkhhhhhhhkk...',
  '.khhhhhhhhhhhk..',
  '.khhhhhhhhhhhhk.',
  'kkhhhhhhssssssk.',
  'cchhhhhsswekssk.',
  'cchhhSSsswkksssk',
  'cchhhSSsssssssk.',
  'ccchhhsssssskkkk',
  'cccchsssssskmmmk',
  'ccccksssssskmmk.',
  'kkkkksssssssskk.',
  '.....kssssssk...',
  '......kkkkkk....',
  '................',
]

/** The shoulders: the shirt's top, both arms fixed to it and planted on the ground ahead; two frames, the arms swap. */
export const CRAWL_ARMS: Sprite[] = [
  [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '.........kk.....',
    '........kCCk....',
    '....kk..kCCk....',
    '...kcck.kSSkk...',
    '...kcckkSSSSSk..',
    '....kSSk.kSSSSk.',
    '.....kSSSkkkkk..',
    '......kkkk......',
  ],
  [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '....kk..........',
    '...kCCk.........',
    '...kCCk.....kk..',
    '...kSSkk...kcck.',
    '...kSSSSk..kcck.',
    '....kSSSSk.kssk.',
    '.....kkkkk.ksssk',
    '............kkk.',
  ],
]

/** The legs at the end, trailing: jeans, the far leg darker, chunky sneakers with a grey sole; two frames, the near leg kicks. */
export const CRAWL_LEGS: Sprite[] = [
  [
    '................',
    '................',
    '.kkkkk..........',
    'kggtttkkkkkkkkkk',
    'kggtttkJJJJJJJJJ',
    'kggrrrkJJJJJJJJJ',
    'kggtttkJJJJJJJJJ',
    '.kkkkkkkkkkJJJJJ',
    '..kkkkk..kjjjjjj',
    '.kggtttkkjjjjjjj',
    '.kggtttkjjjjjjjj',
    '.kggrrrkjjjjjjjj',
    '.kggtttkkkkkkkkk',
    '..kkkkk.........',
    '................',
    '................',
  ],
  [
    '................',
    '................',
    '..kkkkk.........',
    '.kggtttkkkkkkkkk',
    '.kggtttkJJJJJJJJ',
    '.kggrrrkJJJJJJJJ',
    '.kggtttkJJJJJJJJ',
    '..kkkkkkkkkJJJJJ',
    '.kkkkk...kjjjjjj',
    'kggtttkkkjjjjjjj',
    'kggtttkjjjjjjjjj',
    'kggrrrkjjjjjjjjj',
    'kggtttkkkkkkkkkk',
    '.kkkkk..........',
    '................',
    '................',
  ],
]

export const eaterPalette = (shirt: string): Palette => ({
  k: INK, h: '#4a2814', s: '#f2c29a', S: '#d49a70', w: '#ffffff', e: INK, m: '#7a1a1a',
  c: shirt, C: dim(shirt, 0.72), j: '#3f63c8', J: '#2c4796', t: CREAM, g: '#8a8a82', r: '#e0301e',
})

export type TorsoPattern = 'plain' | 'rings' | 'stripes' | 'diagonal' | 'checks' | 'dots'
export const TORSO_PATTERNS: readonly TorsoPattern[] = ['rings', 'stripes', 'diagonal', 'checks', 'dots', 'plain']

/** The shirt colours a meal can add, in pairs: the cloth and its pattern. */
export const TORSO_COLORS: ReadonlyArray<readonly [string, string]> = [
  ['#3d5ccc', CREAM], ['#e0304a', '#ffd23f'], ['#ffd23f', '#e0304a'], ['#9a4ae6', CREAM], ['#2fb86a', '#16301f'], [CREAM, '#e0304a'], ['#ff8a3a', '#3d42cc'],
]

/** The piece `index` back from the shoulders: which pattern, which colours. */
export function torsoLook(index: number): { pattern: TorsoPattern; cloth: string; print: string } {
  const [cloth, print] = TORSO_COLORS[index % TORSO_COLORS.length]
  return { pattern: TORSO_PATTERNS[index % TORSO_PATTERNS.length], cloth, print }
}

/** Is a point of cloth printed, given where it is along the body and across it? */
function printed(pattern: TorsoPattern, along: number, across: number): boolean {
  const a = Math.floor(along), c = Math.floor(across)
  if (pattern === 'rings') return a % 4 < 2
  if (pattern === 'stripes') return c % 3 === 1
  if (pattern === 'diagonal') return (a + c) % 4 < 2
  if (pattern === 'checks') return (Math.floor(a / 3) + Math.floor(c / 3)) % 2 === 1
  if (pattern === 'dots') return a % 4 === 1 && c % 3 === 1
  return false
}

const STEP: Record<Direction, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

/**
 * A piece of the tube as its own sprite: straight when `front` and `back`
 * are opposite, a quarter ring round the cell's corner when they turn.
 * Along the body the cloth carries its print; the outline runs on both
 * sides; a seam, the cloth in shadow, marks where the piece meets the one
 * behind, so the pieces sit close and still read one by one.
 */
export function tubePiece(front: Direction, back: Direction, look: { pattern: TorsoPattern; cloth: string; print: string }): { sprite: Sprite; palette: Palette } {
  const rows: string[] = []
  const straight = OPPOSITE[front] === back
  // the corner a turn goes round: the one both edges share
  const cx = straight ? 0 : (STEP[front][0] + STEP[back][0] > 0 ? CELL : 0)
  const cy = straight ? 0 : (STEP[front][1] + STEP[back][1] > 0 ? CELL : 0)
  const width = TUBE_TO - TUBE_FROM + 1
  for (let y = 0; y < CELL; y += 1) {
    let row = ''
    for (let x = 0; x < CELL; x += 1) {
      let along: number, across: number
      if (straight) {
        const horizontal = front === 'left' || front === 'right'
        across = (horizontal ? y : x) - TUBE_FROM
        const pos = horizontal ? x : y
        along = STEP[front][0] + STEP[front][1] > 0 ? CELL - 1 - pos : pos
      } else {
        const px = x + 0.5 - cx, py = y + 0.5 - cy
        const r = Math.hypot(px, py)
        across = r - TUBE_FROM - 0.5
        // the angle from the front edge, as a length along the middle of the ring
        const toFront = front === 'left' || front === 'right' ? Math.abs(py) : Math.abs(px)
        along = Math.asin(Math.min(1, toFront / Math.max(r, 0.001))) * 8
        along = Math.max(0, along)
      }
      if (across < -0.5 || across >= width - 0.5) { row += '.'; continue }
      const edge = across < 0.5 || across >= width - 1.5
      const seam = along >= (straight ? CELL - 1 : 12)
      row += edge ? 'k' : seam ? 'C' : printed(look.pattern, along, across) ? 'd' : 'c'
    }
    rows.push(row)
  }
  return { sprite: rows, palette: { k: INK, c: look.cloth, C: mix(look.cloth, INK, 0.45), d: look.print } }
}

/** A right-facing piece turned to face a direction. */
export function facing(sprite: Sprite, direction: Direction): Sprite {
  if (direction === 'right') return sprite
  if (direction === 'left') return flipSprite(sprite)
  return rotateSprite(sprite, direction === 'down' ? 1 : 3)
}

/** The bonus that comes and goes, as in the original game: a milkshake, whipped cream and a cherry on top, a straw. */
export const MILKSHAKE: Sprite = ['.......kk...', '......krk...', '....kkkk.k..', '...kwwwwk.k.', '..kwwwwwwkk.', '..kkkkkkkkk.', '..kppppppk..', '..kpPppppk..', '...kppppk...', '...kpPppk...', '....kppk....', '....kppk....', '.....kk.....', '....kssk....', '...kssssk...', '...kkkkkk...']
export const MILKSHAKE_PALETTE: Palette = { k: INK, r: '#e8303a', w: '#fff8ee', p: '#ff9ac0', P: '#ffd0e2', s: '#c9ccd8' }

/** What the eater eats and grows on: a little burger. */
export const MINI_BURGER: Sprite = ['...kkkkkk...', '..khhoooyk..', '.khyooooook.', '.kOOOOOOOOk.', '.kLlLllLlLk.', '.krrrrrrrrk.', '.knnnnnnnnk.', '..kOooooOk..', '...kkkkkk...']
export const MINI_BURGER_PALETTE: Palette = BURGER_PALETTE
