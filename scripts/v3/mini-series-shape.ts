/**
 * The serials the titles could not name, found by their shape: a vertical
 * video of twenty minutes or more (see `isVerticalSerial`). For the videos
 * already stored, which were fetched before the aspect ratio was asked for.
 *
 *   node --import tsx scripts/v3/mini-series-shape.ts            read only: counts, examples, a report
 *   node --import tsx scripts/v3/mini-series-shape.ts --apply    marks them suppressed ('mini-series', detail 'shape')
 *
 * Undo with `scripts/v3/mini-series-sweep.ts --undo`, which gives back every
 * sweep. Options: --since=2026-08-01.
 *
 * Only Dailymotion videos, long or of unknown length, not already set aside,
 * read through the provider-and-date index; their shape is asked of
 * Dailymotion's public API, a hundred at a time, with pauses and a patient
 * retry when it says 429. One serial in a hundred stays, one per account.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { MongoClient, type Document, type ObjectId } from 'mongodb'

import { inKeptShare, isoSeconds, isVerticalSerial, LONG_FORM_SECONDS } from '@/lib/ingest/miniSeries'
import { KEPT_COLLECTION, accountKey } from '@/lib/ingest/miniSeriesStore'
import { SWEEPS_COLLECTION } from '@/lib/v3/pools/recap'
import { count, percent, table } from './reportFormat'

const REPORT = 'docs/reports/mini-series-shape.md'
const API = 'https://api.dailymotion.com/videos'
const BATCH = 100
const SPACING_MS = 500
const WRITE_BATCH = 500
const PAUSE_MS = 400

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=')
  return [key, value ?? 'true'] as const
}))
const apply = args.get('apply') === 'true'
const since = new Date(`${args.get('since') ?? '2026-08-01'}T00:00:00Z`)
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Row = { _id: ObjectId; id: string; title: string; channelId?: string; universe: string; provider: string; videoId: string }
type Shape = { ratio: number | null; seconds: number | null }

async function shapes(ids: string[]): Promise<Map<string, Shape>> {
  const out = new Map<string, Shape>()
  const url = `${API}?ids=${ids.join(',')}&fields=id,aspect_ratio,duration&limit=${BATCH}`
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url).catch(() => null)
    if (response?.status === 429) { await wait(30_000 * (attempt + 1)); continue }
    if (!response?.ok) { await wait(5_000); continue }
    const body = (await response.json()) as { list?: Array<{ id: string; aspect_ratio?: number; duration?: number }> }
    for (const video of body.list ?? []) out.set(video.id, { ratio: typeof video.aspect_ratio === 'number' ? video.aspect_ratio : null, seconds: typeof video.duration === 'number' ? video.duration : null })
    return out
  }
  return out
}

const shuffle = <T,>(values: T[]): T[] => [...values].sort(() => Math.random() - 0.5)

async function main(): Promise<void> {
  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20000 })
  await client.connect()
  try {
    const db = client.db(process.env.MONGODB_DB || 'randomdb')
    const rows: Row[] = []
    let read = 0
    const cursor = db.collection('items').find(
      { type: 'video', provider: 'dailymotion', createdAt: { $gte: since } },
      { projection: { videoId: 1, title: 1, duration: 1, channelId: 1, 'v3.universe': 1, isSuppressed: 1 }, hint: 'video_provider_createdAt_lookup', batchSize: 1000 },
    )
    for await (const doc of cursor) {
      read += 1
      if (doc.isSuppressed === true) continue
      const seconds = isoSeconds(doc.duration)
      if (seconds !== null && seconds < LONG_FORM_SECONDS) continue
      const id = String(doc.videoId ?? '').replace(/^dailymotion:/, '')
      if (!/^x[a-z0-9]+$/i.test(id)) continue
      rows.push({ _id: doc._id, id, title: String(doc.title ?? ''), channelId: doc.channelId, universe: String(doc.v3?.universe ?? 'other'), provider: 'dailymotion', videoId: String(doc.videoId) })
    }
    console.log(`${count(read)} lues · ${count(rows.length)} longues ou de durée inconnue à mesurer`)

    const measured = new Map<string, Shape>()
    for (let start = 0; start < rows.length; start += BATCH) {
      const batch = await shapes(rows.slice(start, start + BATCH).map((row) => row.id))
      for (const [id, shape] of batch) measured.set(id, shape)
      if ((start / BATCH) % 20 === 0) process.stdout.write(`\rmesurées : ${count(measured.size)} / ${count(rows.length)}`)
      await wait(SPACING_MS)
    }
    process.stdout.write(`\rmesurées : ${count(measured.size)} / ${count(rows.length)}\n`)

    const claimed = new Set((await db.collection(KEPT_COLLECTION).find({}, { projection: { _id: 1 } }).toArray()).map((row) => String(row._id)))
    const serials: Array<Row & Shape> = []
    const keep: Array<Row & Shape> = []
    const excepted: Array<Row & Shape> = []
    for (const row of rows) {
      const shape = measured.get(row.id)
      if (!shape) continue
      const video = { title: row.title, aspectRatio: shape.ratio, duration: shape.seconds }
      if (!isVerticalSerial(video)) {
        if (shape.ratio !== null && shape.ratio < 0.9 && (shape.seconds ?? 0) >= LONG_FORM_SECONDS) excepted.push({ ...row, ...shape })
        continue
      }
      const account = accountKey(row)
      if (inKeptShare(row.videoId) && account && !claimed.has(account)) { claimed.add(account); keep.push({ ...row, ...shape }) } else serials.push({ ...row, ...shape })
    }
    const byUniverse: Record<string, number> = {}
    for (const serial of serials) byUniverse[serial.universe] = (byUniverse[serial.universe] ?? 0) + 1

    const lines = [
      `# Mini-séries repérées par leur forme — ${apply ? 'mise de côté' : 'comptage seul'}`,
      '',
      `Vidéos Dailymotion depuis le ${since.toISOString().slice(0, 10)} : ${count(read)}. Longues ou de durée inconnue, mesurées : ${count(measured.size)}.`,
      `Verticales de 20 minutes ou plus : **${count(serials.length + keep.length)}** (${percent(serials.length + keep.length, measured.size)} des mesurées), dont ${count(keep.length)} gardées (une par compte) et **${count(serials.length)} à mettre de côté**. Épargnées par les exceptions (concert, live, interview…) : ${count(excepted.length)}.`,
      '',
      '## Par univers',
      table(['Univers', 'Vidéos'], Object.entries(byUniverse).sort((left, right) => right[1] - left[1]).map(([universe, n]) => [universe, count(n)])),
      '',
      '## 60 titres qui seraient mis de côté, au hasard',
      ...shuffle(serials).slice(0, 60).map((serial) => `- ${serial.title} · ${Math.round((serial.seconds ?? 0) / 60)} min`),
      '',
      '## Les épargnées par les exceptions',
      ...shuffle(excepted).slice(0, 30).map((row) => `- ${row.title} · ${Math.round((row.seconds ?? 0) / 60)} min`),
    ]
    mkdirSync(dirname(REPORT), { recursive: true })
    writeFileSync(REPORT, `${lines.join('\n')}\n`)
    console.log(`${count(serials.length)} à mettre de côté · ${count(keep.length)} gardées · ${count(excepted.length)} épargnées · rapport ${REPORT}`)

    if (!apply) return
    const now = new Date()
    const sweepId = (await db.collection(SWEEPS_COLLECTION).insertOne({ at: now, kind: 'shape', since, ids: [] })).insertedId
    let suppressed = 0
    for (let start = 0; start < serials.length; start += WRITE_BATCH) {
      const slice = serials.slice(start, start + WRITE_BATCH)
      const result = await db.collection('items').bulkWrite(slice.map((serial) => ({
        updateOne: {
          filter: { _id: serial._id, isSuppressed: { $ne: true } } as Document,
          update: { $set: { isSuppressed: true, suppressedReason: 'mini-series', suppressedAt: now, suppressedDetail: 'shape', aspectRatio: serial.ratio } },
        },
      })), { ordered: false })
      suppressed += result.modifiedCount
      await db.collection(SWEEPS_COLLECTION).updateOne({ _id: sweepId }, { $push: { ids: { $each: slice.map((serial) => serial._id) } } } as Document)
      process.stdout.write(`\rmis de côté : ${count(suppressed)} / ${count(serials.length)}`)
      await wait(PAUSE_MS)
    }
    process.stdout.write('\n')
    for (const kept of keep) {
      const account = accountKey(kept)
      if (!account) continue
      await db.collection(KEPT_COLLECTION).insertOne({ _id: account, videoId: kept.videoId, title: kept.title.slice(0, 200), at: now } as Document).catch(() => undefined)
      await db.collection('items').updateOne({ _id: kept._id }, { $set: { miniSeriesKept: true, aspectRatio: kept.ratio } })
    }
    await db.collection(SWEEPS_COLLECTION).updateOne({ _id: sweepId }, { $set: { suppressed, kept: keep.length, byUniverse, doneAt: new Date() } })
    console.log(`fait : ${count(suppressed)} mises de côté, ${keep.length} gardées`)
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
