/**
 * The ad filter at the door, where it touches the database: scams refused,
 * product tops let in up to the day's allowance, every refusal recorded with
 * the mini-series ones so the report shows them together. Never blocks an
 * ingestion: a failed count lets the video through.
 */

import type { Db, Document } from 'mongodb'

import { junkKind, PRODUCT_TOP_DAILY } from './junk'
import { recordRefusals, type Refusal } from './miniSeriesStore'
import { isAiMarked } from '../v3/cool/themes'
import { channelKey } from '../v3/tagging/classify'

const ALLOWANCES = 'video_editorial_quota_v1'
const REFUSAL_TTL_MS = 30 * 86_400_000
const TITLE_MAX = 200

type Screenable = { videoId: string; title?: string | null; provider?: string | null; channelId?: string | null; channelTitle?: string | null; description?: string | null }

/** The channels that turn out AI videos by the dozen (scripts/v3/ai-channels.ts), read every ten minutes. */
const AI_CHANNELS = 'ai_channels_v1'
const AI_CHANNELS_TTL_MS = 10 * 60_000
let aiChannels: { at: number; keys: Set<string> } | null = null
async function loadAiChannels(db: Db, now: number): Promise<Set<string>> {
  if (aiChannels && now - aiChannels.at < AI_CHANNELS_TTL_MS) return aiChannels.keys
  const rows = await db.collection(AI_CHANNELS).find({}, { projection: { _id: 1 }, maxTimeMS: 2000 }).toArray().catch(() => [])
  aiChannels = { at: now, keys: new Set(rows.map((row) => String(row._id))) }
  return aiChannels.keys
}

const parisDay = (date: Date) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)

/** One of the day's product-top places, if any is left. */
async function takeProductTopPlace(db: Db, now: Date): Promise<boolean> {
  try {
    const result = await db.collection(ALLOWANCES).findOneAndUpdate(
      { _id: `product-top:${parisDay(now)}`, n: { $lt: PRODUCT_TOP_DAILY } } as Document,
      { $inc: { n: 1 }, $set: { updatedAt: now } },
      { upsert: true, returnDocument: 'after', maxTimeMS: 2000 },
    )
    return Boolean(result)
  } catch (error) {
    // The upsert collides with a full day's document: no place left.
    if ((error as { code?: number }).code === 11000) return false
    return true
  }
}

export async function screenJunk<T extends Screenable>(db: Db, videos: T[], options: { dryRun: boolean; line?: string; now?: Date }): Promise<{ videos: T[]; refused: number }> {
  const now = options.now ?? new Date()
  const admitted: T[] = []
  const refusals: Refusal[] = []
  const factories = await loadAiChannels(db, now.getTime())
  for (const video of videos) {
    // Made by AI, as it says of itself or as its channel is known for (the owner: "pas de trucs IA").
    const key = channelKey({ provider: video.provider, channelId: video.channelId })
    const ai = (key && factories.has(key)) ? 'ai-channel' : isAiMarked(`${video.title ?? ''} ${video.channelTitle ?? ''} ${(video.description ?? '').slice(0, 1500)}`) ? 'ai-marked' : null
    const kind = ai ?? junkKind(video.title)
    if (!kind) { admitted.push(video); continue }
    if (kind === 'product-top' && (options.dryRun || (await takeProductTopPlace(db, now)))) { admitted.push(video); continue }
    const channel = (video.channelTitle ?? video.channelId ?? '').trim()
    refusals.push({
      at: now,
      expiresAt: new Date(now.getTime() + REFUSAL_TTL_MS),
      day: parisDay(now),
      reason: 'junk',
      detail: kind,
      title: (video.title ?? '').slice(0, TITLE_MAX),
      provider: video.provider ?? '',
      videoId: video.videoId,
      ...(channel ? { channel } : {}),
      ...(options.line ? { line: options.line } : {}),
    })
  }
  if (!options.dryRun && refusals.length) await recordRefusals(db, refusals)
  return { videos: admitted, refused: refusals.length }
}
