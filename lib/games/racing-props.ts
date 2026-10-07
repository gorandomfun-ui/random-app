/**
 * What brings RANDOM RACING's coast to life, drawn here in pixels, in the
 * colours of the owner's picture: the public along the road (each one
 * different, waving, cheering), the beach's parasols and lifeguard towers; out at sea the sailboats, the yachts, the jet skis, the
 * windsurfers, the buoys, the dolphins, the lighthouse; in the sky the
 * gulls and the little plane pulling its banner (the promenade's shops are
 * in `racing-town.ts`, the traffic's cars in `racing-traffic.ts`). Each is made once, into a
 * picture with clear pixels round it, and drawn by the road like the palms.
 */

import { PixelBuffer, rgbOf, type Palette, type Sprite } from './pixels'
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
