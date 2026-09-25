/**
 * The authors line: going back to the people whose work was liked.
 *
 * Every other line looks for words. This one looks for people. A video that
 * passed the filters and that someone liked was made by someone who keeps
 * publishing, and that is the nearest thing we have to the way a feed of shared
 * clips stays interesting: it follows people, not keywords.
 *
 * It is deliberately timid. `authors/pick.ts` holds the restraint: never more
 * than a ceiling from one author however much they publish, a small take per
 * pass, the least known first, and a refusal to swallow a run of videos that
 * are the same video with another number. A channel of fifty thousand tutorials
 * gives two.
 *
 * It costs almost nothing: two units for a YouTube author, none at all for a
 * Dailymotion one, where a single search costs a hundred.
 */

import { readPoolZones } from '../../cool/likePool'
import { dailymotionAuthorVideos, youtubeAuthorVideos, YOUTUBE_AUTHOR_UNITS } from '../../authors/fetch'
import { keepFromAuthor, pickAuthors, TAKE_PER_PASS, type AuthorZone } from '../../authors/pick'
import { isCleanTitle } from '../../cool/clean'
import { addAdmission, type LineContext, type LineResult } from '../context'
import { emptyCounters } from '../journal'

const DEADLINE_MARGIN_MS = 20_000
/** Dailymotion takes a few calls a second; this keeps a pass well under. */
const SPACING_MS = 300
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export type AuthorsCursor = { visited: number; note: string }

export async function run(ctx: LineContext): Promise<LineResult> {
  const http = ctx.http ?? fetch
  const counters = emptyCounters()
  const errors: string[] = []
  const apiKey = (process.env.YOUTUBE_API_KEY || '').trim()

  const zones = await readPoolZones(ctx.db).catch((error) => {
    errors.push(`zones : ${message(error)}`)
    return [] as Array<{ kind: string; key: string; video: number; likeIds: string[] }>
  })
  const authors = zones.filter((zone) => zone.kind === 'author') as AuthorZone[]
  const visits = pickAuthors(authors)
  ctx.log(`${authors.length} auteurs aimés, ${visits.length} visités ce soir`)

  let visited = 0
  let skippedForQuota = 0
  for (const visit of visits) {
    if (ctx.timeLeft() < DEADLINE_MARGIN_MS) break
    try {
      let videos
      if (visit.provider === 'youtube') {
        if (!apiKey) { skippedForQuota += 1; continue }
        // The budget belongs to every line; an author is never worth taking it from a search.
        if (!(await ctx.quota.reserve(YOUTUBE_AUTHOR_UNITS))) { skippedForQuota += 1; continue }
        videos = await youtubeAuthorVideos(apiKey, visit.id, TAKE_PER_PASS * 3, http)
      } else {
        videos = await dailymotionAuthorVideos(visit.id, TAKE_PER_PASS * 3, http)
      }
      const clean = videos.filter((video) => isCleanTitle(video.title ?? ''))
      const kept = keepFromAuthor(clean, visit.room)
      const result = await ctx.admit({ subjectId: `author:${visit.key}`, videos: kept })
      addAdmission(counters, {
        ...result,
        scanned: videos.length,
        rejected: { ...result.rejected, ...(videos.length - kept.length ? { 'same-author-shape': videos.length - kept.length } : {}) },
      })
      await ctx.search({
        provider: visit.provider, query: `auteur ${visit.key}`, scanned: videos.length, kept: kept.length,
        inserted: result.inserted, duplicates: result.duplicates, rejected: result.rejected,
        quotaUnits: visit.provider === 'youtube' ? YOUTUBE_AUTHOR_UNITS : 0, insertedIds: result.insertedIds,
      })
      visited += 1
    } catch (error) {
      errors.push(`auteur ${visit.key} : ${message(error)}`)
    }
    await wait(SPACING_MS)
  }

  const note = `${visited} auteurs suivis · ${counters.inserted} entrées${skippedForQuota ? ` · ${skippedForQuota} reportés faute de budget` : ''}`
  ctx.log(note)
  return { counters, errors, cursor: { visited, note } satisfies AuthorsCursor }
}
