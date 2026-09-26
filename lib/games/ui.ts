/**
 * The games' interface, drawn in the same pixels as the rest: the arcade
 * lettering of GAME OVER and PRESS START, the bar across the top in play,
 * the framed YES / NO choice, the pause button, and the cross of arrows a
 * phone plays with.
 */

import { dim, drawText, drawText7, glyph7, mix, PixelBuffer, text7Width, textWidth } from './pixels'
import { BURGER_PALETTE, MINI_BURGER } from './sprites'

export const CREAM = '#f8f5e6'
export const GREY = '#8a8a9a'
export const INK = '#0a0a14'
export const HUD_HEIGHT = 24

/**
 * Big arcade lettering: the 5×7 face enlarged, lit in bands from a
 * pale top to the accent at the foot, a dark outline round every letter
 * and a drop shadow under it.
 */
export function arcadeText(buffer: PixelBuffer, text: string, centre: number, y: number, scale: number, accent: string): number {
  const width = text7Width(text, scale)
  const x0 = Math.round(centre - width / 2)
  const bands = [mix(accent, CREAM, 0.88), mix(accent, CREAM, 0.72), mix(accent, CREAM, 0.5), mix(accent, CREAM, 0.3), accent, accent, dim(accent, 0.78)]
  const shadow = dim(accent, 0.3)
  const each = (fn: (px: number, py: number, row: number) => void) => {
    let cx = x0
    for (const char of text) {
      glyph7(char).forEach((line, row) => { for (let i = 0; i < line.length; i += 1) if (line[i] === '#') fn(cx + i * scale, y + row * scale, row) })
      cx += 6 * scale
    }
  }
  each((px, py) => buffer.rect(px - 1, py + 1, scale + 2, scale + 2 + Math.max(1, Math.round(scale / 2)), INK))
  each((px, py) => buffer.rect(px, py + Math.max(1, Math.round(scale / 2)), scale, scale, shadow))
  each((px, py) => buffer.rect(px - 1, py - 1, scale + 2, scale + 2, INK))
  each((px, py, row) => {
    buffer.rect(px, py, scale, scale, bands[row])
    // a light line across the top of each band of pixels, as on a lit marquee
    if (scale >= 3) buffer.rect(px, py, scale, 1, mix(bands[row], '#ffffff', 0.25))
  })
  return width
}

/** PRESS START with a dash either side, the dashes in the accent. */
export function pressStart(buffer: PixelBuffer, centre: number, y: number, accent: string, on: boolean): void {
  const text = 'PRESS START'
  const w = text7Width(text, 1)
  const x = Math.round(centre - w / 2)
  buffer.rect(x - 16, y + 3, 9, 2, accent)
  buffer.rect(x + w + 7, y + 3, 9, 2, accent)
  if (!on) return
  drawText7(buffer, text, x + 1, y + 1, INK)
  drawText7(buffer, text, x, y, CREAM)
}

/** A line of small grey labels and cream values, as a title screen shows the level and the best score. */
export function infoLine(buffer: PixelBuffer, x: number, y: number, label: string, value: string, align: 'left' | 'right' | 'centre' = 'left'): void {
  const w = textWidth(label) + 4 + text7Width(value)
  const left = align === 'left' ? x : align === 'right' ? x - w : Math.round(x - w / 2)
  drawText(buffer, label, left, y + 2, GREY)
  drawText7(buffer, value, left + textWidth(label) + 4, y, CREAM)
}

/** A framed button, its corners cut round; the chosen one is lit cream with a pointer before it. */
export function button(buffer: PixelBuffer, label: string, centre: number, y: number, accent: string, chosen: boolean, pointer = true): void {
  const tw = text7Width(label, 1, true)
  const w = tw + 14, h = 15
  const x = Math.round(centre - w / 2)
  const frame = chosen ? CREAM : dim(accent, 0.85)
  buffer.rect(x + 1, y + 1, w, h, INK)
  buffer.rect(x + 1, y, w - 2, h, chosen ? mix(accent, INK, 0.55) : INK)
  buffer.rect(x, y + 1, w, h - 2, chosen ? mix(accent, INK, 0.55) : INK)
  buffer.rect(x + 2, y, w - 4, 1, frame); buffer.rect(x + 2, y + h - 1, w - 4, 1, frame)
  buffer.rect(x, y + 2, 1, h - 4, frame); buffer.rect(x + w - 1, y + 2, 1, h - 4, frame)
  buffer.set(x + 1, y + 1, frame); buffer.set(x + w - 2, y + 1, frame); buffer.set(x + 1, y + h - 2, frame); buffer.set(x + w - 2, y + h - 2, frame)
  drawText7(buffer, label, x + 7, y + 4, chosen ? CREAM : dim(accent, 0.95), 1, true)
  if (chosen && pointer) drawText7(buffer, '>', x - 8, y + 4, CREAM)
}

/** The pause button: a small frame in the accent, two cream bars. */
export function pauseButton(buffer: PixelBuffer, x: number, y: number, accent: string): void {
  buffer.rect(x, y, 16, 16, accent)
  buffer.rect(x + 1, y + 1, 14, 14, INK)
  buffer.rect(x + 5, y + 4, 2, 8, CREAM)
  buffer.rect(x + 9, y + 4, 2, 8, CREAM)
}

/**
 * The bar across the top in play: the level on the left, the score in the
 * middle, then what the game counts on the right — CATCHER's lives as
 * little burgers, EATER's way to the next level as a gauge — and pause.
 */
export function hud(buffer: PixelBuffer, accent: string, info: { level: number; score: number; lives?: number; progress?: [number, number] }): void {
  const W = buffer.width
  buffer.rect(0, 0, W, HUD_HEIGHT, '#07070e')
  buffer.rect(0, HUD_HEIGHT - 1, W, 1, dim(accent, 0.55))
  drawText(buffer, 'LEVEL', 8, 3, GREY)
  drawText7(buffer, String(info.level).padStart(2, '0'), 8, 11, CREAM, 1, true)
  const scoreText = String(info.score).padStart(5, '0')
  drawText(buffer, 'SCORE', Math.round(W / 2 - textWidth('SCORE') / 2), 3, GREY)
  drawText7(buffer, scoreText, Math.round(W / 2 - text7Width(scoreText, 1, true) / 2), 11, CREAM, 1, true)
  pauseButton(buffer, W - 22, 4, accent)
  const right = W - 30
  if (info.lives !== undefined) {
    drawText(buffer, 'LIVES', right - textWidth('LIVES'), 3, GREY)
    for (let i = 0; i < info.lives; i += 1) buffer.blit(MINI_BURGER, right - 12 - i * 13, 11, BURGER_PALETTE)
  }
  if (info.progress) {
    const [have, need] = info.progress
    const barW = 46
    drawText(buffer, 'NEXT LEVEL', right - textWidth('NEXT LEVEL'), 3, GREY)
    const bx = right - barW
    buffer.rect(bx, 12, barW, 7, dim(accent, 0.35))
    buffer.rect(bx + 1, 13, barW - 2, 5, INK)
    buffer.rect(bx + 1, 13, Math.round(((barW - 2) * have) / need), 5, accent)
    buffer.rect(bx + 1, 13, Math.round(((barW - 2) * have) / need), 1, mix(accent, '#ffffff', 0.45))
    buffer.blit(MINI_BURGER, bx - 14, 11, BURGER_PALETTE)
  }
}

/** The cross of arrows under the board on a phone: a raised cross, each arm with its arrow, a dimple in the middle. */
export function dpad(buffer: PixelBuffer, cx: number, cy: number, arm: number, accent: string): void {
  const half = Math.floor(arm / 2)
  const base = '#262a3c', light = '#3c4260', dark = '#161826'
  const cross = (dx: number, dy: number, color: string) => {
    buffer.rect(cx - half + dx, cy - half - arm + dy, arm, arm * 3, color)
    buffer.rect(cx - half - arm + dx, cy - half + dy, arm * 3, arm, color)
  }
  cross(0, 3, INK)
  cross(-1, -1, dark); cross(1, 1, dark)
  cross(0, 0, base)
  buffer.rect(cx - half, cy - half - arm, arm, 1, light)
  buffer.rect(cx - half - arm, cy - half, arm, 1, light)
  buffer.rect(cx + half + 1, cy - half, arm - 1, 1, light)
  buffer.disc(cx + 0.5, cy + 0.5, arm * 0.28, dark)
  buffer.disc(cx + 0.5, cy + 0.5, arm * 0.14, dim(accent, 0.45))
  const tri = (ax: number, ay: number, dir: 'up' | 'down' | 'left' | 'right') => {
    for (let i = 0; i < 5; i += 1) {
      const len = 1 + i * 2
      if (dir === 'up') buffer.rect(ax - i, ay - 2 + i, len, 1, CREAM)
      if (dir === 'down') buffer.rect(ax - i, ay + 2 - i, len, 1, CREAM)
      if (dir === 'left') buffer.rect(ax - 2 + i, ay - i, 1, len, CREAM)
      if (dir === 'right') buffer.rect(ax + 2 - i, ay - i, 1, len, CREAM)
    }
  }
  tri(cx, cy - arm, 'up'); tri(cx, cy + arm, 'down'); tri(cx - arm, cy, 'left'); tri(cx + arm, cy, 'right')
}
