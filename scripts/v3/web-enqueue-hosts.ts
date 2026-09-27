/**
 * The small sites behind the pages set aside on 27 September: each page was
 * dull, but the site it belongs to — a brewery, a theatre, a repair shop, a
 * town — is what the owner wants in the web part. Their front pages go to the
 * waiting list (lib/v3/web/candidates.ts), where the server visits them.
 *
 *   node --import tsx scripts/v3/web-enqueue-hosts.ts           counts, writes nothing
 *   node --import tsx scripts/v3/web-enqueue-hosts.ts --apply   puts them in the waiting list
 *
 * Gentle on the small database: batches of a thousand, a pause between them.
 */

import { MongoClient } from 'mongodb'

import { enqueueSites } from '@/lib/v3/web/candidates'
import { frontPageOf } from '@/lib/v3/web/quality'

const BATCH = 1000
const PAUSE_MS = 1500
const apply = process.argv.includes('--apply')
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function main(): Promise<void> {
  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20000 })
  await client.connect()
  try {
    const db = client.db(process.env.MONGODB_DB || 'randomdb')
    const fronts = new Map<string, string>()
    for await (const doc of db.collection('items').find({ type: 'web', suppressedReason: 'web-dull' }, { projection: { url: 1 }, batchSize: 2000 })) {
      const front = frontPageOf(String(doc.url ?? ''))
      if (!front) continue
      const host = new URL(front).hostname.replace(/^www\./, '')
      if (!fronts.has(host)) fronts.set(host, front)
    }
    const urls = [...fronts.values()].sort(() => Math.random() - 0.5)
    console.log(`sites derrière les pages mises de côté : ${urls.length.toLocaleString('fr-FR')}`)
    if (!apply) return
    let queued = 0
    let known = 0
    for (let start = 0; start < urls.length; start += BATCH) {
      const result = await enqueueSites(db, urls.slice(start, start + BATCH).map((url) => ({ url, source: 'set-aside' })))
      queued += result.queued
      known += result.known
      console.log(`${Math.min(start + BATCH, urls.length).toLocaleString('fr-FR')} / ${urls.length.toLocaleString('fr-FR')} · en file ${queued.toLocaleString('fr-FR')} · déjà là ${known.toLocaleString('fr-FR')}`)
      await wait(PAUSE_MS)
    }
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
