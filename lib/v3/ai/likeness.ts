/**
 * How much a video resembles one of the owner's likes: its fingerprint against
 * each liked video's, one by one, the nearest one kept.
 *
 * Not against a few averages of the likes. Measured on 5 October: 113 likes as
 * varied as Mexican banda, a metal live, a LEGO Super Bowl ad and a gothic belly
 * dance average into four vague centres, and by them the related videos of the
 * owner's own Dailymotion likes looked no closer than chance (3 %). Like by like,
 * 18 % of those were as close to a like as the stock's top 7 %.
 *
 * Which likes serve as models: those whose title says something. The model
 * reads the title (lib/v3/ai/bits.ts, textOf), so a like called "#tgiks" or
 * "Basket" resembles any hashtag soup or any short title, and three or four
 * such likes gave most of the false resemblances seen on 6 October. Reading
 * the tags and the channel too was measured that day: 7 points better at
 * finding the right like, 2.6 times slower — not taken.
 */

import { alike } from './bits'

/** As close to a like as the top 7 % of the stock is (0.698 measured on 5 October, 3,200 printed videos): "the same kind of thing". */
export const NEAR_LIKE = 0.7
/**
 * What the whole stock, read at random, must reach to join the pool of the likes' look-alikes (lib/discovery/wheel.ts): the
 * searches around a like bring topical videos, where 0.70 means the same kind; the stock brings anything, and at 0.70 one video
 * in thirteen passed, most of them nothing alike (6 October, 20,000 videos). At 0.75, one in a hundred, and half of them alike;
 * at 0.80 nearly all alike (LaserDisc players for the LaserDisc like, a 1973 Chevrolet ad for the Chevrolet ad).
 */
export const NEAR_POOL = 0.75
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

/** As near as the searches' finds must be, and not a copy. */
export const resemblesLike = (likeness: Likeness): boolean => likeness.index >= 0 && likeness.score >= NEAR_LIKE && likeness.score < LIKE_COPY
/** As near as a video of the stock must be to join the pool, and not a copy. */
export const joinsPool = (likeness: Likeness): boolean => likeness.index >= 0 && likeness.score >= NEAR_POOL && likeness.score < LIKE_COPY

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/gu
const HANGUL = /\p{Script=Hangul}/gu
/** Mostly written in Chinese, Japanese or Korean: the model reads the script as much as the sense there. */
export const mostlyCjk = (title: string): boolean => (title.match(CJK)?.length ?? 0) * 2 >= title.replace(/[\s\p{P}\p{S}\d]/gu, '').length
/**
 * The script a title is written in, when it is one the model confuses: a Japanese like drew Korean game streams at 0.83 and a
 * Vietnamese serial at 0.81 over the stock (6 October), the script more than the sense. Three characters tell; Japanese is any
 * kana, Korean any hangul, Chinese the rest.
 */
export type Script = 'ja' | 'ko' | 'zh' | 'other'
export function scriptOf(title: string): Script {
  const cjk = title.match(CJK)?.length ?? 0
  if (cjk < 3) return 'other'
  const kana = title.match(KANA)?.length ?? 0
  const hangul = title.match(HANGUL)?.length ?? 0
  if (hangul >= kana && hangul * 2 >= cjk) return 'ko'
  return kana ? 'ja' : 'zh'
}
/** A video and a like can only resemble each other in the same script: the model is not trusted across Chinese, Japanese and Korean. */
export const sameScript = (title: string, other: string): boolean => scriptOf(title) === scriptOf(other)
/** The nearest like among those written in the video's script. */
export function nearestLikeInScript(bits: Uint8Array, title: string, likes: readonly { bits: Uint8Array; title: string }[]): Likeness {
  const script = scriptOf(title)
  let score = 0, index = -1
  for (let at = 0; at < likes.length; at += 1) {
    if (scriptOf(likes[at].title) !== script) continue
    const value = alike(bits, likes[at].bits)
    if (value > score) { score = value; index = at }
  }
  return { score, index }
}
/**
 * A title says too little for the model below two words and fifteen letters ("Rocky", "basket" came in on the first trial;
 * "ANIMATION vidéo" drew anything on 6 October), or six characters in Chinese, Japanese or Korean, written without spaces.
 */
const MIN_TITLE_WORDS = 2
const MIN_TITLE_LETTERS = 15
const MIN_CJK_CHARACTERS = 6
/**
 * Enough for the model to read a meaning in — a hashtag is not a word, and a title whose hashtags weigh as much as its
 * words ("suara hantu pagi hari || #shorts #comedy") reads as the hashtags: every #shorts came near it (6 October).
 */
export function saysEnough(title: string): boolean {
  const tags = title.match(/[#@][\p{L}\p{N}_]+/gu) ?? []
  const bare = title.replace(/[#@][\p{L}\p{N}_]+/gu, ' ')
  const letters = bare.match(/\p{L}/gu)?.length ?? 0
  const tagLetters = tags.join('').match(/\p{L}/gu)?.length ?? 0
  if (tagLetters * 2 >= letters) return false
  if ((bare.match(CJK)?.length ?? 0) >= MIN_CJK_CHARACTERS) return true
  const words = bare.split(/\s+/).filter((word) => /\p{L}{2,}/u.test(word))
  return words.length >= MIN_TITLE_WORDS && letters >= MIN_TITLE_LETTERS
}
