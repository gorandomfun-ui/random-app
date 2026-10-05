/**
 * How much a video resembles one of the owner's likes: its fingerprint against
 * each liked video's, one by one, the nearest one kept.
 *
 * Not against a few averages of the likes. Measured on 5 October: 113 likes as
 * varied as Mexican banda, a metal live, a LEGO Super Bowl ad and a gothic belly
 * dance average into four vague centres, and by them the related videos of the
 * owner's own Dailymotion likes looked no closer than chance (3 %). Like by like,
 * 18 % of those were as close to a like as the stock's top 7 %.
 */

import { alike } from './bits'

/** As close to a like as the top 7 % of the stock is (0.698 measured on 5 October, 3,200 printed videos): "the same kind of thing". */
export const NEAR_LIKE = 0.7
/** Past this, it is the liked video itself or a copy of it (a re-upload reads 0.97): not a find. */
export const LIKE_COPY = 0.95

export type Likeness = { score: number; index: number }

/** The nearest like and how near, out of the likes' fingerprints; index -1 when there are none. */
export function nearestLike(bits: Uint8Array, likes: readonly Uint8Array[]): Likeness {
  let score = 0, index = -1
  for (let at = 0; at < likes.length; at += 1) {
    const value = alike(bits, likes[at])
    if (value > score) { score = value; index = at }
  }
  return { score, index }
}

/** A find: near a like, not a copy of it. */
export const resemblesLike = (likeness: Likeness): boolean => likeness.index >= 0 && likeness.score >= NEAR_LIKE && likeness.score < LIKE_COPY
