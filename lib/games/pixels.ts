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
