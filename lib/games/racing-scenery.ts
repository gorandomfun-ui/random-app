/**
 * What stands by RANDOM RACING's road in the other worlds, drawn here (the
 * pines, the rocks and the saguaros are traced from the owner's pictures):
 * the city park's round trees, its fountain with its lit jets, the desert's
 * shrubs and its tumbleweed, the desert's red rocks (the mountains' rock in
 * the mesas' colours). Each is made once into a picture with clear pixels
 * round it, an ink line round it as the shops have, and drawn by the road
 * like the palms.
 */

import { INK_LINE, Painter } from './racing-paint'
import { PixelBuffer, rgbOf } from './pixels'

/** How tall each stands, in half widths of the road. */
export const SCENERY_HIGH = { pine: 3.1, rock: 1.5, saguaro: 2.5, butte: 4.6, shrub: 0.42, redrock: 1.7, crag: 1.7, tumbleweed: 0.42, tree: 2.3, fountain: 1.25 } as const

const made = new Map<string, PixelBuffer>()
const once = (key: string, make: () => PixelBuffer): PixelBuffer => { let p = made.get(key); if (!p) { p = make(); made.set(key, p) } return p }

/** A park's tree: its trunk, a round crown in three clumps, lit on one side; three kinds (`look`): green, darker, in pink blossom. */
export function treePicture(look: number): PixelBuffer {
  const k = ((look % 3) + 3) % 3
  return once(`tree|${k}`, () => {
    const p = new Painter(46, 62)
    const [dark, mid, lit] = k === 2 ? ['#b04a7a', '#e46aa0', '#ffa8cc'] : k === 1 ? ['#1c4a2c', '#2a6a3a', '#4a8a4a'] : ['#2a5a2a', '#3e8a3a', '#6ab04a']
    p.rect(20, 34, 6, 28, '#5a3a24'); p.rect(20, 34, 2, 28, '#7a5232')
    p.line(23, 44, 14, 34, 3, '#5a3a24'); p.line(23, 40, 32, 31, 3, '#5a3a24')
    for (const [x, y, r] of [[13, 30, 11], [33, 29, 11], [23, 18, 14]] as const) { p.disc(x, y, r, dark); p.disc(x - 2, y - 2, r * 0.75, mid); p.disc(x - 4, y - 4, r * 0.35, lit) }
    p.outline(INK_LINE)
    return p.pic
  })
}

/** A desert shrub: low clumps of grey-green and dry yellow. */
export function shrubPicture(): PixelBuffer {
  return once('shrub', () => {
    const p = new Painter(30, 16)
    for (const [x, y, r, c] of [[8, 11, 6, '#7a8a4a'], [21, 11, 6, '#8a9450'], [15, 8, 7, '#9aa458'], [11, 7, 3, '#c8c070'], [19, 6, 2.5, '#d8c878']] as const) p.disc(x, y, r, c)
    for (let x = 4; x < 27; x += 3) p.line(x, 15, x + (x % 2 ? 2 : -2), 9, 1, '#6a6a3a')
    p.outline(INK_LINE)
    return p.pic
  })
}

/** A tumbleweed: a ball of dry twigs, at one of four turns as it rolls. */
export function tumbleweedPicture(turn: number): PixelBuffer {
  const t = ((turn % 4) + 4) % 4
  return once(`weed|${t}`, () => {
    const p = new Painter(26, 26), cx = 13, cy = 13
    p.disc(cx, cy, 11, '#b8925a')
    p.disc(cx, cy, 8, '#a07a46')
    for (let k = 0; k < 9; k += 1) {
      const a = (k / 9) * Math.PI * 2 + t * 0.4, b = a + 2.2
      p.line(cx + Math.cos(a) * 11, cy + Math.sin(a) * 11, cx + Math.cos(b) * 9, cy + Math.sin(b) * 9, 1, k % 2 ? '#d8b478' : '#7a5a32')
    }
    p.disc(cx - 3, cy - 3, 2, '#d8b478')
    p.outline(INK_LINE)
    return p.pic
  })
}

/** The park's fountain: its round stone basin, its jets of water, lit from under after dark, at one of two moments. */
export function fountainPicture(frame: number, lit: boolean): PixelBuffer {
  const f = frame & 1
  return once(`fountain|${f}|${lit}`, () => {
    const p = new Painter(64, 52), water = lit ? '#7af0ff' : '#bfe8f4', spray = lit ? '#d8ffff' : '#f0fbff'
    // the jets: the middle one tall, two leaning out, the drops at their tops
    p.line(32, 40, 32, 6 + f * 2, 3, water)
    for (const side of [-1, 1]) { p.line(32 + side * 4, 40, 32 + side * 16, 14 + f * 2, 2, water); p.line(32 + side * 16, 14 + f * 2, 32 + side * 22, 26, 2, water) }
    for (const [x, y] of [[32, 4], [29, 7], [35, 7], [14, 16], [50, 16], [11, 24], [53, 24]] as const) p.disc(x + (f ? 1 : -1), y + f, 1.5, spray)
    // the basin: its rim, its water, its stone
    p.ellipse(32, 42, 30, 8, '#c8c0b8'); p.ellipse(32, 41, 27, 5.5, lit ? '#3ac8e8' : '#5ab0d0'); p.rect(4, 42, 56, 8, '#a8a098'); p.rect(4, 42, 56, 2, '#d8d0c8')
    for (let x = 8; x < 58; x += 8) p.rect(x, 44, 1, 6, '#888078')
    p.outline(INK_LINE)
    return p.pic
  })
}

/** The mountains' rock in the desert's red sandstone, its light and its shade kept: made once from the traced one. */
export function redRock(rock: PixelBuffer): PixelBuffer {
  return once('redrock', () => {
    const out = new PixelBuffer(rock.width, rock.height, '#000000')
    const ramp = ['#4a1c1c', '#7a2e26', '#a8462e', '#c85e38', '#e6844e', '#f4b078'].map(rgbOf)
    for (let i = 0; i < rock.data.length; i += 4) {
      out.data[i + 3] = rock.data[i + 3]
      if (!rock.data[i + 3]) continue
      const l = (0.3 * rock.data[i] + 0.59 * rock.data[i + 1] + 0.11 * rock.data[i + 2]) / 255
      const c = ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(l * ramp.length * 1.15)))]
      out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2]
    }
    return out
  })
}
