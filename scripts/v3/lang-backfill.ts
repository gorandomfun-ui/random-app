/**
 * The declared language of the videos already in the base, asked again of their platform once (13 October). It was read
 * since the dig began but dropped at the writing (lib/ingest/videoDocument.ts): none of the 54,862 videos of the three days
 * before had it. The owner: "c'est clairement le truc de base… vas-y pour tout".
 *
 *   node --import tsx scripts/v3/lang-backfill.ts --provider=dailymotion            free, a hundred videos a question
 *   node --import tsx scripts/v3/lang-backfill.ts --provider=youtube --units=3000   fifty a unit, taken from the YouTube drift's day
 *   … --dry                                                                          asks, writes nothing
 *
 * Walks the drawable videos without a language by id, resumes where the last run stopped (`lang_backfill_v1`), writes
 * by a hundred at most, and pauses between questions: the base is small and serves the site meanwhile.
 */

import type { AnyBulkWriteOperation, Document, ObjectId } from 'mongodb'

import { declaredLanguage } from '@/lib/ingest/videoDocument'
import { quotaDay } from '@/lib/discovery/exploration'
import { trendQuota } from '@/lib/v3/ingest/direct'

const flag = (name: string, fallback: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1] ?? fallback
const PROVIDER = flag('provider', 'dailymotion')
const DRY = process.argv.includes('--dry')
const MINUTES = Number(flag('minutes', '120'))
/** YouTube units this run may take from the YouTube drift's bucket (its day is 6,000: lib/v3/ingest/lines/youtube-drift.ts). */
const UNITS = Number(flag('units', '3000'))
const DRIFT_DAY = 6000
const PAGE = PROVIDER === 'youtube' ? 50 : 100
const PAUSE_MS = 250
const PROGRESS = 'lang_backfill_v1'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function dailymotionLanguages(ids: string[]): Promise<Map<string, string | undefined>> {
  const out = new Map<string, string | undefined>()
  const response = await fetch(`https://api.dailymotion.com/videos?ids=${ids.join(',')}&fields=id,language&limit=100`, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`Dailymotion HTTP ${response.status}`)
  const body = (await response.json()) as { list?: Array<{ id?: string; language?: string }> }
  for (const row of body.list ?? []) if (row.id) out.set(row.id, row.language)
  return out
}

async function youtubeLanguages(ids: string[], key: string): Promise<Map<string, string | undefined>> {
  const out = new Map<string, string | undefined>()
  const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&fields=items(id,snippet(defaultAudioLanguage,defaultLanguage))&id=${ids.join(',')}&key=${key}`, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`YouTube HTTP ${response.status}`)
  const body = (await response.json()) as { items?: Array<{ id?: string; snippet?: { defaultAudioLanguage?: string; defaultLanguage?: string } }> }
  for (const row of body.items ?? []) if (row.id) out.set(row.id, row.snippet?.defaultAudioLanguage ?? row.snippet?.defaultLanguage)
  return out
}

async function main(): Promise<void> {
  if (PROVIDER !== 'dailymotion' && PROVIDER !== 'youtube') throw new Error('--provider=dailymotion|youtube')
  const key = (process.env.YOUTUBE_API_KEY ?? '').trim()
  if (PROVIDER === 'youtube' && !key) throw new Error('YOUTUBE_API_KEY missing')
  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  const items = db.collection('items')
  const progress = db.collection<{ _id: string; lastId?: ObjectId; asked: number; filled: number; at: Date }>(PROGRESS)
  const started = Date.now()
  const deadline = started + MINUTES * 60_000
  const saved = await progress.findOne({ _id: PROVIDER })
  let lastId = saved?.lastId
  let asked = 0, filled = 0, pages = 0
  // YouTube: this run's ceiling in the drift's bucket, as the drift reckons its own runs.
  let quota: ReturnType<typeof trendQuota> | null = null
  if (PROVIDER === 'youtube') {
    const spent = Number((await db.collection('discovery_quota_v2').findOne({ _id: `${quotaDay(Date.now())}:youtube:youtube-drift` } as never, { projection: { spent: 1 } }).catch(() => null))?.spent ?? 0)
    quota = trendQuota(db, Math.min(DRIFT_DAY, spent + UNITS), DRY, 'youtube-drift')
  }
  const languages: Record<string, number> = {}
  let stopped = ''
  while (Date.now() < deadline) {
    const rows = await items.find({ type: 'video', provider: PROVIDER, isSuppressed: { $ne: true }, lang: { $exists: false }, ...(lastId ? { _id: { $gt: lastId } } : {}) } as Document,
      { projection: { _id: 1, videoId: 1 }, sort: { _id: 1 }, limit: PAGE, hint: 'idx_image_scan_by_type_id', maxTimeMS: 60_000 }).toArray()
    if (!rows.length) { stopped = 'fini'; break }
    const ids = rows.map((row) => String(row.videoId ?? '').replace(/^dailymotion:/, '')).filter(Boolean)
    if (quota && !(await quota.reserve(1))) { stopped = 'unités du jour dépensées'; break }
    let found: Map<string, string | undefined>
    try {
      found = PROVIDER === 'youtube' ? await youtubeLanguages(ids, key) : await dailymotionLanguages(ids)
    } catch (error) {
      stopped = error instanceof Error ? error.message : 'erreur'
      break
    }
    const writes: AnyBulkWriteOperation<Document>[] = []
    for (const row of rows) {
      const id = String(row.videoId ?? '').replace(/^dailymotion:/, '')
      const lang = declaredLanguage(found.get(id))
      if (!lang) continue
      writes.push({ updateOne: { filter: { _id: row._id }, update: { $set: { lang } } } })
      languages[lang] = (languages[lang] ?? 0) + 1
    }
    if (!DRY && writes.length) await items.bulkWrite(writes, { ordered: false })
    asked += rows.length
    filled += writes.length
    lastId = rows[rows.length - 1]._id as ObjectId
    pages += 1
    if (!DRY) await progress.updateOne({ _id: PROVIDER }, { $set: { lastId, at: new Date() }, $inc: { asked: rows.length, filled: writes.length } }, { upsert: true })
    if (pages % 50 === 0) console.log(`${PROVIDER} : ${asked} demandées · ${filled} avec leur langue · ${Math.round((Date.now() - started) / 60_000)} min`)
    await wait(PAUSE_MS)
  }
  const top = Object.entries(languages).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([lang, n]) => `${lang} ${n}`).join(' · ')
  console.log(JSON.stringify({ langBackfill: PROVIDER, dryRun: DRY, asked, filled, units: quota?.spent() ?? 0, stopped: stopped || 'temps écoulé', minutes: Math.round((Date.now() - started) / 60_000), top }))
  process.exit(0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
