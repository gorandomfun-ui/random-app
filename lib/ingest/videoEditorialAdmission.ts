import type { Collection, Db, Filter } from 'mongodb'
import type { RawVideo, VideoDocument } from './videos'
import { isOrdinaryRoutineVideo, ROUTINE_NEWS_RADIO_DAILY_LIMIT } from '../random/videoEditorial'

type RoutineQuota = { _id: 'routine-news-radio'; timestamps: Date[]; updatedAt?: Date }
const QUOTA_ID = 'routine-news-radio' as const

function activeTimestamps(timestamps: Date[] | undefined, windowStart: Date): Date[] {
  return (timestamps ?? []).filter(value => value instanceof Date && value >= windowStart)
}

async function recentItemTimestamps(collection: Collection<VideoDocument>, windowStart: Date): Promise<Date[]> {
  const rows = await collection.find({ type: 'video', editorialRoutine: true,
    editorialRoutineIngestedAt: { $gte: windowStart } } as Filter<VideoDocument>)
    .project<{ editorialRoutineIngestedAt?: Date }>({ editorialRoutineIngestedAt: 1 })
    .sort({ editorialRoutineIngestedAt: -1 }).limit(ROUTINE_NEWS_RADIO_DAILY_LIMIT).toArray()
  return rows.map(row => row.editorialRoutineIngestedAt).filter((value): value is Date => value instanceof Date)
}

export async function applyRoutineVideoIngestCap(
  db: Db,
  videos: RawVideo[],
  now = new Date(),
  options: { dryRun?: boolean } = {},
): Promise<{ videos: RawVideo[]; admitted: number; filtered: number; alreadyIngested: number }> {
  const ordinary = videos.filter(isOrdinaryRoutineVideo)
  if (!ordinary.length) return { videos, admitted: 0, filtered: 0, alreadyIngested: 0 }

  const collection = db.collection<VideoDocument>('items')
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const quota = db.collection<RoutineQuota>('video_editorial_quota_v1')
  const existingQuota = await quota.findOne({ _id: QUOTA_ID })
  const itemTimestamps = existingQuota ? [] : await recentItemTimestamps(collection, windowStart)
  if (options.dryRun) {
    const alreadyIngested = activeTimestamps(existingQuota?.timestamps ?? itemTimestamps, windowStart).length
    const allowance = Math.max(0, ROUTINE_NEWS_RADIO_DAILY_LIMIT - alreadyIngested)
    let admitted = 0
    const selected = videos.flatMap((video) => {
      if (!isOrdinaryRoutineVideo(video)) return [video]
      if (admitted >= allowance) return []
      admitted += 1
      return [{ ...video, editorialRoutine: true, editorialRoutineIngestedAt: now }]
    })
    return { videos: selected, admitted, filtered: ordinary.length - admitted, alreadyIngested }
  }

  try {
    await quota.updateOne({ _id: QUOTA_ID }, { $setOnInsert: { timestamps: itemTimestamps } }, { upsert: true })
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error
  }
  const initialized = await quota.findOne({ _id: QUOTA_ID })
  const alreadyIngested = activeTimestamps(initialized?.timestamps, windowStart).length
  let admitted = 0
  const selected: RawVideo[] = []
  for (const video of videos) {
    if (!isOrdinaryRoutineVideo(video)) {
      selected.push(video)
      continue
    }
    if (alreadyIngested + admitted >= ROUTINE_NEWS_RADIO_DAILY_LIMIT) continue
    const active = { $filter: { input: { $ifNull: ['$timestamps', []] }, as: 'timestamp',
      cond: { $gte: ['$$timestamp', windowStart] } } }
    const reserved = await quota.findOneAndUpdate({ _id: QUOTA_ID,
      $expr: { $lt: [{ $size: active }, ROUTINE_NEWS_RADIO_DAILY_LIMIT] } }, [
      { $set: { timestamps: { $concatArrays: [active, [now]] }, updatedAt: now } },
    ], { returnDocument: 'after' })
    if (!reserved) continue
    admitted += 1
    selected.push({ ...video, editorialRoutine: true, editorialRoutineIngestedAt: now })
  }
  return { videos: selected, admitted, filtered: ordinary.length - admitted, alreadyIngested }
}
