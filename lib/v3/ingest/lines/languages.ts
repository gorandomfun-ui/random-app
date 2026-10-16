/**
 * The languages of the world, asked of Dailymotion language by language (the owner, 16 October: "c'est plus la carte
 * monde globale qu'il faut réussir à varier", without more Asia, the Arab world or Turkey). The world card draws a
 * language at random (lib/discovery/wheel.ts), and the base held little of the languages written in Latin letters but
 * English and French — 895 Swedish videos, 543 Danish, 344 Finnish — the dig searching Dailymotion by subject.
 *
 * Here Dailymotion is asked for what its uploaders declare in one language: the most watched, a page deeper each run,
 * and the newest. A declaration is often wrong (a Turkish serial declared Finnish, 16 October): a title the detector
 * reads clearly in another language — English, French, Turkish, Portuguese, Arabic… — is refused. The detector does not
 * know Norwegian, Danish or Finnish (it read them Dutch and Ilocano), so it never has to agree, only not to contradict.
 * Then the drift's door, the week's cap per channel, the media windows, the player's word and the common door. Free, no
 * YouTube unit, no model: a few hundred a run, twice a day.
 */

import type { Document } from 'mongodb'

import { titleLanguage } from '../../../discovery/language'
import { languageDailymotion, playable } from '../../dig/dailymotion'
import { newGuardState, underWeeklyCap, withoutMedia } from '../../dig/guards'
import type { DigVideo } from '../../dig/video'
import { addAdmission, type LineContext, type LineResult } from '../context'
import { emptyCounters } from '../journal'
import { driftDoor } from './drift'

/**
 * The languages asked: the scarce ones of the base, written in Latin letters, Cyrillic or Greek — never Asia's, Arabic,
 * Turkish, nor Portuguese (Brazil's share); German, Italian, Spanish and Russian the base already holds by thousands.
 */
export const LANGUAGES = ['sv', 'no', 'da', 'fi', 'is', 'nl', 'pl', 'cs', 'sk', 'hu', 'ro', 'el', 'bg', 'hr', 'sr', 'sl', 'uk', 'lt', 'lv', 'et', 'ca'] as const
/** What one run lets in at most, every language together: two runs a day. */
export const PER_RUN = Number(process.env.RANDOM_LANGUAGES_PER_RUN ?? 500)
/** Pages of the most watched read in turn, one a run: Dailymotion serves the first thousand results. */
const VISITED_PAGES = 10
/** The player asked a run at most: never a video let in unasked. */
const MAX_PLAYABLE_CHECKS = 800
const SPACING_MS = 250
const DEADLINE_MARGIN_MS = 60_000
const META = 'dig_meta_v4'
const CURSOR_ID = 'languages'

/** The languages the detector reads well enough on a title to tell a declaration wrong. */
const CLEARLY_OTHER = new Set(['eng', 'fra', 'tur', 'por', 'arb', 'pes', 'urd', 'hin', 'ben', 'ind', 'zlm', 'vie', 'tha', 'tgl', 'ceb', 'jav', 'sun', 'cmn', 'jpn', 'kor', 'spa', 'rus', 'deu', 'ita'])
/** What the detector may read for a language without contradicting it: its kin, which it mistakes for one another. */
const KIN: Readonly<Record<string, readonly string[]>> = {
  ca: ['spa', 'ita', 'por'], ro: ['ita', 'spa'], uk: ['rus'], bg: ['rus'], sr: ['rus'], hr: ['ita'], sl: ['ita'],
}

/** The alphabets each language is written in; a title in another one contradicts the declaration. */
const CYRILLIC = /\p{Script=Cyrillic}/u
const GREEK = /\p{Script=Greek}/u
const FAR_SCRIPTS = /\p{Script=Arabic}|\p{Script=Hebrew}|\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}|\p{Script=Thai}|\p{Script=Devanagari}|\p{Script=Bengali}|\p{Script=Tamil}/u
const CYRILLIC_LANGUAGES = new Set(['bg', 'sr', 'uk'])
/**
 * Turkish, which the detector misses on serials ("Eşref Rüya 37. Bölüm" read as Lingala, 16 October): the letters only
 * Turkish writes, and the words of a serial's episode.
 */
const TURKISH = /[ığ]|İ|\b(?:bölüm|bolum|izle|fragmanı|tek parça)\b/iu

/** A title that says it is in another language than the one declared: its alphabet, Turkish's marks, or the detector's clear reading. */
export function contradicts(declared: string, title: string): boolean {
  if (FAR_SCRIPTS.test(title)) return true
  if (CYRILLIC.test(title) && !CYRILLIC_LANGUAGES.has(declared)) return true
  if (GREEK.test(title) && declared !== 'el') return true
  if (TURKISH.test(title)) return true
  const read = titleLanguage(title)
  if (!read || !CLEARLY_OTHER.has(read)) return false
  return !(KIN[declared] ?? []).includes(read)
}

export type LanguagesCursor = { pages: Record<string, number>; note: string }

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
function shuffle<T>(list: readonly T[]): T[] {
  const out = [...list]
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[out[index], out[other]] = [out[other], out[index]]
  }
  return out
}

export async function run(ctx: LineContext): Promise<LineResult> {
  const http = ctx.http ?? fetch
  const counters = emptyCounters()
  const errors: string[] = []
  const guards = newGuardState()
  const meta = ctx.db.collection(META)
  const previous = (ctx.cursor ?? await meta.findOne({ _id: CURSOR_ID } as Document, { maxTimeMS: 4000 }).catch(() => null) ?? {}) as Partial<LanguagesCursor>
  const pages: Record<string, number> = { ...(previous.pages ?? {}) }
  // Each language's share of the run, twice over in candidates: some are known already.
  const share = Math.max(1, Math.ceil(PER_RUN / LANGUAGES.length))
  const seen = new Set<string>()
  const byLanguage: Record<string, number> = {}
  let checks = 0

  // In a new order each run, so that a short run does not always miss the same languages.
  for (const language of shuffle(LANGUAGES)) {
    if (counters.inserted >= PER_RUN || checks >= MAX_PLAYABLE_CHECKS || ctx.timeLeft() < DEADLINE_MARGIN_MS) break
    const page = ((pages[language] ?? 0) % VISITED_PAGES) + 1
    const found: DigVideo[] = []
    for (const [sort, at] of [['visited', page], ['recent', 1]] as const) {
      try { found.push(...await languageDailymotion(language, sort, http, at)) } catch (error) { errors.push(`${language} ${sort} : ${message(error)}`) }
      await wait(SPACING_MS)
    }
    pages[language] = page
    const fresh = found.filter((video) => !seen.has(video.videoId))
    for (const video of fresh) seen.add(video.videoId)
    const agreeing = fresh.filter((video) => !contradicts(language, video.title))
    const door = driftDoor(agreeing)
    if (fresh.length > agreeing.length) door.refused['langue contredite par le titre'] = fresh.length - agreeing.length
    const weekly = await underWeeklyCap(ctx, guards, door.kept, 'dailymotion', new Set())
    if (weekly.refused) door.refused['chaîne cette semaine'] = weekly.refused
    const media = await withoutMedia(ctx, guards, '', weekly.kept, 'dailymotion', new Set())
    if (media.refused) door.refused['média'] = media.refused
    const playing: DigVideo[] = []
    for (const video of media.kept.slice(0, share * 2)) {
      if (checks >= MAX_PLAYABLE_CHECKS || ctx.timeLeft() < DEADLINE_MARGIN_MS) break
      checks += 1
      // The language its uploader declared is the one asked: kept on the video, the world card draws by it.
      if (await playable(video.videoId, http)) playing.push({ ...video, declaredLang: video.declaredLang ?? language })
      else door.refused['ne se lit pas'] = (door.refused['ne se lit pas'] ?? 0) + 1
    }
    try {
      const result = await ctx.admit({ subjectId: `languages:${language}`, videos: playing })
      addAdmission(counters, { ...result, scanned: found.length, rejected: { ...result.rejected, ...door.refused } })
      counters.byProvider = { ...(counters.byProvider ?? {}), dailymotion: ((counters.byProvider ?? {}).dailymotion ?? 0) + result.inserted }
      if (result.inserted) byLanguage[language] = result.inserted
      await ctx.search({ provider: 'dailymotion', query: `langue ${language} (les plus vues page ${page}, les plus récentes)`, scanned: found.length, kept: playing.length, inserted: result.inserted, duplicates: result.duplicates, rejected: { ...result.rejected, ...door.refused }, quotaUnits: 0, insertedIds: result.insertedIds }).catch(() => undefined)
    } catch (error) {
      errors.push(`admission ${language} : ${message(error)}`)
    }
  }

  if (!ctx.dryRun) await meta.updateOne({ _id: CURSOR_ID } as Document, { $set: { pages, at: new Date() } }, { upsert: true }).catch((error) => { errors.push(`place : ${message(error)}`) })
  const detail = Object.entries(byLanguage).sort((a, b) => b[1] - a[1]).map(([language, n]) => `${language} ${n}`).join(' · ')
  const note = `${counters.inserted} entrées${detail ? ` (${detail})` : ''} · ${seen.size} vidéos lues · ${checks} lecteurs demandés`
  ctx.log(`langues : ${note}`)
  return { counters, errors, cursor: { pages, note } satisfies LanguagesCursor }
}
