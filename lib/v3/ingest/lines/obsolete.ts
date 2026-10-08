/**
 * The nightly check of the stored videos (the owner, 8 October: "on améliore
 * la page de delete obsolete… un truc qui va pas bouffer notre quota… et je
 * delete en allant sur la page chaque jour"). It finds the dead and marks
 * them (`obsoleteVideoStatus: 'obsolete'`), which hides them from the site at
 * once (SERVABLE); deleting stays the owner's, from the page, which checks
 * each one once more.
 *
 * What is due and how often: lib/v3/obsolete/due.ts. How a video is judged:
 * lib/v3/obsolete/check.ts (Dailymotion a hundred per call, the player only
 * for the missing ones; YouTube fifty per unit, in this line's own bucket).
 * What it costs: a few thousand requests a night, measured after its first
 * night against the server's sent bytes (the owner's ceiling is 2 € a month).
 */

import { type AnyBulkWriteOperation, type Document, type ObjectId } from 'mongodb'

import { checkByAddress, checkDailymotionVideos, checkYouTubeVideos, normalizeProvider, statusOf, type CheckOutcome } from '../../obsolete/check'
import { after, lanes, sortOf, type LaneSizes } from '../../obsolete/due'
import type { LineContext, LineResult } from '../context'
import { emptyCounters } from '../journal'

/** Videos read and judged together: one Dailymotion page is a hundred, one YouTube unit fifty. */
const PAGE = 500
const DEADLINE_MARGIN_MS = 60_000
const QUERY_MS = 60_000
const STOCK_CONCURRENCY = 6

type Row = { _id: ObjectId; provider?: string | null; url?: string | null; videoId?: string | null; obsoleteVideoCheckedAt?: Date | null }

export type ObsoleteDeps = { request?: typeof fetch; youtubeKey?: string; now?: number; sizes?: LaneSizes }

/** Writes the night's verdicts: the living in one update per page, the rest one by one with their reason. */
async function record(ctx: LineContext, rows: readonly Row[], outcomes: Map<string, CheckOutcome>, scanId: string): Promise<void> {
  if (ctx.dryRun) return
  const now = new Date()
  const alive = rows.filter((row) => { const outcome = outcomes.get(row._id.toHexString()); return outcome && statusOf(outcome) === 'ok' }).map((row) => row._id)
  const items = ctx.db.collection('items')
  if (alive.length) {
    await items.updateMany({ _id: { $in: alive } } as Document, { $set: { obsoleteVideoCheckedAt: now, obsoleteVideoStatus: 'ok', obsoleteVideoReason: null, obsoleteVideoHttpStatus: null, obsoleteVideoScanId: scanId }, $unset: { obsoleteVideoRuntimeSuspect: '' } }, { maxTimeMS: QUERY_MS })
  }
  const others: AnyBulkWriteOperation<Document>[] = rows.flatMap((row) => {
    const outcome = outcomes.get(row._id.toHexString())
    if (!outcome) return []
    const status = statusOf(outcome)
    if (status === 'ok') return []
    return [{ updateOne: { filter: { _id: row._id }, update: { $set: { obsoleteVideoCheckedAt: now, obsoleteVideoStatus: status, obsoleteVideoReason: outcome.reason ?? null, obsoleteVideoHttpStatus: outcome.status ?? null, obsoleteVideoScanId: scanId }, ...(status === 'obsolete' ? { $unset: { obsoleteVideoRuntimeSuspect: '' } } : {}) } } }]
  })
  if (others.length) await items.bulkWrite(others, { ordered: false })
}

export async function run(ctx: LineContext, deps: ObsoleteDeps = {}): Promise<LineResult> {
  const request = deps.request ?? ctx.http ?? fetch
  const key = deps.youtubeKey ?? (process.env.YOUTUBE_API_KEY || '').trim()
  const now = deps.now ?? Date.now()
  const scanId = `nightly-${new Date(now).toISOString().slice(0, 10)}`
  const counters = emptyCounters()
  const errors: string[] = []
  const dead: Record<string, number> = {}
  const perLane: string[] = []
  let doubtful = 0, units = 0, youtubeStopped = !key, skippedYouTube = 0

  for (const lane of lanes(now, deps.sizes)) {
    let done = 0
    // The lane is read through its own index, a page at a time, each page past the last one read: a video left
    // unjudged tonight (YouTube's units spent) is not read twice, and waits for another night.
    let last: Row | null = null
    while (done < lane.limit && ctx.timeLeft() > DEADLINE_MARGIN_MS) {
      const filter = last ? after(lane, last) : lane.filter
      let rows: Row[] = []
      try {
        rows = await ctx.db.collection('items').find(filter, { projection: { provider: 1, url: 1, videoId: 1, obsoleteVideoCheckedAt: 1 }, hint: lane.hint, sort: sortOf(lane), limit: Math.min(PAGE, lane.limit - done), maxTimeMS: QUERY_MS }).toArray() as Row[]
      } catch (error) {
        errors.push(`${lane.label} : ${error instanceof Error ? error.message.slice(0, 120) : 'lecture'}`)
        break
      }
      if (!rows.length) break
      last = rows[rows.length - 1]
      const youtube = rows.filter((row) => normalizeProvider(row.provider).includes('youtube'))
      const dailymotion = rows.filter((row) => normalizeProvider(row.provider).includes('dailymotion'))
      const stock = rows.filter((row) => !youtube.includes(row) && !dailymotion.includes(row))
      const outcomes = new Map<string, CheckOutcome>()
      for (const [id, outcome] of await checkDailymotionVideos(dailymotion, { request })) outcomes.set(id, outcome)
      if (!youtubeStopped && youtube.length) {
        const checked = await checkYouTubeVideos(youtube, { key, request, reserve: (n) => ctx.quota.reserve(n) })
        units += checked.units
        for (const [id, outcome] of checked.outcomes) outcomes.set(id, outcome)
        if (checked.stopped) { youtubeStopped = true; errors.push('youtube : budget de la nuit atteint') }
      }
      skippedYouTube += youtube.filter((row) => !outcomes.has(row._id.toHexString())).length
      for (let at = 0; at < stock.length; at += STOCK_CONCURRENCY) {
        await Promise.all(stock.slice(at, at + STOCK_CONCURRENCY).map(async (row) => { outcomes.set(row._id.toHexString(), await checkByAddress(row, { request })) }))
      }
      try {
        await record(ctx, rows, outcomes, scanId)
      } catch (error) {
        errors.push(`écriture : ${error instanceof Error ? error.message.slice(0, 120) : 'écriture'}`)
        break
      }
      for (const row of rows) {
        const outcome = outcomes.get(row._id.toHexString())
        if (!outcome) continue
        counters.scanned += 1
        const status = statusOf(outcome)
        if (status === 'obsolete') { const provider = normalizeProvider(row.provider); dead[provider] = (dead[provider] ?? 0) + 1 }
        else if (status !== 'ok') doubtful += 1
      }
      done += rows.length
    }
    if (done) perLane.push(`${lane.label} ${done.toLocaleString('fr-FR')}`)
    if (ctx.timeLeft() <= DEADLINE_MARGIN_MS) { errors.push('échéance atteinte'); break }
  }

  const deadTotal = Object.values(dead).reduce((sum, count) => sum + count, 0)
  for (const [provider, count] of Object.entries(dead)) counters.rejected[`morte (${provider})`] = count
  if (doubtful) counters.rejected['à revoir'] = doubtful
  const note = `${counters.scanned.toLocaleString('fr-FR')} vidéos vérifiées · ${deadTotal.toLocaleString('fr-FR')} mortes${deadTotal ? ` (${Object.entries(dead).map(([provider, count]) => `${provider} ${count}`).join(', ')})` : ''} · ${doubtful} à revoir · ${units} unités YouTube${skippedYouTube ? ` · ${skippedYouTube} YouTube remises à demain` : ''}${perLane.length ? ` · ${perLane.join(', ')}` : ''}`
  ctx.log(`obsolètes : ${note}`)
  return { counters, cursor: { note, scanId }, errors }
}
