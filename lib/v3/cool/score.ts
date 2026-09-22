/**
 * The rhythm of cool and random: a score, read position by position on the
 * visuals of a session.
 *
 * Only videos and images count. Texts, quizzes and sites keep their place
 * in the format cycle (`lib/random/sequence.ts`) without moving the score.
 *
 *   Accroche  : C10 R2  C6 R2  C4 R2
 *   Bascule   : C1 R3   C1 R6  C1 R10
 *   Lâcher    : R30-40
 *   Croisière : C6 R2  C3 R2  C1 R2  R30-40   ← répété jusqu'à la fin de la session
 *
 * C = cool, R = random. A "30-40" block draws its length once, between 30
 * and 40, with the session's seed: reloading the page mid-session finds the
 * same score. Hook hard, let go on pure chance, come back softer.
 *
 * `NEXT_PUBLIC_RANDOM_COOL_SCORE` replaces the score without code, in the
 * same notation, the repeated part after a "|":
 *   "C10 R2 C6 R2 C4 R2 C1 R3 C1 R6 C1 R10 R30-40 | C6 R2 C3 R2 C1 R2 R30-40"
 * The page and the server both read the score, so the setting has to reach
 * the browser — hence the NEXT_PUBLIC_ prefix; a new deployment applies it.
 * A setting that does not parse leaves the default in place.
 */

import { hash, seeded } from '@/lib/discovery/random'

export type Beat = 'cool' | 'random'
/** So many visuals of one kind; a span ("30-40") is drawn once per block. */
export type Block = { beat: Beat; min: number; max: number }
export type Score = { intro: Block[]; loop: Block[] }

const C = (count: number): Block => ({ beat: 'cool', min: count, max: count })
const R = (min: number, max = min): Block => ({ beat: 'random', min, max })

export const DEFAULT_SCORE: Score = {
  intro: [
    // Accroche : dix cool d'entrée, puis six, puis quatre, deux randoms entre chaque.
    C(10), R(2), C(6), R(2), C(4), R(2),
    // Bascule : un cool, et de plus en plus de random entre deux.
    C(1), R(3), C(1), R(6), C(1), R(10),
    // Lâcher : du hasard pur.
    R(30, 40),
  ],
  // Croisière : une reprise plus douce, puis le hasard, jusqu'à la fin de la session.
  loop: [C(6), R(2), C(3), R(2), C(1), R(2), R(30, 40)],
}
export const DEFAULT_SCORE_TEXT = 'C10 R2 C6 R2 C4 R2 C1 R3 C1 R6 C1 R10 R30-40 | C6 R2 C3 R2 C1 R2 R30-40'

const MAX_BLOCK = 500

/** "C10 R2 … | C6 R2 …": the part before the bar is played once, the part after it repeats. Null when it does not read. */
export function parseScore(text: string): Score | null {
  const parts = text.split('|')
  if (parts.length > 2) return null
  const blocks = (part: string): Block[] | null => {
    const out: Block[] = []
    for (const token of part.trim().split(/\s+/).filter(Boolean)) {
      const match = /^([cr])(\d{1,3})(?:-(\d{1,3}))?$/i.exec(token)
      if (!match) return null
      const min = Number(match[2])
      const max = match[3] === undefined ? min : Number(match[3])
      if (min < 1 || max < min || max > MAX_BLOCK) return null
      out.push({ beat: match[1].toLowerCase() === 'c' ? 'cool' : 'random', min, max })
    }
    return out
  }
  const intro = parts.length === 2 ? blocks(parts[0]) : []
  const loop = blocks(parts[parts.length - 1])
  if (!intro || !loop || !loop.length) return null
  return { intro, loop }
}

/** The score in force: the setting when it reads, else the default. */
export function coolScore(setting: string | undefined = process.env.NEXT_PUBLIC_RANDOM_COOL_SCORE): Score {
  if (!setting?.trim()) return DEFAULT_SCORE
  return parseScore(setting) ?? DEFAULT_SCORE
}

/** The length of a block: fixed, or drawn once with the seed when the block has a span. */
function lengthOf(seed: number, ordinal: number, block: Block): number {
  if (block.min === block.max) return block.min
  return block.min + Math.floor(seeded(hash(`${seed}:score:${ordinal}`))() * (block.max - block.min + 1))
}

/** Cool or random for the visual at `index` (from 0) of a session's rhythm. */
export function beatAt(seed: number, index: number, score: Score = coolScore()): Beat {
  if (!score.loop.some((block) => block.min > 0)) return 'random'
  const at = Math.max(0, Math.floor(index))
  let position = 0
  let ordinal = 0
  for (const block of score.intro) {
    position += lengthOf(seed, ordinal, block)
    ordinal += 1
    if (at < position) return block.beat
  }
  for (;;) {
    for (const block of score.loop) {
      position += lengthOf(seed, ordinal, block)
      ordinal += 1
      if (at < position) return block.beat
    }
  }
}

/** The beats of a session's first `count` visuals, for a test or a report. */
export function beats(seed: number, count: number, score: Score = coolScore()): Beat[] {
  return Array.from({ length: count }, (_, index) => beatAt(seed, index, score))
}
