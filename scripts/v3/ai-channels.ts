/**
 * The channels that turn out AI videos by the dozen — generated tales, micro
 * documentaries, devotional clips, "magic snails" — found by what they say of
 * themselves somewhere: a title, a hashtag, a line of description. Most of
 * their videos say nothing (the owner's screenshots of 28 September); the
 * channel gives them away. Counted, shown, and — only when asked — set aside.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/ai-channels.ts            read only: the channels, examples, a report
 *   node --env-file=.env.local --import tsx scripts/v3/ai-channels.ts --apply    sets their videos aside (suppressedReason 'ai-channel')
 *   node --env-file=.env.local --import tsx scripts/v3/ai-channels.ts --undo     gives them back
 *
 * A channel is a factory when at least MIN_MARKED of its videos are marked and
 * they are at least MIN_SHARE of what it has here. One pass over the videos,
 * the description cut short on the server, a pause between batches.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { MongoClient, type Document, type ObjectId } from 'mongodb'

import { isAiMarked } from '@/lib/v3/cool/themes'
import { count, table } from './reportFormat'

export const AI_CHANNELS = 'ai_channels_v1'
const SWEEPS = 'ai_channel_sweeps_v1'
const REPORT = 'docs/reports/ai-channels.md'
/** Channels read by hand and kept: real footage whose few marks were words, not tools (28 September). */
const KEEP = new Set(['GiulioPhotography'])
const MIN_MARKED = 3
const MIN_SHARE = 0.3
const PAUSE_EVERY = 5000
const PAUSE_MS = 300
const WRITE_BATCH = 500
const apply = process.argv.includes('--apply')
const undo = process.argv.includes('--undo')
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Channel = { key: string; name: string; total: number; marked: number; ids: ObjectId[]; examples: string[] }

async function main(): Promise<void> {
  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20000 })
  await client.connect()
  try {
    const db = client.db(process.env.MONGODB_DB || 'randomdb')
    if (undo) {
      let restored = 0
      for (const sweep of await db.collection(SWEEPS).find({ undoneAt: { $exists: false } }).toArray()) {
        const ids = (sweep.ids ?? []) as ObjectId[]
        for (let start = 0; start < ids.length; start += WRITE_BATCH) {
          restored += (await db.collection('items').updateMany({ _id: { $in: ids.slice(start, start + WRITE_BATCH) }, suppressedReason: 'ai-channel' }, { $unset: { isSuppressed: '', suppressedReason: '', suppressedAt: '', suppressedDetail: '' } })).modifiedCount
          await wait(PAUSE_MS)
        }
        await db.collection(SWEEPS).updateOne({ _id: sweep._id }, { $set: { undoneAt: new Date() } })
      }
      await db.collection(AI_CHANNELS).deleteMany({})
      console.log(`rendues : ${restored}`)
      return
    }
    const channels = new Map<string, Channel>()
    let read = 0
    const cursor = db.collection('items').aggregate([
      { $match: { type: 'video', isSuppressed: { $ne: true } } },
      { $project: { title: 1, channelTitle: 1, channelKey: '$v3.channelKey', description: { $substrCP: [{ $ifNull: ['$description', ''] }, 0, 800] } } },
    ], { allowDiskUse: false, batchSize: 1000 })
    for await (const doc of cursor) {
      read += 1
      if (read % PAUSE_EVERY === 0) { process.stdout.write(`\r${count(read)} lues`); await wait(PAUSE_MS) }
      const key = String(doc.channelKey ?? '')
      if (!key) continue
      const channel = channels.get(key) ?? { key, name: String(doc.channelTitle ?? key), total: 0, marked: 0, ids: [], examples: [] }
      channel.total += 1
      channel.ids.push(doc._id)
      if (isAiMarked(`${doc.title ?? ''} ${doc.channelTitle ?? ''} ${doc.description ?? ''}`)) {
        channel.marked += 1
        if (channel.examples.length < 3) channel.examples.push(String(doc.title ?? '').slice(0, 90))
      }
      channels.set(key, channel)
    }
    process.stdout.write(`\r${count(read)} lues\n`)
    const factories = [...channels.values()].filter((channel) => !KEEP.has(channel.name) && channel.marked >= MIN_MARKED && channel.marked / channel.total >= MIN_SHARE)
      .sort((left, right) => right.total - left.total)
    const videos = factories.reduce((sum, channel) => sum + channel.total, 0)
    const lines = [
      `# Chaînes à vidéos IA — ${apply ? 'mises de côté' : 'comptage seul'}`,
      '',
      `Vidéos lues : ${count(read)}. Chaînes « usines » (au moins ${MIN_MARKED} vidéos marquées IA, et au moins ${Math.round(MIN_SHARE * 100)} % des leurs) : **${count(factories.length)}**, pour **${count(videos)}** vidéos.`,
      '',
      table(['Chaîne', 'Vidéos ici', 'Marquées IA', 'Exemples'], factories.slice(0, 80).map((channel) => [channel.name.slice(0, 40), count(channel.total), count(channel.marked), channel.examples.join(' · ').slice(0, 160)])),
    ]
    mkdirSync(dirname(REPORT), { recursive: true })
    writeFileSync(REPORT, `${lines.join('\n')}\n`)
    console.log(`${count(factories.length)} chaînes · ${count(videos)} vidéos · rapport ${REPORT}`)
    if (!apply) return

    const now = new Date()
    await db.collection(AI_CHANNELS).bulkWrite(factories.map((channel) => ({ replaceOne: { filter: { _id: channel.key } as Document, replacement: { _id: channel.key, name: channel.name, total: channel.total, marked: channel.marked, at: now }, upsert: true } })), { ordered: false })
    const sweepId = (await db.collection(SWEEPS).insertOne({ at: now, ids: [] })).insertedId
    const ids = factories.flatMap((channel) => channel.ids)
    let suppressed = 0
    for (let start = 0; start < ids.length; start += WRITE_BATCH) {
      const slice = ids.slice(start, start + WRITE_BATCH)
      suppressed += (await db.collection('items').updateMany({ _id: { $in: slice }, isSuppressed: { $ne: true } } as Document, { $set: { isSuppressed: true, suppressedReason: 'ai-channel', suppressedAt: now } })).modifiedCount
      await db.collection(SWEEPS).updateOne({ _id: sweepId }, { $push: { ids: { $each: slice } } } as Document)
      await wait(PAUSE_MS)
    }
    console.log(`fait : ${count(suppressed)} vidéos mises de côté`)
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
