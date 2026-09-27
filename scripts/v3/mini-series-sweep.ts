/**
 * The mini-series already in the catalogue: counted, shown, and — only when
 * asked — set aside.
 *
 *   node --import tsx scripts/v3/mini-series-sweep.ts                 read only: counts, examples, a report
 *   node --import tsx scripts/v3/mini-series-sweep.ts --apply         marks them suppressed ('mini-series')
 *   node --import tsx scripts/v3/mini-series-sweep.ts --undo          gives back everything a sweep set aside
 *
 * Options: --since=2026-08-01 (they appeared in August), --providers=dailymotion,youtube.
 *
 * It reads one provider at a time through the provider-and-date index, with a
 * single cursor (whole batches share one insertion time, so paging by date
 * would skip some), titles only, pausing as it goes: the database is small.
 * The same rule as the door, with the studios learned from the base itself.
 * One serial in a hundred stays, one per account at most. Nothing is deleted:
 * a set-aside item carries `isSuppressed`, which every draw already skips,
 * and the ids of each sweep are kept so `--undo` can give them back.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { MongoClient, type Document, type ObjectId } from 'mongodb'

import {
  inKeptShare,
  isLearnedStudio,
  miniSeriesReason,
  studioCandidates,
  studiosMatcher,
  type MiniSeriesReason,
} from '@/lib/ingest/miniSeries'
import { KEPT_COLLECTION, STUDIOS_COLLECTION, accountKey } from '@/lib/ingest/miniSeriesStore'
import { SWEEPS_COLLECTION } from '@/lib/v3/pools/recap'
import { count, percent, table } from './reportFormat'

const SWEEPS = SWEEPS_COLLECTION
const REPORT = 'docs/reports/mini-series-sweep.md'
const PAUSE_EVERY = 5000
const PAUSE_MS = 400
const WRITE_BATCH = 500

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=')
  return [key, value ?? 'true'] as const
}))
const apply = args.get('apply') === 'true'
const undo = args.get('undo') === 'true'
const since = new Date(`${args.get('since') ?? '2026-08-01'}T00:00:00Z`)
const providers = (args.get('providers') ?? 'dailymotion').split(',').map((value) => value.trim()).filter(Boolean)

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Row = {
  _id: ObjectId
  title: string
  videoId: string
  provider: string
  channelId?: string
  channelTitle?: string
  universe: string
  month: string
  suppressed: boolean
}

type Verdict = Row & { reason: MiniSeriesReason }

const shuffle = <T,>(values: T[]): T[] => {
  const copy = [...values]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[other]] = [copy[other], copy[index]]
  }
  return copy
}

async function undoSweeps(db: import('mongodb').Db): Promise<void> {
  // The ad sweeps share the collection (the pools table subtracts them too) and have their own undo.
  const sweeps = await db.collection(SWEEPS).find({ kind: { $ne: 'junk' }, undoneAt: { $exists: false } }).toArray()
  let restored = 0
  for (const sweep of sweeps) {
    const ids = (sweep.ids ?? []) as ObjectId[]
    for (let start = 0; start < ids.length; start += WRITE_BATCH) {
      const slice = ids.slice(start, start + WRITE_BATCH)
      const result = await db.collection('items').updateMany(
        { _id: { $in: slice }, suppressedReason: 'mini-series' },
        { $unset: { isSuppressed: '', suppressedReason: '', suppressedAt: '', suppressedDetail: '' } },
      )
      restored += result.modifiedCount
      await wait(PAUSE_MS)
    }
    await db.collection(SWEEPS).updateOne({ _id: sweep._id }, { $set: { undoneAt: new Date() } })
  }
  console.log(`rendus : ${restored} contenus, ${sweeps.length} passages annulés`)
}

async function main(): Promise<void> {
  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20000 })
  await client.connect()
  try {
    const db = client.db(process.env.MONGODB_DB || 'randomdb')
    if (undo) return await undoSweeps(db)

    // Pass 1: the rule with the seed studios only, and the title segments counted on both sides.
    const rows: Row[] = []
    const flagged = new Map<string, number>()
    const kept = new Map<string, number>()
    const first: Array<MiniSeriesReason | null> = []
    for (const provider of providers) {
      const cursor = db.collection('items').find(
        { type: 'video', provider, createdAt: { $gte: since } },
        { projection: { title: 1, videoId: 1, provider: 1, channelId: 1, channelTitle: 1, createdAt: 1, 'v3.universe': 1, isSuppressed: 1 }, hint: 'video_provider_createdAt_lookup', batchSize: 1000 },
      ).sort({ createdAt: -1 })
      let read = 0
      for await (const doc of cursor) {
        const title = String(doc.title ?? '')
        const row: Row = {
          _id: doc._id,
          title,
          videoId: String(doc.videoId ?? ''),
          provider: String(doc.provider ?? provider),
          ...(doc.channelId ? { channelId: String(doc.channelId) } : {}),
          ...(doc.channelTitle ? { channelTitle: String(doc.channelTitle) } : {}),
          universe: String(doc.v3?.universe ?? 'other'),
          month: doc.createdAt instanceof Date ? doc.createdAt.toISOString().slice(0, 7) : '?',
          suppressed: doc.isSuppressed === true,
        }
        rows.push(row)
        const reason = miniSeriesReason(title)
        first.push(reason)
        const side = reason ? flagged : kept
        for (const candidate of studioCandidates(title)) side.set(candidate, (side.get(candidate) ?? 0) + 1)
        read += 1
        if (read % PAUSE_EVERY === 0) {
          process.stdout.write(`\r${provider} : ${count(read)} lus`)
          await wait(PAUSE_MS)
        }
      }
      process.stdout.write(`\r${provider} : ${count(read)} lus\n`)
    }

    // The studios the base itself teaches, then pass 2 in memory with them.
    const learned = [...flagged]
      .map(([name, refused]) => ({ name, refused, kept: kept.get(name) ?? 0 }))
      .filter(isLearnedStudio)
      .sort((left, right) => right.refused - left.refused)
    const matcher = studiosMatcher(learned.map((studio) => studio.name))
    const verdicts: Verdict[] = []
    rows.forEach((row, index) => {
      const reason = first[index] ?? miniSeriesReason(row.title, matcher)
      if (reason) verdicts.push({ ...row, reason })
    })

    // One in a hundred stays, one per account, counting the accounts that already have theirs.
    const claimed = new Set((await db.collection(KEPT_COLLECTION).find({}, { projection: { _id: 1 } }).toArray()).map((row) => String(row._id)))
    const keep: Verdict[] = []
    const setAside: Verdict[] = []
    for (const verdict of verdicts) {
      const account = accountKey(verdict)
      if (inKeptShare(verdict.videoId) && account && !claimed.has(account)) {
        claimed.add(account)
        keep.push(verdict)
      } else setAside.push(verdict)
    }
    const already = setAside.filter((verdict) => verdict.suppressed).length

    const by = <K extends string>(values: Verdict[], key: (value: Verdict) => K) => {
      const out = new Map<K, number>()
      for (const value of values) out.set(key(value), (out.get(key(value)) ?? 0) + 1)
      return [...out].sort((left, right) => right[1] - left[1])
    }
    const totalByUniverse = new Map<string, number>()
    for (const row of rows) totalByUniverse.set(row.universe, (totalByUniverse.get(row.universe) ?? 0) + 1)
    const totalByMonth = new Map<string, number>()
    for (const row of rows) totalByMonth.set(row.month, (totalByMonth.get(row.month) ?? 0) + 1)
    const flaggedIds = new Set(verdicts.map((verdict) => String(verdict._id)))
    const fullMovieKept = rows.filter((row) => !flaggedIds.has(String(row._id)) && /\[full movie\]/i.test(row.title))

    const lines = [
      `# Mini-séries dans la base — ${apply ? 'mise de côté' : 'comptage seul'}`,
      '',
      `Vidéos ${providers.join(', ')} entrées depuis le ${since.toISOString().slice(0, 10)} : **${count(rows.length)}**.`,
      `Repérées comme mini-séries : **${count(verdicts.length)}** (${percent(verdicts.length, rows.length)}), dont ${count(keep.length)} gardées (une sur cent, une par compte) et **${count(setAside.length)} à mettre de côté** (${count(already)} l'étaient déjà).`,
      '',
      '## Par motif',
      table(['Motif', 'Nombre'], by(verdicts, (verdict) => verdict.reason).map(([reason, n]) => [reason, count(n)])),
      '',
      '## Par univers',
      table(['Univers', 'Mini-séries', 'Sur', 'Part'], by(verdicts, (verdict) => verdict.universe).map(([universe, n]) => [universe, count(n), count(totalByUniverse.get(universe) ?? 0), percent(n, totalByUniverse.get(universe) ?? 0)])),
      '',
      '## Par mois d’entrée',
      table(['Mois', 'Mini-séries', 'Sur', 'Part'], by(verdicts, (verdict) => verdict.month).sort().map(([month, n]) => [month, count(n), count(totalByMonth.get(month) ?? 0), percent(n, totalByMonth.get(month) ?? 0)])),
      '',
      `## Studios appris de la base (${learned.length})`,
      table(['Nom', 'Sur des mini-séries', 'Ailleurs'], learned.map((studio) => [studio.name, count(studio.refused), count(studio.kept)])),
      '',
      '## Exemples par motif, au hasard',
      ...(['studio', 'narrative', 'trope', 'ai-story', 'cjk'] as MiniSeriesReason[]).flatMap((reason) => [
        `### ${reason}`,
        ...shuffle(setAside.filter((verdict) => verdict.reason === reason)).slice(0, 15).map((verdict) => `- ${verdict.title}`),
      ]),
      '',
      '## 50 titres qui seraient mis de côté, au hasard',
      ...shuffle(setAside).slice(0, 50).map((verdict) => `- ${verdict.title} · _${verdict.reason}_`),
      '',
      `## 50 titres « [Full Movie] » qui restent, au hasard (${count(fullMovieKept.length)} en tout)`,
      ...shuffle(fullMovieKept).slice(0, 50).map((row) => `- ${row.title}`),
      '',
      '## Les gardées (une par compte)',
      ...keep.slice(0, 30).map((verdict) => `- ${verdict.title}`),
    ]
    mkdirSync(dirname(REPORT), { recursive: true })
    writeFileSync(REPORT, `${lines.join('\n')}\n`)
    console.log(`${count(rows.length)} lues · ${count(verdicts.length)} mini-séries · ${count(setAside.length)} à mettre de côté · ${count(keep.length)} gardées · ${learned.length} studios appris`)
    console.log(`rapport : ${REPORT}`)

    if (!apply) return

    // The write, in small batches, the ids kept for --undo, the studios and the kept share recorded.
    const now = new Date()
    const sweepId = (await db.collection(SWEEPS).insertOne({ at: now, since, providers, ids: [] })).insertedId
    let suppressed = 0
    const pending = setAside.filter((verdict) => !verdict.suppressed)
    for (let start = 0; start < pending.length; start += WRITE_BATCH) {
      const slice = pending.slice(start, start + WRITE_BATCH)
      const result = await db.collection('items').bulkWrite(slice.map((verdict) => ({
        updateOne: {
          filter: { _id: verdict._id, isSuppressed: { $ne: true } } as Document,
          update: { $set: { isSuppressed: true, suppressedReason: 'mini-series', suppressedAt: now, suppressedDetail: verdict.reason } },
        },
      })), { ordered: false })
      suppressed += result.modifiedCount
      await db.collection(SWEEPS).updateOne({ _id: sweepId }, { $push: { ids: { $each: slice.map((verdict) => verdict._id) } } } as Document)
      process.stdout.write(`\rmis de côté : ${count(suppressed)} / ${count(pending.length)}`)
      await wait(PAUSE_MS)
    }
    process.stdout.write('\n')
    for (const verdict of keep) {
      const account = accountKey(verdict)
      if (!account) continue
      await db.collection(KEPT_COLLECTION).insertOne({ _id: account, videoId: verdict.videoId, title: verdict.title.slice(0, 200), at: now } as Document).catch(() => undefined)
      await db.collection('items').updateOne({ _id: verdict._id }, { $set: { miniSeriesKept: true } })
    }
    if (learned.length) {
      await db.collection(STUDIOS_COLLECTION).bulkWrite(learned.map((studio) => ({
        updateOne: {
          filter: { _id: studio.name } as Document,
          update: { $max: { refused: studio.refused, lastAt: now }, $setOnInsert: { kept: studio.kept, firstAt: now } },
          upsert: true,
        },
      })), { ordered: false })
    }
    // By universe, so the pools table can count only what the draw can serve.
    const byUniverse: Record<string, number> = {}
    for (const verdict of pending) byUniverse[verdict.universe] = (byUniverse[verdict.universe] ?? 0) + 1
    await db.collection(SWEEPS).updateOne({ _id: sweepId }, { $set: { suppressed, kept: keep.length, studios: learned.length, byUniverse, doneAt: new Date() } })
    console.log(`fait : ${count(suppressed)} mises de côté, ${keep.length} gardées, ${learned.length} studios enregistrés`)
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
