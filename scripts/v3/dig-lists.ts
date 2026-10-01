/**
 * Wikipedia's lists into the dig's queue (lib/v3/dig/lists.ts): every short
 * entry of each list becomes a probe of its universe, Dailymotion first.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/dig-lists.ts                 reads every list, queues the new entries
 *   node --env-file=.env.local --import tsx scripts/v3/dig-lists.ts --universe=food  one universe's lists
 *   node --env-file=.env.local --import tsx scripts/v3/dig-lists.ts --dry            reads and counts, writes nothing
 *
 * An entry already in the queue under any base — a theme, a person, a trend —
 * is left alone; a list page Wikipedia does not know is reported, not fatal.
 */

import { MongoClient } from 'mongodb'

import { fetchListTitles, listSubject, LISTS } from '@/lib/v3/dig/lists'
import { enqueue, installQueueIndexes, QUEUE, type QueuedSubject } from '@/lib/v3/dig/queue'
import { normalize } from '@/lib/v3/tagging/normalize'

const dry = process.argv.includes('--dry')
const only = process.argv.find((arg) => arg.startsWith('--universe='))?.slice(11)
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function main(): Promise<void> {
  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20_000 })
  await client.connect()
  const db = client.db(process.env.MONGODB_DB || 'randomdb')
  if (!dry) await installQueueIndexes(db).catch(() => undefined)
  // What the queue already knows, by label: a list entry never doubles a theme or a name.
  const known = new Set<string>()
  for await (const row of db.collection<QueuedSubject>(QUEUE).find({}, { projection: { label: 1, aliases: 1 } })) {
    known.add(normalize(row.label))
    for (const alias of row.aliases ?? []) known.add(normalize(alias))
  }
  console.log(`${known.size} libellés déjà dans la file`)
  let total = 0, added = 0
  for (const source of LISTS.filter((list) => !only || list.universe === only)) {
    let titles: string[] = []
    try { titles = await fetchListTitles(source) } catch (error) { console.log(`  ${source.page} : ${error instanceof Error ? error.message : String(error)}`); continue }
    const fresh = titles.filter((title) => !known.has(normalize(title)))
    for (const title of fresh) known.add(normalize(title))
    total += titles.length
    const subjects = fresh.map((title) => listSubject(title, source))
    const result = dry ? { inserted: 0, refreshed: 0 } : await enqueue(db, subjects)
    added += dry ? fresh.length : result.inserted
    console.log(`  ${source.universe.padEnd(16)} ${source.page.padEnd(44)} ${String(titles.length).padStart(4)} entrées, ${String(fresh.length).padStart(4)} nouvelles${dry ? '' : `, ${result.inserted} mises en file`}  ex. ${fresh.slice(0, 4).join(' · ')}`)
    await wait(2_000)
  }
  console.log(`${total} entrées lues, ${added} ${dry ? 'à mettre' : 'mises'} en file`)
  await client.close()
}

main().catch((error) => { console.error(error); process.exit(1) })
