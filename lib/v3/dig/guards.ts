/**
 * The guards every video line applies after its own door: what one channel
 * may bring in over a week, and what of a media outlet Random keeps. Written
 * for the dig on 1 October, shared with the drift (lib/v3/ingest/lines/drift.ts)
 * so that a small uploader followed by the drift and a star's channel read by
 * the dig obey the same rules.
 */

import type { LineContext } from '../ingest/context'
import { channelKey } from '../tagging/classify'
import { ofAnotherTime, withoutOutlets, type OutletVerdict } from './outlet'
import type { DigVideo } from './video'
import { channelCounts, LIST_UNITS, PAGE_SIZE } from './youtube'

/**
 * What one channel may bring in over a week, whatever the subject or the pass:
 * the audit of 30 September–1 October found the biggest channels were all
 * media outlets on Dailymotion — showbiz agencies, trailer and press
 * channels — at eighty videos each in two days. A limit, not a refusal: a
 * person who posts three videos a week gives all three. The subject's own
 * channels are not counted (a star's channel is read on purpose), nor is
 * what is of another time — an archive's.
 */
export const WEEKLY_PER_CHANNEL = Number(process.env.RANDOM_DIG_WEEKLY_PER_CHANNEL ?? 20)
const WEEK_MS = 7 * 86_400_000

/** One run's counts: what the week already holds per channel, plus what the run admits; and the YouTube channel sizes read once. */
export type GuardState = { weekCounts: Map<string, number>; channelSizes: Map<string, number> }
export const newGuardState = (): GuardState => ({ weekCounts: new Map(), channelSizes: new Map() })

/** The kept videos under the week's cap per channel; the refused count goes with the door's. */
export async function underWeeklyCap(ctx: LineContext, state: GuardState, kept: DigVideo[], provider: string, own: ReadonlySet<string>): Promise<{ kept: DigVideo[]; refused: number }> {
  const out: DigVideo[] = []
  let refused = 0
  const since = new Date(Date.now() - WEEK_MS)
  for (const video of kept) {
    const key = channelKey({ provider, channelId: video.channelId })
    if (!key || own.has(video.channelId ?? '') || ofAnotherTime(video)) { out.push(video); continue }
    let count = state.weekCounts.get(key)
    if (count === undefined) count = await ctx.db.collection('items').countDocuments({ 'v3.channelKey': key, createdAt: { $gte: since } }, { hint: 'v3_channel_key', maxTimeMS: 4000 }).catch(() => 0)
    if (count >= WEEKLY_PER_CHANNEL) { refused += 1; state.weekCounts.set(key, count); continue }
    state.weekCounts.set(key, count + 1)
    out.push(video)
  }
  return { kept: out, refused }
}

/** The kept videos without what the media windows refuse (lib/v3/dig/outlet.ts): Dailymotion says a channel's size in the search, YouTube in one call per fifty. */
export async function withoutMedia(ctx: LineContext, state: GuardState, key: string, kept: DigVideo[], provider: string, own: ReadonlySet<string>): Promise<OutletVerdict> {
  if (provider === 'youtube' && key) {
    const unknown = [...new Set(kept.map((video) => video.channelId ?? '').filter((id) => id && !own.has(id) && !state.channelSizes.has(id)))]
    if (unknown.length && (await ctx.quota.reserve(LIST_UNITS * Math.ceil(unknown.length / PAGE_SIZE)))) {
      const counts = await channelCounts(key, unknown, ctx.http ?? fetch).catch(() => new Map<string, number>())
      for (const id of unknown) state.channelSizes.set(id, counts.get(id) ?? 0)
    }
  }
  return withoutOutlets(kept, (video) => (provider === 'youtube' ? state.channelSizes.get(video.channelId ?? '') : video.channelVideos), own)
}
