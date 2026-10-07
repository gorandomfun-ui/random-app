/**
 * What brings RANDOM RACING's coast to life, drawn here in pixels, in the
 * colours of the owner's picture: the public along the road (each one
 * different, waving, cheering), the buildings of the promenade (pastel
 * fronts, windows lit after dark, a neon word), the beach's parasols and
 * lifeguard towers; out at sea the sailboats, the yachts, the jet skis, the
 * windsurfers, the buoys, the dolphins, the lighthouse; in the sky the
 * gulls and the little plane pulling its banner. Each is made once, into a
 * picture with clear pixels round it, and drawn by the road like the palms.
 */

import { drawText7, PixelBuffer, rgbOf, text7Width, type Palette, type Sprite } from './pixels'
import { seeded } from './engine'

// ---------------------------------------------------------------- pictures from sprites

/** A sprite in its palette as a picture, its '.' clear. */
function picture(sprite: Sprite, palette: Palette): PixelBuffer {
  const h = sprite.length, w = Math.max(...sprite.map((r) => r.length))
  const out = new PixelBuffer(w, h, '#000000')
  out.data.fill(0)
  sprite.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const c = palette[row[x]]
      if (!c) continue
      const [r, g, b] = rgbOf(c), o = (y * w + x) * 4
      out.data[o] = r; out.data[o + 1] = g; out.data[o + 2] = b; out.data[o + 3] = 255
    }
  })
  return out
}
/** One picture laid onto another at `x`, `y`, its clear pixels left out. */
function onto(dst: PixelBuffer, src: PixelBuffer, x: number, y: number, flip = false): void {
  for (let yy = 0; yy < src.height; yy += 1) for (let xx = 0; xx < src.width; xx += 1) {
    const sx = flip ? src.width - 1 - xx : xx, o = (yy * src.width + sx) * 4
    if (src.data[o + 3] < 128) continue
    const X = x + xx, Y = y + yy
    if (X < 0 || Y < 0 || X >= dst.width || Y >= dst.height) continue
    const t = (Y * dst.width + X) * 4
    dst.data[t] = src.data[o]; dst.data[t + 1] = src.data[o + 1]; dst.data[t + 2] = src.data[o + 2]; dst.data[t + 3] = 255
  }
}
const blankPicture = (w: number, h: number) => { const b = new PixelBuffer(w, h, '#000000'); b.data.fill(0); return b }

// ---------------------------------------------------------------- the public

/** A person from the front: hair, skin, shirt (and its shade), shorts (and theirs), shoes; arms down, one up waving, both up cheering. */
const PERSON: Record<'down' | 'wave' | 'cheer', Sprite> = {
  down: [
    '...hhh...', '..hhhhh..', '..hsssh..', '...sss...', '....s....',
    '..tttTT..', '.ttttTTT.', '.stttTTs.', '.stttTTs.', '.s.ttT.s.',
    '...ppP...', '...ppP...', '...p.P...', '...s.s...', '...s.s...', '...s.s...', '..ff.ff..',
  ],
  wave: [
    '...hhh..s', '..hhhhh.s', '..hsssh.s', '...sss..s', '....s...s',
    '..tttTTs.', '.ttttTT..', '.stttTT..', '.stttTT..', '.s.ttT...',
    '...ppP...', '...ppP...', '...p.P...', '...s.s...', '...s.s...', '...s.s...', '..ff.ff..',
  ],
  cheer: [
    's..hhh..s', 's.hhhhh.s', 's.hsssh.s', 's..sss..s', '.s..s..s.',
    '.stttTTs.', '..ttTTT..', '..ttTTT..', '..ttTTT..', '...tTT...',
    '...ppP...', '...ppP...', '...p.P...', '...s.s...', '...s.s...', '...s.s...', '..ff.ff..',
  ],
}
const SKINS = ['#f2c39a', '#d99a6c', '#a8683e', '#6e4126'], HAIRS = ['#2a1a14', '#5a3418', '#1a1418', '#c8902e']
const SHIRTS = [['#3a7ae0', '#2a56a8'], ['#ff6ab0', '#c8488a'], ['#3ac070', '#2a8a52'], ['#faf6ec', '#c8c0b4'], ['#ffd23f', '#c89a10'], ['#ff7a3a', '#c8521e'], ['#8a5ae0', '#6a3ab0'], ['#2ac0c8', '#1a8a94']]
const SHORTS = [['#2a4a8a', '#1a3060'], ['#e05a8a', '#a83a62'], ['#f2e2c0', '#c8b496'], ['#3a3a4a', '#24242e'], ['#ffd23f', '#c89a10']]

const crowds = new Map<string, PixelBuffer>()
/**
 * A group of the public, `n` across, a second row behind the first: each
 * person drawn from their own skin, hair, shirt and shorts, some cheering;
 * on `frame` 0 or 1 the wavers' arms up or down, so they wave.
 */
export function crowdPicture(seed: number, frame: 0 | 1, n = 7): PixelBuffer {
  const key = `${seed}|${frame}|${n}`
  let out = crowds.get(key)
  if (out) return out
  const rnd = seeded(seed * 7919 + 17)
  const step = 8, w = n * step + 4, h = 24
  out = blankPicture(w, h)
  for (const row of [1, 0]) {
    for (let k = 0; k < n; k += 1) {
      const pick = <T>(list: readonly T[]) => list[Math.floor(rnd() * list.length)]
      const shirt = pick(SHIRTS), shorts = pick(SHORTS)
      const palette: Palette = { h: pick(HAIRS), s: pick(SKINS), t: shirt[0], T: shirt[1], p: shorts[0], P: shorts[1], f: '#2a2030' }
      const kind = rnd()
      const pose = kind < 0.35 ? 'down' : kind < 0.75 ? (frame === 0 ? 'wave' : 'down') : (frame === 0 ? 'cheer' : 'wave')
      const person = picture(PERSON[pose], palette)
      // the row behind a little higher and darker, shifted half a person
      if (row === 1) for (let i = 0; i < person.data.length; i += 4) { person.data[i] *= 0.72; person.data[i + 1] *= 0.72; person.data[i + 2] *= 0.78 }
      onto(out, person, 2 + k * step + (row ? 4 : 0) + Math.round((rnd() - 0.5) * 2), row ? 0 : 6 + Math.round(rnd() * 1), rnd() < 0.5)
    }
  }
  crowds.set(key, out)
  return out
}

// ---------------------------------------------------------------- the promenade's buildings

const WALLS = ['#f4a6b8', '#9fe0c8', '#f4e2b8', '#c8b0e8', '#9cc8f0', '#f8b890']
const AWNINGS = [['#e2302a', '#faf6ec'], ['#1aa0a8', '#faf6ec'], ['#ff6ab0', '#faf6ec'], ['#3a7ae0', '#ffd23f']]
const WORDS = ['SURF', 'MOTEL', 'HOTEL', 'BAR', 'TACOS', 'PIZZA', 'GELATO', 'ARCADE', 'DINER', 'RADIO', 'BURGER', 'VIDEO']
const NEONS = ['#ff4ab0', '#3af0ff', '#ffd23f', '#7aff6a', '#ff7a3a']
const buildings = new Map<string, PixelBuffer>()
const mixRgb = (a: string, k: number): string => { const [r, g, b] = rgbOf(a); return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0')).join('')}` }

/**
 * A building of the promenade, one of a dozen: a pastel front two or three
 * floors high, its pilasters and its ledge, rows of windows (warm and lit
 * after dark, some of them), an awning in stripes over the shop, the door, a
 * word in neon over the awning — glowing after dark.
 */
export function buildingPicture(variant: number, lit: boolean): PixelBuffer {
  const key = `${variant}|${lit}`
  let out = buildings.get(key)
  if (out) return out
  const rnd = seeded(variant * 104729 + 3)
  const floors = 2 + (variant % 2), w = 52 + (variant % 3) * 6, h = 18 + floors * 13
  out = new PixelBuffer(w, h, '#000000')
  const wall = WALLS[variant % WALLS.length], shade = mixRgb(wall, 0.82), lightWall = mixRgb(wall, 1.08), dark = mixRgb(wall, 0.5)
  out.rect(0, 0, w, h, wall)
  // the ledge on top, the pilasters at the corners and between bays
  out.rect(0, 0, w, 3, lightWall); out.rect(0, 3, w, 1, dark)
  const bays = Math.floor((w - 4) / 12)
  for (let k = 0; k <= bays; k += 1) out.rect(2 + k * Math.floor((w - 4) / bays) - 1, 4, 2, h - 4, shade)
  // the upper floors' windows
  for (let f = 0; f < floors - 1; f += 1) for (let k = 0; k < bays; k += 1) {
    const bx = 2 + k * Math.floor((w - 4) / bays) + 3, by = 7 + f * 13, bw = Math.floor((w - 4) / bays) - 6
    const on = lit && rnd() < 0.6
    out.rect(bx - 1, by - 1, bw + 2, 9, dark)
    out.rect(bx, by, bw, 7, on ? '#ffd890' : '#2a3a6a')
    if (!on) out.rect(bx, by, Math.max(1, Math.round(bw / 3)), 2, '#5a74b0')
    else out.rect(bx, by + 5, bw, 2, '#e8a050')
  }
  // the shop: the word over it, the awning, the window and the door
  const shopTop = h - 18
  const word = WORDS[variant % WORDS.length], neon = NEONS[(variant * 3) % NEONS.length]
  out.rect(2, shopTop - 1, w - 4, 9, '#2a1a34')
  const tw = text7Width(word, 1, false)
  drawText7(out, word, Math.round((w - tw) / 2), shopTop, lit ? '#ffffff' : neon, 1, false)
  if (lit) for (let y = shopTop - 1; y < shopTop + 8; y += 1) for (let x = 2; x < w - 2; x += 1) { const o = (y * w + x) * 4; if (out.data[o] > 240 && out.data[o + 1] > 240) continue; const [r, g, b] = rgbOf(neon); out.data[o] += (r - out.data[o]) * 0.25; out.data[o + 1] += (g - out.data[o + 1]) * 0.25; out.data[o + 2] += (b - out.data[o + 2]) * 0.25 }
  const [a0, a1] = AWNINGS[variant % AWNINGS.length]
  for (let x = 1; x < w - 1; x += 1) { out.rect(x, shopTop + 9, 1, 4, Math.floor(x / 4) % 2 ? a0 : a1); if (x % 4 === 1) out.set(x, shopTop + 13, Math.floor(x / 4) % 2 ? a0 : a1) }
  out.rect(3, shopTop + 14, w - 6, 4, lit ? '#ffcf80' : '#1e2a50')
  out.rect(Math.round(w / 2) - 3, shopTop + 13, 6, 5, dark)
  buildings.set(key, out)
  return out
}

// ---------------------------------------------------------------- the beach

const BEACH_SPRITES = {
  parasol: [
    '.....rWr.....', '...rrWWWrr...', '..rrWWrWWrr..', '.rrWWrrrWWrr.', 'rrWWrrrrrWWrr', 'R...R.k.R...R',
    '......k......', '......k......', '......k......', '......k......', '......k......', '..ttttkttt...', '..TTTTTTTT...',
  ],
  tower: [
    '...rrrrrrrr...', '..rrrrrrrrrr..', '.RRRRRRRRRRRR.', '.kWWWWWWWWWWk.', '.kWbbbbbbbbWk.', '.kWbbbbbbbbWk.', '.kWWWWWWWWWWk.',
    'kkkkkkkkkkkkkk', '.kw..w..w..wk.', '..w.w....w.w..', '..ww......ww..', '..w.w....w.w..', '..w..w..w..w..', '..w...ww...w..',
    '..w...ww...w..', '..w..w..w..w..', '..w.w....w.w..', '..ww......ww..', '..w.w....w.w..', '..w..w..w..w..', '..w........w..',
  ],
} as const
const PARASOLS: Palette[] = [
  { r: '#e2302a', W: '#faf6ec', R: '#a81e1a', k: '#4a3a3a', t: '#3a7ae0', T: '#2a56a8' },
  { r: '#1aa0a8', W: '#ffd23f', R: '#127078', k: '#4a3a3a', t: '#ff6ab0', T: '#c8488a' },
  { r: '#ff7a3a', W: '#faf6ec', R: '#c8521e', k: '#4a3a3a', t: '#ffd23f', T: '#c89a10' },
]
const TOWER: Palette = { r: '#e2302a', R: '#a81e1a', W: '#faf6ec', b: '#3a3a5a', k: '#5a3a2a', w: '#c89a6a' }

// ---------------------------------------------------------------- the sea

const SEA_SPRITES = {
  sailboat: [
    '.......k.......', '.......kW......', '......SkWW.....', '......SkWWW....', '.....SSkWWW....', '.....SSkWWWW...',
    '....SSSkWWWWW..', '....SSSkWWWWW..', '...SSSSkWWWWWW.', '...SSSSkWWWWWW.', '..SSSSSkWWWWWWW', '.......k.......',
    'rrrrrrrrrrrrrrr', '.HHHHHHHHHHHHH.', '..HHHHHHHHHHH..', '.fffffffffffff.',
  ],
  yacht: [
    '........kkkk............', '.......kWWWWk...........', '......kWbbbbWWWWWk......', '.....kWWWWWWWWWWWWWk....',
    '...kWWbbWWbbWWbbWWWWWk..', 'kWWWWWWWWWWWWWWWWWWWWWWk', '.kHHHHHHHHHHHHHHHHHHHHk.', '..kHHHHHHHHHHHHHHHHHHk..', '...ffffffffffffffffff...',
  ],
  jetski: ['.....hh.....', '.....ss.....', '....tTT.....', '....tTTs....', '...rrRRRr...', '.rrrrrrrrrr.', 'fff.ffffffff'],
  windsurf: [
    '...k......', '...kYY....', '...kYYY...', '...kMMMM..', '...kYYYYY.', '...kMMMMM.', '...kYYYYYY', '...kMMMMM.',
    '..hk......', '..s.......', '.tt.......', '.tp.......', 'BBBBBBBB..', '.ffffff...',
  ],
  buoy: ['..k..', '.rrr.', '.WWW.', '.rrr.', '.WWW.', 'rrrrr', 'ffff.'],
  dolphin: ['....dd..........', '...dDDdd........', '..dDDDDDdd......', '.dDDDDDDDDdd....', 'dDDDLLLDDDDDd...', '.dd.LLLLLLDDDd..', '.......LLL..dDd.', '............d.d.'],
  lighthouse: [
    '....kkkk....', '...kyyyyk...', '...kyYYyk...', '..kkkkkkkk..', '...WWWWWW...', '...rrrrrr...', '...WWWWWW...', '...rrrrrr...',
    '..WWWWWWWW..', '..rrrrrrrr..', '..WWWWWWWW..', '..rrrrrrrr..', '..WWWWWWWW..', '.rrrrrrrrrr.', '.WWWWWWWWWW.', '.rrrrrrrrrr.',
    '.gggGGgggGG.', 'ggGGggGGGggG', 'gGGgggGGgggg', 'ffffffffffff',
  ],
} as const
const SEA_PALETTES: Record<keyof typeof SEA_SPRITES, Palette[]> = {
  sailboat: [{ k: '#5a4a4a', W: '#faf6ec', S: '#d8c8c0', r: '#e2302a', H: '#f2efe6', f: '#e8f8ff' }, { k: '#5a4a4a', W: '#ffd23f', S: '#e0a828', r: '#1a3a8a', H: '#2a4a9a', f: '#e8f8ff' }, { k: '#5a4a4a', W: '#ff6ab0', S: '#d84a8a', r: '#faf6ec', H: '#f2efe6', f: '#e8f8ff' }],
  yacht: [{ k: '#3a3a4a', W: '#faf6ec', b: '#2a3a6a', H: '#2a4a8a', f: '#e8f8ff' }, { k: '#3a3a4a', W: '#f2efe6', b: '#1a2a4a', H: '#c8302a', f: '#e8f8ff' }],
  jetski: [{ h: '#2a1a14', s: '#d99a6c', t: '#ffd23f', T: '#c89a10', r: '#ff4a8a', R: '#c8306a', f: '#f2fbff' }, { h: '#5a3418', s: '#f2c39a', t: '#3a7ae0', T: '#2a56a8', r: '#3af0c8', R: '#1aa090', f: '#f2fbff' }],
  windsurf: [{ k: '#4a4a5a', Y: '#ffd23f', M: '#ff4ab0', h: '#2a1a14', s: '#d99a6c', t: '#3ac070', p: '#2a4a8a', B: '#faf6ec', f: '#e8f8ff' }, { k: '#4a4a5a', Y: '#3af0ff', M: '#8a5ae0', h: '#5a3418', s: '#f2c39a', t: '#ff7a3a', p: '#3a3a4a', B: '#ffd23f', f: '#e8f8ff' }],
  buoy: [{ k: '#3a3a4a', r: '#e2302a', W: '#faf6ec', f: '#e8f8ff' }],
  dolphin: [{ d: '#3a5a7a', D: '#5a7c9c', L: '#c8d8e4' }],
  lighthouse: [{ k: '#3a3a4a', y: '#ffe08a', Y: '#fff6c8', W: '#f2efe6', r: '#d8302a', g: '#4a3a4a', G: '#6a5a6a', f: '#e8f8ff' }],
}

export type PropKind = 'parasol' | 'tower' | keyof typeof SEA_SPRITES
const props = new Map<string, PixelBuffer>()
/** A prop's picture, in one of its colourings (`look`). */
export function propPicture(kind: PropKind, look = 0): PixelBuffer {
  const key = `${kind}|${look}`
  let out = props.get(key)
  if (out) return out
  if (kind === 'parasol') out = picture(BEACH_SPRITES.parasol, PARASOLS[look % PARASOLS.length])
  else if (kind === 'tower') out = picture(BEACH_SPRITES.tower, TOWER)
  else { const list = SEA_PALETTES[kind]; out = picture(SEA_SPRITES[kind], list[look % list.length]) }
  props.set(key, out)
  return out
}
/** How tall each prop stands, in half widths of the road; how many colourings it has. */
export const PROP_HIGH: Record<PropKind, number> = { parasol: 0.62, tower: 1.15, sailboat: 1.5, yacht: 0.9, jetski: 0.42, windsurf: 0.85, buoy: 0.32, dolphin: 0.42, lighthouse: 3.2 }
export const PROP_LOOKS: Record<PropKind, number> = { parasol: 3, tower: 1, sailboat: 3, yacht: 2, jetski: 2, windsurf: 2, buoy: 1, dolphin: 1, lighthouse: 1 }

// ---------------------------------------------------------------- the sky

/** A gull, wings up or flat. */
export const GULL: readonly Sprite[] = [['k.....k', '.k...k.', '..k.k..'], ['.......', 'kkk.kkk', '...k...']]
/** The little plane, from the side, flying left. */
export const PLANE: Sprite = ['....kk.......', '.kWWWWWWWWk..', 'kWbWWWWWWWWWr', '.kWWWWWWWWk..', '....kk.......']
export const PLANE_PALETTE: Palette = { k: '#3a3a4a', W: '#faf6ec', b: '#3a7ae0', r: '#e2302a' }
