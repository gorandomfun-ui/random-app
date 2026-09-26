/**
 * The engine both games share, kept apart from the page: a fixed-step
 * clock (the rules move sixty times a second whatever the screen's own
 * rate), the directions the player asks for (keys, a swipe, the cross of
 * arrows), and a seeded random so a game can be played again the same way
 * in a test.
 */

import type { Direction } from './sprites'

export const STEP_MS = 1000 / 60
/** A slow frame never makes the rules run more than this many steps at once. */
export const MAX_STEPS = 6

/**
 * The fixed-step clock: time from the screen goes in, whole steps of the
 * rules come out; what is left over waits for the next frame. The same
 * inputs at the same steps give the same game, at 30, 60 or 120 frames a
 * second.
 */
export class FixedClock {
  private spare = 0
  advance(elapsedMs: number, step: () => void): number {
    this.spare = Math.min(this.spare + Math.max(0, elapsedMs), STEP_MS * MAX_STEPS)
    let steps = 0
    // a hair of tolerance, so rounding in the frame times never costs a step
    while (this.spare >= STEP_MS - 1e-6) { this.spare = Math.max(0, this.spare - STEP_MS); step(); steps += 1 }
    return steps
  }
  reset(): void { this.spare = 0 }
}

/** A small seeded random: the same seed, the same game. */
export function seeded(seed: number): () => number {
  let s = (seed >>> 0) || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 0x100000000
  }
}

export const DIRS: readonly Direction[] = ['up', 'right', 'down', 'left']
export const DELTA: Record<Direction, readonly [number, number]> = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] }
export const REVERSE: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' }

/** The keys that steer: arrows, WASD and ZQSD. */
export function keyDirection(key: string): Direction | null {
  switch (key) {
    case 'ArrowUp': case 'w': case 'W': case 'z': case 'Z': return 'up'
    case 'ArrowDown': case 's': case 'S': return 'down'
    case 'ArrowLeft': case 'a': case 'A': case 'q': case 'Q': return 'left'
    case 'ArrowRight': case 'd': case 'D': return 'right'
    default: return null
  }
}

/** A swipe as a direction, once the finger has travelled far enough to mean it. */
export function swipeDirection(dx: number, dy: number, threshold = 24): Direction | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return null
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
}

/** Which arm of the cross of arrows a point falls on, the cross centred at `cx`, `cy` with arms `arm` wide. */
export function dpadDirection(x: number, y: number, cx: number, cy: number, arm: number): Direction | null {
  const dx = x - cx, dy = y - cy
  const reach = arm * 1.9
  if (Math.abs(dx) > reach || Math.abs(dy) > reach) return null
  if (Math.abs(dx) < arm * 0.35 && Math.abs(dy) < arm * 0.35) return null
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
}

/** Daytime on the device's clock: seven in the morning to seven in the evening. */
export const isDaytime = (date = new Date()): boolean => date.getHours() >= 7 && date.getHours() < 19
