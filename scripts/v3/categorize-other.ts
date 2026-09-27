/**
 * The unclassified videos put where their uploader said they belong. For a
 * video in "other", no subject and no word of its title decided; the
 * category chosen on YouTube or Dailymotion still can, in any language (see
 * lib/v3/tagging/categories.ts — never cinema, never the catch-alls).
 * Most stored videos never had their category saved, so it is asked again:
 * Dailymotion for free, a hundred at a time; YouTube at one unit per fifty,
 * within a cap, and written to the shared quota ledger.
 *
 *   node --import tsx scripts/v3/categorize-other.ts                 read only: 3,000 videos, counts, examples
 *   node --import tsx scripts/v3/categorize-other.ts --apply         every unclassified video, resumable
 *   node --import tsx scripts/v3/categorize-other.ts --undo          puts back what the runs changed
 *
 * Options: --limit=3000 (read only), --youtube-units=1500.
 * Only videos that gain a universe are written; each one's previous labels
 * are kept for --undo. A checkpoint after every chunk: a stop loses nothing.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { MongoClient, type Db, type Document, type ObjectId } from 'mongodb'

import { quotaDay } from '@/lib/discovery/exploration'
import { computeRegisters } from '@/lib/v3/cool/registers'
import { formatFamilyKey } from '@/lib/v3/families'
import { universeFromCategory } from '@/lib/v3/tagging/categories'
import type { Universe } from '@/lib/v3/types'
import { count, percent, table } from './reportFormat'

const RUNS = 'relabel_runs_v3'
const CHECKPOINTS = 'v3_repair_checkpoints'
const CHECKPOINT_ID = 'categorize-other'
const REPORT = 'docs/reports/categorize-other.md'
const CHUNK = 1000
const DM_BATCH = 100
const YT_BATCH = 50
const SPACING_MS = 400
const WRITE_BATCH = 500

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=')
  return [key, value ?? 'true'] as const
}))
const apply = args.get('apply') === 'true'
const undo = args.get('undo') === 'true'
const limit = apply ? Number.POSITIVE_INFINITY : Number(args.get('limit') ?? 3000)
let youtubeUnits = Number(args.get('youtube-units') ?? 1500)
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Row = { _id: ObjectId; rand: number; videoId: string; provider: string; title: string; categoryId?: string; lang?: string; v3: Document }
type Change = { row: Row; to: Universe; category: string; fetched: boolean }

async function dailymotionCategories(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`https://api.dailymotion.com/videos?ids=${ids.join(',')}&fields=id,channel.id&limit=${DM_BATCH}`).catch(() => null)
    if (response?.status === 429) { await wait(30_000 * (attempt + 1)); continue }
    if (!response?.ok) { await wait(5_000); continue }
    const body = (await response.json()) as { list?: Array<Record<string, string>> }
    for (const video of body.list ?? []) if (video['channel.id']) out.set(video.id, video['channel.id'])
    return out
  }
  return out
}

let youtubeSpent = 0
async function youtubeCategories(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const key = process.env.YOUTUBE_API_KEY
  if (!key || youtubeUnits <= 0) return out
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&fields=items(id,snippet/categoryId)&id=${ids.join(',')}&key=${key}`
  const response = await fetch(url).catch(() => null)
  youtubeUnits -= 1
  youtubeSpent += 1
  if (!response?.ok) {
    if (response?.status === 403) youtubeUnits = 0
    return out
  }
  const body = (await response.json()) as { items?: Array<{ id: string; snippet?: { categoryId?: string } }> }
  for (const item of body.items ?? []) if (item.snippet?.categoryId) out.set(item.id, item.snippet.categoryId)
  return out
}

const bareDailymotion = (videoId: string) => videoId.replace(/^dailymotion:/, '')
const bareYouTube = (videoId: string) => videoId.replace(/^youtube:/, '')

async function undoRuns(db: Db): Promise<void> {
  const runs = await db.collection(RUNS).find({ kind: 'category', undoneAt: { $exists: false } }).toArray()
  let restored = 0
  for (const run of runs) {
    const previous = (run.previous ?? []) as Array<{ _id: ObjectId; formatFamily?: string; registers?: string[] }>
    const result = await db.collection('items').bulkWrite(previous.map((entry) => ({
      updateOne: {
        filter: { _id: entry._id },
        update: entry.registers?.length
          ? { $set: { 'v3.universe': 'other', 'v3.formatFamily': entry.formatFamily, 'v3.registers': entry.registers } }
          : { $set: { 'v3.universe': 'other', 'v3.formatFamily': entry.formatFamily }, $unset: { 'v3.registers': '' } },
      },
    })), { ordered: false })
    restored += result.modifiedCount
    await db.collection(RUNS).updateOne({ _id: run._id }, { $set: { undoneAt: new Date() } })
    await wait(200)
  }
  await db.collection(CHECKPOINTS).deleteOne({ _id: CHECKPOINT_ID } as Document)
  console.log(`remis en non classé : ${restored} vidéos`)
}

async function main(): Promise<void> {
  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20000 })
  await client.connect()
  const db = client.db(process.env.MONGODB_DB || 'randomdb')
  try {
    if (undo) return await undoRuns(db)
    const checkpoint = apply ? await db.collection(CHECKPOINTS).findOne({ _id: CHECKPOINT_ID } as Document) : null
    let after = typeof checkpoint?.rand === 'number' ? checkpoint.rand : apply ? -1 : Math.random() * 0.9
    const tally = new Map<string, Change[]>()
    const unmapped = new Map<string, number>()
    let examined = 0, hadCategory = 0, askedDailymotion = 0, askedYouTube = 0, written = 0
    const at = new Date()

    while (examined < limit) {
      const rows = (await db.collection('items').find(
        { 'v3.universe': 'other', type: 'video', rand: { $gt: after } },
        { projection: { rand: 1, videoId: 1, provider: 1, title: 1, categoryId: 1, lang: 1, v3: 1, isSuppressed: 1 }, hint: 'v3_universe_type_rand', sort: { rand: 1 }, limit: CHUNK, maxTimeMS: 120_000 },
      ).toArray()) as unknown as Array<Row & { isSuppressed?: boolean }>
      if (!rows.length) break
      after = rows[rows.length - 1].rand
      const live = rows.filter((row) => row.isSuppressed !== true)
      examined += live.length

      const fetched = new Map<string, string>()
      const dm = live.filter((row) => row.provider === 'dailymotion' && !row.categoryId).map((row) => bareDailymotion(row.videoId)).filter((id) => /^x[a-z0-9]+$/i.test(id))
      for (let start = 0; start < dm.length; start += DM_BATCH) {
        for (const [id, category] of await dailymotionCategories(dm.slice(start, start + DM_BATCH))) fetched.set(`dailymotion:${id}`, category)
        askedDailymotion += Math.min(DM_BATCH, dm.length - start)
        await wait(SPACING_MS)
      }
      const yt = live.filter((row) => (row.provider === 'youtube' || row.provider === 'reddit-youtube') && !row.categoryId).map((row) => bareYouTube(row.videoId)).filter((id) => /^[\w-]{11}$/.test(id))
      for (let start = 0; start < yt.length && youtubeUnits > 0; start += YT_BATCH) {
        for (const [id, category] of await youtubeCategories(yt.slice(start, start + YT_BATCH))) fetched.set(id, category)
        askedYouTube += Math.min(YT_BATCH, yt.length - start)
      }

      const changes: Change[] = []
      for (const row of live) {
        const own = row.categoryId?.trim()
        const got = fetched.get(row.videoId) ?? fetched.get(bareYouTube(row.videoId))
        const category = own || got
        if (!category) continue
        if (own) hadCategory += 1
        const to = universeFromCategory(row.provider, category)
        if (!to) { unmapped.set(`${row.provider}:${category}`, (unmapped.get(`${row.provider}:${category}`) ?? 0) + 1); continue }
        const change = { row, to, category, fetched: !own }
        changes.push(change)
        tally.set(to, [...(tally.get(to) ?? []), change])
      }

      if (apply && changes.length) {
        for (let start = 0; start < changes.length; start += WRITE_BATCH) {
          const slice = changes.slice(start, start + WRITE_BATCH)
          await db.collection(RUNS).insertOne({ at, kind: 'category', previous: slice.map((change) => ({ _id: change.row._id, formatFamily: change.row.v3.formatFamily, registers: change.row.v3.registers ?? [] })) })
          const result = await db.collection('items').bulkWrite(slice.map((change) => {
            const v3 = { ...change.row.v3, universe: change.to }
            const registers = computeRegisters({ type: 'video', title: change.row.title, provider: change.row.provider, v3 } as never)
            const set: Document = {
              'v3.universe': change.to,
              'v3.formatFamily': formatFamilyKey({ primarySubjectId: change.row.v3.subjects?.[0]?.id, universe: change.to, angle: change.row.v3.angle, lang: change.row.lang }),
              ...(change.fetched ? { categoryId: change.category } : {}),
              ...(registers.length ? { 'v3.registers': registers } : {}),
            }
            return { updateOne: { filter: { _id: change.row._id, 'v3.universe': 'other' } as Document, update: registers.length ? { $set: set } : { $set: set, $unset: { 'v3.registers': '' } } } }
          }), { ordered: false })
          written += result.modifiedCount
        }
      }
      if (apply) await db.collection(CHECKPOINTS).updateOne({ _id: CHECKPOINT_ID } as Document, { $set: { rand: after, at: new Date(), written } }, { upsert: true })
      process.stdout.write(`\rexaminées ${count(examined)} · rangées ${count([...tally.values()].reduce((sum, list) => sum + list.length, 0))} · écrites ${count(written)} · youtube ${youtubeSpent} unités`)
    }
    process.stdout.write('\n')

    // What YouTube was asked goes on the shared ledger, so the lines see it.
    if (youtubeSpent > 0) {
      await db.collection('discovery_quota_v2').updateOne({ _id: `${quotaDay(Date.now())}:youtube:other` } as Document, { $inc: { spent: youtubeSpent, categories: youtubeSpent } }, { upsert: true }).catch(() => undefined)
    }

    const ranged = [...tally.values()].reduce((sum, list) => sum + list.length, 0)
    const lines = [
      `# Non classé rangé par la catégorie — ${apply ? 'appliqué' : 'comptage sur un échantillon'}`,
      '',
      `Vidéos non classées examinées : **${count(examined)}**. Catégorie déjà connue : ${count(hadCategory)}. Demandées à Dailymotion : ${count(askedDailymotion)}, à YouTube : ${count(askedYouTube)} (${youtubeSpent} unités).`,
      `Rangées : **${count(ranged)}** (${percent(ranged, examined)}).`,
      '',
      '## Où elles vont',
      table(['Univers', 'Vidéos'], [...tally].sort((left, right) => right[1].length - left[1].length).map(([universe, list]) => [universe, count(list.length)])),
      '',
      '## Catégories qui ne rangent pas',
      table(['Catégorie', 'Vidéos'], [...unmapped].sort((left, right) => right[1] - left[1]).slice(0, 15).map(([category, n]) => [category, count(n)])),
      '',
      ...[...tally].sort((left, right) => right[1].length - left[1].length).flatMap(([universe, list]) => [
        `### → ${universe}`,
        ...[...list].sort(() => Math.random() - 0.5).slice(0, 10).map((change) => `- ${change.row.title}`),
        '',
      ]),
    ]
    mkdirSync(dirname(REPORT), { recursive: true })
    writeFileSync(REPORT, `${lines.join('\n')}\n`)
    console.log(`${count(examined)} examinées · ${count(ranged)} rangées (${percent(ranged, examined)}) · ${count(written)} écrites · youtube ${youtubeSpent} unités · rapport ${REPORT}`)
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
