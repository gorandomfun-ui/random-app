/**
 * The media outlets already in the catalogue: found, counted, and — only
 * when asked — set aside (lib/v3/dig/outlet.ts says what an outlet is).
 *
 *   node --env-file=.env.local --import tsx scripts/v3/outlet-sweep.ts            read only: candidates, counts, a report
 *   node --env-file=.env.local --import tsx scripts/v3/outlet-sweep.ts --apply    sets their recent-time videos aside (suppressedReason 'outlet')
 *   node --env-file=.env.local --import tsx scripts/v3/outlet-sweep.ts --undo     gives back what this sweep set aside
 *   node --env-file=.env.local --import tsx scripts/v3/outlet-sweep.ts --release  gives back what the media windows keep: the moment's news, the year's trailers, the rest
 *
 * No pass over the whole catalogue: a random sample of videos names the
 * channels that weigh (five in the sample is about two hundred in the
 * stock), each is asked its size from its provider, and each outlet's videos
 * are counted and marked through the channel index. A video of another time
 * (an old year in its title, or uploaded years ago) stays even on an outlet,
 * so an archive like INA, uploaded before 2019 to the last video, stays whole.
 * Nothing is deleted: `isSuppressed`, which every draw skips, and a sweep
 * record (kind 'outlet') so `--undo` can give them back.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { MongoClient, type Document } from 'mongodb'

import { MOMENT_DAYS, OLD_UPLOAD_BEFORE, OUTLET_VIDEOS, TRAILER_DAYS } from '@/lib/v3/dig/outlet'
import { channelCounts } from '@/lib/v3/dig/youtube'
import { SWEEPS_COLLECTION } from '@/lib/v3/pools/recap'

const REPORT = 'docs/reports/outlet-sweep.md'
const SAMPLE = 60_000
const MIN_IN_SAMPLE = 5
const OLD_TITLE = /\b(19[0-9]{2}|200[0-5])\b/
const UPLOAD_CUTOFF = new Date(Date.UTC(OLD_UPLOAD_BEFORE, 0, 1))
/** The week's clips of an outlet: uploaded within the last years, no old year in the title. */
const recentOf = (key: string): Document => ({ 'v3.channelKey': key, isSuppressed: { $ne: true }, publishedAt: { $gte: UPLOAD_CUTOFF }, title: { $not: { $regex: OLD_TITLE.source } } })
const apply = process.argv.includes('--apply')
const undo = process.argv.includes('--undo')
const release = process.argv.includes('--release')
/** The platforms' categories by family, as lib/v3/dig/outlet.ts reads them. */
const NEWS_CATEGORIES = ['news', 'sport', 'people', 'tv', '25', '17', '24']
const TRAILER_CATEGORIES = ['shortfilms', 'videogames', '1', '20']
const REST_CATEGORIES = ['fun', 'lifestyle', 'music', 'school', 'travel', 'creation', 'tech', 'auto', 'animals', 'kids', 'webcam', '10', '15', '19', '22', '23', '26', '27', '28', '29', '2']
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Candidate = { key: string; provider: string; title: string; inSample: number; size?: number; stock?: number; recent?: number; outlet?: boolean }

async function main(): Promise<void> {
  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20_000 })
  await client.connect()
  const db = client.db(process.env.MONGODB_DB || 'randomdb')
  const items = db.collection('items')
  if (release) {
    // What the windows keep, given back channel by channel through the channel index: the moment's news clips, the year's trailers, the rest without a window.
    const sweeps = await db.collection(SWEEPS_COLLECTION).find({ kind: 'outlet', undoneAt: { $exists: false } }).toArray()
    const now = new Date()
    const lift = { $unset: { isSuppressed: '', suppressedReason: '', suppressedAt: '', suppressedDetail: '' } }
    let given = 0
    for (const sweep of sweeps) {
      for (const key of (sweep.channels as string[]) ?? []) {
        const base = { 'v3.channelKey': key, suppressedReason: 'outlet' }
        const results = await Promise.all([
          items.updateMany({ ...base, categoryId: { $in: NEWS_CATEGORIES }, publishedAt: { $gte: new Date(now.getTime() - MOMENT_DAYS * 86_400_000) } }, lift, { hint: 'v3_channel_key' } as Document),
          items.updateMany({ ...base, categoryId: { $in: TRAILER_CATEGORIES }, publishedAt: { $gte: new Date(now.getTime() - TRAILER_DAYS * 86_400_000) } }, lift, { hint: 'v3_channel_key' } as Document),
          items.updateMany({ ...base, categoryId: { $in: REST_CATEGORIES } }, lift, { hint: 'v3_channel_key' } as Document),
        ])
        given += results.reduce((sum, result) => sum + result.modifiedCount, 0)
        await wait(100)
      }
    }
    console.log(`${given} vidéos rendues au tirage par les fenêtres (moment ${MOMENT_DAYS} j, bandes-annonces ${TRAILER_DAYS} j, le reste sans fenêtre)`)
    await client.close(); return
  }
  if (undo) {
    const sweeps = await db.collection(SWEEPS_COLLECTION).find({ kind: 'outlet', undoneAt: { $exists: false } }).toArray()
    for (const sweep of sweeps) {
      const result = await items.updateMany({ suppressedReason: 'outlet', suppressedDetail: String(sweep._id) }, { $unset: { isSuppressed: '', suppressedReason: '', suppressedAt: '', suppressedDetail: '' } })
      await db.collection(SWEEPS_COLLECTION).updateOne({ _id: sweep._id }, { $set: { undoneAt: new Date() } })
      console.log(`rendu : ${result.modifiedCount} vidéos (balayage ${String(sweep._id)})`)
    }
    await client.close(); return
  }
  // The channels that weigh, from a sample: no pass over the catalogue.
  const sampled = await items.aggregate<{ _id: string; n: number; title: string; provider: string }>([
    { $sample: { size: SAMPLE } },
    { $match: { type: 'video', 'v3.channelKey': { $exists: true }, isSuppressed: { $ne: true } } },
    { $group: { _id: '$v3.channelKey', n: { $sum: 1 }, title: { $first: '$channelTitle' }, provider: { $first: '$provider' } } },
    { $match: { n: { $gte: MIN_IN_SAMPLE } } },
    { $sort: { n: -1 } },
  ], { maxTimeMS: 120_000, allowDiskUse: true }).toArray()
  const candidates: Candidate[] = sampled.map((row) => ({ key: row._id, provider: String(row.provider), title: String(row.title ?? row._id), inSample: row.n }))
  console.log(`${candidates.length} chaînes à ${MIN_IN_SAMPLE} vidéos ou plus dans un échantillon de ${SAMPLE}`)
  // Each channel's size, from its provider.
  const youtubeIds = candidates.filter((c) => c.provider === 'youtube').map((c) => c.key.replace('youtube:', ''))
  const key = process.env.YOUTUBE_API_KEY ?? ''
  const youtubeSizes = key && youtubeIds.length ? await channelCounts(key, youtubeIds).catch(() => new Map<string, number>()) : new Map<string, number>()
  for (const candidate of candidates) {
    if (candidate.provider === 'youtube') candidate.size = youtubeSizes.get(candidate.key.replace('youtube:', ''))
    else if (candidate.provider === 'dailymotion') {
      const user = await fetch(`https://api.dailymotion.com/user/${candidate.key.replace('dailymotion:', '')}?fields=videos_total`).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { videos_total?: number } | null
      candidate.size = user?.videos_total
      await wait(150)
    }
    if ((candidate.size ?? 0) < OUTLET_VIDEOS) continue
    candidate.stock = await items.countDocuments({ 'v3.channelKey': candidate.key, isSuppressed: { $ne: true } }, { hint: 'v3_channel_key', maxTimeMS: 30_000 })
    candidate.recent = await items.countDocuments(recentOf(candidate.key), { hint: 'v3_channel_key', maxTimeMS: 30_000 })
    candidate.outlet = candidate.recent > 0
  }
  const big = candidates.filter((c) => (c.size ?? 0) >= OUTLET_VIDEOS).sort((a, b) => (b.recent ?? 0) - (a.recent ?? 0))
  const outlets = big.filter((c) => c.outlet)
  const toSetAside = outlets.reduce((sum, c) => sum + (c.recent ?? 0), 0)
  const lines = [
    `# Médias dans le catalogue — ${new Date().toISOString().slice(0, 16)}Z`, '',
    `Échantillon de ${SAMPLE} vidéos ; ${candidates.length} chaînes pesantes ; **${big.length} chaînes à ${OUTLET_VIDEOS.toLocaleString('fr-FR')} vidéos publiées ou plus**, dont ${outlets.length} avec des clips mis en ligne depuis ${OLD_UPLOAD_BEFORE} sans année d'époque dans le titre.`, '',
    `À mettre de côté : **${toSetAside.toLocaleString('fr-FR')} vidéos** — ce qui est d'époque (titre daté, ou mis en ligne avant ${OLD_UPLOAD_BEFORE}) reste, INA entière.`, '',
    '| Chaîne | Source | Publiées | En stock | De ces dernières années | Reste |', '|---|---|---|---|---|---|',
    ...big.map((c) => `| ${c.title.slice(0, 40)} | ${c.provider} | ${(c.size ?? 0).toLocaleString('fr-FR')} | ${(c.stock ?? 0).toLocaleString('fr-FR')} | ${(c.recent ?? 0).toLocaleString('fr-FR')} | ${((c.stock ?? 0) - (c.recent ?? 0)).toLocaleString('fr-FR')} |`),
  ]
  mkdirSync(dirname(REPORT), { recursive: true })
  writeFileSync(REPORT, `${lines.join('\n')}\n`)
  console.log(lines.slice(0, 5).join('\n'))
  console.log(`rapport ${REPORT}`)
  if (apply && outlets.length) {
    const sweep = { kind: 'outlet', at: new Date(), channels: outlets.map((c) => c.key), byUniverse: {} as Record<string, number>, setAside: 0 }
    const inserted = await db.collection(SWEEPS_COLLECTION).insertOne(sweep as Document)
    const detail = String(inserted.insertedId)
    for (const outlet of outlets) {
      const byUniverse = await items.aggregate<{ _id: string; n: number }>([
        { $match: recentOf(outlet.key) },
        { $group: { _id: '$v3.universe', n: { $sum: 1 } } },
      ], { hint: 'v3_channel_key', maxTimeMS: 60_000 }).toArray()
      for (const row of byUniverse) sweep.byUniverse[String(row._id ?? 'other')] = (sweep.byUniverse[String(row._id ?? 'other')] ?? 0) + row.n
      const result = await items.updateMany(
        recentOf(outlet.key),
        { $set: { isSuppressed: true, suppressedReason: 'outlet', suppressedAt: new Date(), suppressedDetail: detail } },
        { hint: 'v3_channel_key' } as Document,
      )
      sweep.setAside += result.modifiedCount
      console.log(`  ${outlet.title.slice(0, 40).padEnd(40)} ${result.modifiedCount} mises de côté`)
      await wait(300)
    }
    await db.collection(SWEEPS_COLLECTION).updateOne({ _id: inserted.insertedId }, { $set: { byUniverse: sweep.byUniverse, setAside: sweep.setAside } })
    console.log(`${sweep.setAside} vidéos mises de côté (balayage ${detail}) — --undo les rend.`)
  }
  await client.close()
}

main().catch((error) => { console.error(error); process.exit(1) })
