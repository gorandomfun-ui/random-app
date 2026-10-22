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
 *
 * Since 22 October it follows the small authors only (`SMALL_AUTHOR_MAX`, two
 * hundred videos on their channel): the owner turned it back on for the little
 * channel behind a liked video, not for a factory of thousands.
 */

import type { Document } from 'mongodb'

import { readPoolZones } from '../../cool/likePool'
import { dailymotionAuthorVideos, youtubeAuthorVideos, YOUTUBE_AUTHOR_UNITS, type AuthorVideos } from '../../authors/fetch'
import { AUTHORS_PER_PASS, keepFromAuthor, pickAuthors, SMALL_AUTHOR_MAX, smallAuthor, TAKE_PER_PASS, type AuthorMemory, type AuthorZone } from '../../authors/pick'
import { isCleanTitle } from '../../cool/clean'
import { WEEKLY_PER_CHANNEL } from '../../dig/guards'
import { addAdmission, type LineContext, type LineResult } from '../context'
import { emptyCounters } from '../journal'

const DEADLINE_MARGIN_MS = 20_000
const WEEK_MS = 7 * 86_400_000
/** Each author's last visit and whether the channel was too big then, one row an author (lib/v3/authors/pick.ts, AuthorMemory). */
export const AUTHOR_VISITS = 'author_visits_v3'
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
  const visitRows = await ctx.db.collection(AUTHOR_VISITS).find({}, { projection: { visitedAt: 1, big: 1 }, maxTimeMS: 4000 }).toArray().catch((error) => {
    errors.push(`visites : ${message(error)}`)
    return []
  })
  const memory = new Map<string, AuthorMemory>(visitRows.map((row) => [String(row._id), { visitedAt: row.visitedAt instanceof Date ? row.visitedAt.getTime() : 0, big: row.big === true }]))
  const visits = pickAuthors(authors, AUTHORS_PER_PASS, memory)
  ctx.log(`${authors.length} auteurs aimés, ${visits.length} visités ce soir`)
  const remember = async (key: string, answer: AuthorVideos) => {
    if (ctx.dryRun) return
    await ctx.db.collection(AUTHOR_VISITS).updateOne({ _id: key } as Document, { $set: { visitedAt: new Date(), big: !smallAuthor(answer.total), total: answer.total } }, { upsert: true }).catch(() => undefined)
  }

  let visited = 0
  let skippedForQuota = 0
  let bigAuthors = 0
  for (const visit of visits) {
    if (ctx.timeLeft() < DEADLINE_MARGIN_MS) break
    try {
      let answer: AuthorVideos
      if (visit.provider === 'youtube') {
        if (!apiKey) { skippedForQuota += 1; continue }
        // The budget belongs to every line; an author is never worth taking it from a search.
        if (!(await ctx.quota.reserve(YOUTUBE_AUTHOR_UNITS))) { skippedForQuota += 1; continue }
        answer = await youtubeAuthorVideos(apiKey, visit.id, TAKE_PER_PASS * 3, http, undefined, smallAuthor)
      } else {
        answer = await dailymotionAuthorVideos(visit.id, TAKE_PER_PASS * 3, http)
      }
      await remember(visit.key, answer)
      // A factory, not a person: left alone whatever was liked of it, until it is asked again (BIG_RECHECK_DAYS).
      if (!smallAuthor(answer.total)) {
        bigAuthors += 1
        ctx.log(`auteur ${visit.key} laissé : ${answer.total ?? 'nombre inconnu de'} vidéos sur sa chaîne`)
        await wait(SPACING_MS)
        continue
      }
      const videos = answer.videos
      const clean = videos.filter((video) => isCleanTitle(video.title ?? ''))
      const shaped = keepFromAuthor(clean, visit.room)
      // The week's cap per channel, every line's since 10 October (lib/v3/dig/guards.ts): twenty a week at most from one channel.
      const thisWeek = await ctx.db.collection('items').countDocuments({ 'v3.channelKey': visit.key, createdAt: { $gte: new Date(Date.now() - WEEK_MS) } } as Document, { hint: 'v3_channel_key', maxTimeMS: 4000 }).catch(() => 0)
      const kept = shaped.slice(0, Math.max(0, WEEKLY_PER_CHANNEL - thisWeek))
      const result = await ctx.admit({ subjectId: `author:${visit.key}`, videos: kept })
      addAdmission(counters, {
        ...result,
        scanned: videos.length,
        rejected: {
          ...result.rejected,
          ...(videos.length - shaped.length ? { 'same-author-shape': videos.length - shaped.length } : {}),
          ...(shaped.length - kept.length ? { 'chaîne cette semaine': shaped.length - kept.length } : {}),
        },
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

  const note = `${visited} auteurs suivis · ${counters.inserted} entrées${bigAuthors ? ` · ${bigAuthors} grandes chaînes laissées (plus de ${SMALL_AUTHOR_MAX} vidéos)` : ''}${skippedForQuota ? ` · ${skippedForQuota} reportés faute de budget` : ''}`
  ctx.log(note)
  return { counters, errors, cursor: { visited, note } satisfies AuthorsCursor }
}
