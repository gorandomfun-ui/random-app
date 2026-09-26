/**
 * The pixel toolkit of the games: a buffer of pixels, sprites written as
 * rows of characters, a palette that maps a character to a colour, and a
 * small font drawn here — no image file, no licence, a few kilobytes.
 * The same code draws on a canvas in the browser and into a PNG on the
 * server, so the mock, the report and the game share one picture.
 */

export type Sprite = readonly string[]
/** A character of a sprite → a colour, '#rrggbb'; a character not in the palette is transparent. */
export type Palette = Record<string, string>

export function spriteSize(sprite: Sprite): { width: number; height: number } {
  return { width: sprite.reduce((max, row) => Math.max(max, row.length), 0), height: sprite.length }
}

/** The sprite turned by quarter turns clockwise (1 = 90° clockwise, 3 = 90° counter-clockwise). */
export function rotateSprite(sprite: Sprite, turns: number): Sprite {
  let rows = sprite.map((row) => row.split(''))
  for (let t = 0; t < ((turns % 4) + 4) % 4; t += 1) {
    const h = rows.length, w = rows[0]?.length ?? 0
    const next: string[][] = Array.from({ length: w }, () => Array.from({ length: h }, () => '.'))
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) next[x][h - 1 - y] = rows[y][x]
    rows = next
  }
  return rows.map((row) => row.join(''))
}

/** The sprite mirrored left to right. */
export function flipSprite(sprite: Sprite): Sprite {
  return sprite.map((row) => row.split('').reverse().join(''))
}

const hexCache = new Map<string, [number, number, number]>()
export function rgbOf(color: string): [number, number, number] {
  const cached = hexCache.get(color)
  if (cached) return cached
  const hex = color.replace('#', '')
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
  const rgb: [number, number, number] = [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
  hexCache.set(color, rgb)
  return rgb
}

/** The 4×4 ordered-dither threshold: a pixel takes the next shade when `t` passes it — smooth gradients in flat pixels. */
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
export const dither = (x: number, y: number, t: number): boolean => t * 16 > BAYER[((y % 4) + 4) % 4][((x % 4) + 4) % 4] + 0.5

/** Two colours mixed: `t` = 0 gives `a`, 1 gives `b`. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = rgbOf(a), [br, bg, bb] = rgbOf(b)
  return `#${[ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`
}

/** A colour dimmed to a fraction of itself. */
export function dim(color: string, factor: number): string {
  return `#${rgbOf(color).map((c) => Math.min(255, Math.round(c * factor)).toString(16).padStart(2, '0')).join('')}`
}

/** A picture, one byte per channel; black and opaque to start with. */
export class PixelBuffer {
  readonly data: Uint8ClampedArray
  constructor(readonly width: number, readonly height: number, fill = '#000000') {
    this.data = new Uint8ClampedArray(width * height * 4)
    this.clear(fill)
  }

  clear(color: string): void {
    const [r, g, b] = rgbOf(color)
    for (let i = 0; i < this.data.length; i += 4) { this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = 255 }
  }

  set(x: number, y: number, color: string): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    const [r, g, b] = rgbOf(color)
    const o = (y * this.width + x) * 4
    this.data[o] = r; this.data[o + 1] = g; this.data[o + 2] = b; this.data[o + 3] = 255
  }

  get(x: number, y: number): [number, number, number] {
    const o = (y * this.width + x) * 4
    return [this.data[o], this.data[o + 1], this.data[o + 2]]
  }

  rect(x: number, y: number, width: number, height: number, color: string): void {
    for (let yy = y; yy < y + height; yy += 1) for (let xx = x; xx < x + width; xx += 1) this.set(xx, yy, color)
  }

  /** A filled disc, centre and radius in pixels. */
  disc(cx: number, cy: number, r: number, color: string): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y += 1) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x += 1) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.set(x, y, color)
  }

  /** A filled polygon, points in pixels, filled by rows (a pixel is in when its centre is). */
  poly(points: ReadonlyArray<readonly [number, number]>, color: string): void {
    const ys = points.map(([, y]) => y)
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y += 1) {
      const cy = y + 0.5
      const xs: number[] = []
      for (let i = 0; i < points.length; i += 1) {
        const [ax, ay] = points[i], [bx, by] = points[(i + 1) % points.length]
        if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) xs.push(ax + ((cy - ay) / (by - ay)) * (bx - ax))
      }
      xs.sort((a, b) => a - b)
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.ceil(xs[i] - 0.5); x < Math.ceil(xs[i + 1] - 0.5); x += 1) this.set(x, y, color)
    }
  }

  /** A straight line one pixel wide. */
  line(x0: number, y0: number, x1: number, y1: number, color: string): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
    for (let i = 0; i <= steps; i += 1) this.set(Math.round(x0 + ((x1 - x0) * i) / steps), Math.round(y0 + ((y1 - y0) * i) / steps), color)
  }

  /** The colour under a pixel, as '#rrggbb'. */
  hex(x: number, y: number): string {
    const [r, g, b] = this.get(Math.max(0, Math.min(this.width - 1, x)), Math.max(0, Math.min(this.height - 1, y)))
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
  }

  /** A pixel mixed toward a colour by `t`, as light falling on it. */
  tint(x: number, y: number, color: string, t: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    this.set(x, y, mix(this.hex(x, y), color, t))
  }

  /** Every pixel of a rectangle dimmed to a fraction of itself: a shadow, a night falling. */
  shade(x: number, y: number, width: number, height: number, factor: number): void {
    for (let yy = Math.max(0, y); yy < Math.min(this.height, y + height); yy += 1) for (let xx = Math.max(0, x); xx < Math.min(this.width, x + width); xx += 1) {
      const o = (yy * this.width + xx) * 4
      this.data[o] = Math.round(this.data[o] * factor); this.data[o + 1] = Math.round(this.data[o + 1] * factor); this.data[o + 2] = Math.round(this.data[o + 2] * factor)
    }
  }

  /** Draws a sprite with its palette; `flipX` mirrors it, `scale` enlarges each pixel. */
  blit(sprite: Sprite, x: number, y: number, palette: Palette, options: { flipX?: boolean; scale?: number } = {}): void {
    const scale = options.scale ?? 1
    const { width } = spriteSize(sprite)
    sprite.forEach((row, sy) => {
      for (let sx = 0; sx < row.length; sx += 1) {
        const color = palette[row[sx]]
        if (!color) continue
        const px = options.flipX ? width - 1 - sx : sx
        this.rect(x + px * scale, y + sy * scale, scale, scale, color)
      }
    })
  }

  /** Copies another buffer onto this one at `x`, `y`, leaving out the pixels of the `key` colour. */
  stamp(other: PixelBuffer, x: number, y: number, key: string): void {
    const [kr, kg, kb] = rgbOf(key)
    for (let yy = 0; yy < other.height; yy += 1) {
      const ty = y + yy
      if (ty < 0 || ty >= this.height) continue
      for (let xx = 0; xx < other.width; xx += 1) {
        const tx = x + xx
        if (tx < 0 || tx >= this.width) continue
        const o = (yy * other.width + xx) * 4
        if (other.data[o] === kr && other.data[o + 1] === kg && other.data[o + 2] === kb) continue
        const t = (ty * this.width + tx) * 4
        this.data[t] = other.data[o]; this.data[t + 1] = other.data[o + 1]; this.data[t + 2] = other.data[o + 2]; this.data[t + 3] = 255
      }
    }
  }

  /** How many pixels are not the given colour: a test's way to know something was drawn. */
  countNot(color: string): number {
    const [r, g, b] = rgbOf(color)
    let n = 0
    for (let i = 0; i < this.data.length; i += 4) if (this.data[i] !== r || this.data[i + 1] !== g || this.data[i + 2] !== b) n += 1
    return n
  }
}

/** A 3×5 font, drawn here: capitals, digits and the few signs a HUD needs. */
export const FONT: Record<string, Sprite> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'], D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'], G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'], J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['#.#', '###', '###', '###', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'], P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '.#.', '..#'], R: ['##.', '#.#', '##.', '#.#', '#.#'], S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'], V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'], '2': ['##.', '..#', '.#.', '#..', '###'], '3': ['##.', '..#', '.#.', '..#', '##.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '##.', '..#', '##.'], '6': ['.##', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'], '9': ['###', '#.#', '###', '..#', '##.'],
  ' ': ['...', '...', '...', '...', '...'], '.': ['...', '...', '...', '...', '.#.'], '-': ['...', '...', '###', '...', '...'], ':': ['...', '.#.', '...', '.#.', '...'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'], '?': ['##.', '..#', '.#.', '...', '.#.'], '/': ['..#', '..#', '.#.', '#..', '#..'], '>': ['#..', '.#.', '..#', '.#.', '#..'],
  '<': ['..#', '.#.', '#..', '.#.', '..#'], 'É': ['###', '#..', '##.', '#..', '###'], 'È': ['###', '#..', '##.', '#..', '###'],
  '♥': ['#.#', '###', '###', '.#.', '...'],
}

/** Draws text in the 3×5 font, one pixel between letters; returns the width used. */
export function drawText(buffer: PixelBuffer, text: string, x: number, y: number, color: string, scale = 1): number {
  let cursor = x
  for (const raw of text.toUpperCase()) {
    const glyph = FONT[raw] ?? FONT['?']
    buffer.blit(glyph, cursor, y, { '#': color }, { scale })
    cursor += 4 * scale
  }
  return cursor - x - scale
}

export function textWidth(text: string, scale = 1): number {
  return text.length * 4 * scale - scale
}

export function drawTextCentered(buffer: PixelBuffer, text: string, y: number, color: string, scale = 1): void {
  drawText(buffer, text, Math.floor((buffer.width - textWidth(text, scale)) / 2), y, color, scale)
}

/**
 * A 5×7 font, drawn here too: the games' interface voice — the HUD, the
 * buttons, PRESS START, GAME OVER. `bold` doubles each stroke sideways,
 * the way arcade titles thicken a thin face.
 */
export const FONT7: Record<string, Sprite> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'], B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'], D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'], F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#..##', '#...#', '#...#', '.###.'], H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'], J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'], L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'], N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'], R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'], T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'], X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'], Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'], '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'], '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'], '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'], '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'], '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'], '.': ['.....', '.....', '.....', '.....', '.....', '.....', '..#..'],
  ':': ['.....', '..#..', '.....', '.....', '.....', '..#..', '.....'], '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'], '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'], '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
  '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'], "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
  '×': ['.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '.....'],
}

/** How wide a text is in the 5×7 font: letters of five (six when bold), one pixel apart, times the scale. */
export function text7Width(text: string, scale = 1, bold = false): number {
  return text.length === 0 ? 0 : (text.length * ((bold ? 6 : 5) + 1) - 1) * scale
}

/** The glyph of a letter in the 5×7 font, thickened sideways when `bold`. */
export function glyph7(char: string, bold = false): Sprite {
  const glyph = FONT7[char.toUpperCase()] ?? FONT7['?']
  if (!bold) return glyph
  return glyph.map((row) => row.split('').map((c, i) => (c === '#' || row[i - 1] === '#' ? '#' : '.')).join('') + (row[4] === '#' ? '#' : '.'))
}

/** Draws text in the 5×7 font; returns the width used. */
export function drawText7(buffer: PixelBuffer, text: string, x: number, y: number, color: string, scale = 1, bold = false): number {
  let cursor = x
  for (const char of text) {
    buffer.blit(glyph7(char, bold), cursor, y, { '#': color }, { scale })
    cursor += ((bold ? 6 : 5) + 1) * scale
  }
  return text7Width(text, scale, bold)
}

export function drawText7Centered(buffer: PixelBuffer, text: string, y: number, color: string, scale = 1, bold = false, centre = buffer.width / 2): void {
  drawText7(buffer, text, Math.round(centre - text7Width(text, scale, bold) / 2), y, color, scale, bold)
}

/**
 * A sprite at twice the size with its diagonals smoothed (the classic
 * edge-doubling rule for pixel art): each pixel becomes four, and a corner
 * takes the colour of its two neighbours when they agree. Same drawing,
 * finer steps — the title screens' version of the play sprites.
 */
export function scale2x(sprite: Sprite): Sprite {
  const h = sprite.length, w = spriteSize(sprite).width
  const at = (x: number, y: number) => sprite[Math.max(0, Math.min(h - 1, y))][Math.max(0, Math.min(w - 1, x))] ?? '.'
  const out: string[][] = Array.from({ length: h * 2 }, () => Array.from({ length: w * 2 }, () => '.'))
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const p = at(x, y), a = at(x, y - 1), b = at(x + 1, y), c = at(x - 1, y), d = at(x, y + 1)
    let e0 = p, e1 = p, e2 = p, e3 = p
    if (c === a && c !== d && a !== b) e0 = a
    if (a === b && a !== c && b !== d) e1 = b
    if (d === c && d !== b && c !== a) e2 = c
    if (b === d && b !== a && d !== c) e3 = d
    out[y * 2][x * 2] = e0; out[y * 2][x * 2 + 1] = e1; out[y * 2 + 1][x * 2] = e2; out[y * 2 + 1][x * 2 + 1] = e3
  }
  return out.map((row) => row.join(''))
}
