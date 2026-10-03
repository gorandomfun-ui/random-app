/**
 * New small sites from Common Crawl, one country a day (lib/v3/web/commoncrawl.ts):
 * the live front pages under the country's domain, put on the waiting list
 * the previews line visits.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/web-commoncrawl.ts                 the country of the day, up to RANDOM_CC_MAX sites (3,000)
 *   node --env-file=.env.local --import tsx scripts/v3/web-commoncrawl.ts --country=cm    a country
 *   node --env-file=.env.local --import tsx scripts/v3/web-commoncrawl.ts --dry           reads, queues nothing
 *
 * The crawl's block index (105 MB) is fetched once per crawl into
 * RANDOM_CC_CACHE (the server's /home/random/cache/cc) and read as a stream;
 * then one range request per block, a pause between them. Twenty minutes at
 * most. Nothing paid, no key.
 */

import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { MongoClient } from 'mongodb'

import { closeRun, journalHost, openRun, type RunCounters } from '@/lib/v3/ingest/journal'
import { enqueueSites, type CandidateInput } from '@/lib/v3/web/candidates'
import { blocksFor, clusterUrl, countryOfDay, fetchBlock, latestCrawl, rootPagesIn, type Block, type RootPage } from '@/lib/v3/web/commoncrawl'
import { WORLD_COUNTRIES } from '@/lib/v3/web/worldQueries'

const MAX_SITES = Number(process.env.RANDOM_CC_MAX ?? 3000)
const MAX_MINUTES = Number(process.env.RANDOM_CC_MINUTES ?? 20)
const CACHE = process.env.RANDOM_CC_CACHE ?? './.cache/cc'
const PAUSE_MS = 250
const dry = process.argv.includes('--dry')
const countryArg = process.argv.find((arg) => arg.startsWith('--country='))?.slice(10)
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** The crawl's block index on disk, fetched once; older crawls' copies removed. */
async function clusterFile(crawl: string): Promise<string> {
  mkdirSync(CACHE, { recursive: true })
  const file = join(CACHE, `${crawl}.cluster.idx`)
  if (existsSync(file)) return file
  for (const old of readdirSync(CACHE)) if (old.endsWith('.cluster.idx')) unlinkSync(join(CACHE, old))
  const response = await fetch(clusterUrl(crawl))
  if (!response.ok || !response.body) throw new Error(`commoncrawl: cluster.idx HTTP ${response.status}`)
  const partial = `${file}.part`
  await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), createWriteStream(partial))
  const { renameSync } = await import('node:fs')
  renameSync(partial, file)
  return file
}

async function blocksOf(file: string, country: string): Promise<Block[]> {
  const lines = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity })
  const collected: string[] = []
  let inside = false
  const prefixes = [`${country},`, `${country})`]
  let previous = ''
  // Only the country's stretch of the file is kept in memory: the line before it, its lines, and the first line after.
  for await (const line of lines) {
    const key = line.split('\t')[0] ?? ''
    const matches = prefixes.some((prefix) => key.startsWith(prefix))
    if (matches) { if (!inside && previous) collected.push(previous); collected.push(line); inside = true }
    else if (inside) break
    previous = line
  }
  return blocksFor(collected, country)
}

async function main(): Promise<void> {
  const startedAt = new Date()
  const deadline = startedAt.getTime() + MAX_MINUTES * 60_000
  const country = (countryArg && /^[a-z]{2}$/i.test(countryArg) ? countryArg : countryOfDay(WORLD_COUNTRIES, startedAt)).toLowerCase()
  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20_000 })
  await client.connect()
  const db = client.db(process.env.MONGODB_DB || 'randomdb')
  const runId = dry ? null : await openRun(db, { line: 'web-commoncrawl', startedAt, host: journalHost() })
  const counters: RunCounters = { scanned: 0, inserted: 0, duplicates: 0, rejected: {}, byProvider: {} }
  const errors: string[] = []
  let crawl = '', blocks: Block[] = [], read = 0, hitDeadline = false
  const seen = new Map<string, RootPage>()
  try {
    crawl = await latestCrawl()
    const file = await clusterFile(crawl)
    blocks = await blocksOf(file, country)
    console.log(`[commoncrawl] ${crawl} · .${country} · ${blocks.length} blocs`)
    for (const block of blocks) {
      if (Date.now() > deadline) { hitDeadline = true; break }
      if (seen.size >= MAX_SITES) break
      try {
        const records = await fetchBlock(crawl, block)
        counters.scanned += records.length
        rootPagesIn(records, country, seen)
        read += 1
      } catch (error) {
        errors.push(`${block.file}@${block.offset}: ${error instanceof Error ? error.message : 'unreadable'}`)
        if (errors.length > 5) break
      }
      await wait(PAUSE_MS)
    }
    const pages = [...seen.values()].slice(0, MAX_SITES)
    const rows: CandidateInput[] = pages.map((page) => ({ url: page.url, source: 'commoncrawl', sourceName: 'Common Crawl', sourceUrl: 'https://commoncrawl.org/', tags: [`country:${country}`] }))
    const queued = dry ? { queued: 0, known: 0 } : await enqueueSites(db, rows)
    counters.inserted = queued.queued
    counters.duplicates = queued.known
    counters.byProvider = { commoncrawl: queued.queued }
    const note = `.${country} · ${crawl} · ${read}/${blocks.length} blocs lus · ${pages.length} pages d'accueil vivantes · ${queued.queued} mises en attente`
    const status = errors.length && !read ? 'failed' : hitDeadline || errors.length ? 'partial' : 'ok'
    if (runId) await closeRun(db, runId, { finishedAt: new Date(), status, counters, errors, note })
    console.log(JSON.stringify({ commoncrawl: dry ? 'dry' : 'ok', country, crawl, blocks: blocks.length, read, scanned: counters.scanned, frontPages: pages.length, queued: queued.queued, known: queued.known, errors, hitDeadline, durationMs: Date.now() - startedAt.getTime() }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'commoncrawl failed'
    if (runId) await closeRun(db, runId, { finishedAt: new Date(), status: 'failed', counters, errors: [...errors, message] }).catch(() => undefined)
    console.error(message)
    process.exitCode = 1
  } finally {
    await client.close()
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
