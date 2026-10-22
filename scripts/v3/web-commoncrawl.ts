/**
 * New small sites from Common Crawl, one country a day (lib/v3/web/commoncrawl.ts):
 * the live front pages under the country's domain, put on the waiting list
 * the previews line visits.
 *
 *   node --env-file=.env.local --import tsx scripts/v3/web-commoncrawl.ts                 the country of the day, then the next ones (RANDOM_CC_COUNTRIES, 6) until RANDOM_CC_MAX sites (1,500)
 *   node --env-file=.env.local --import tsx scripts/v3/web-commoncrawl.ts --country=cm    a country
 *   node --env-file=.env.local --import tsx scripts/v3/web-commoncrawl.ts --dry           reads, queues nothing
 *
 * Since 22 October it rests while three thousand of its sites still wait for their visit (they get at most half of what
 * a pass takes in, scripts/v3/web-previews.ts), and it brings the brands of the night's countries from Wikidata
 * (lib/v3/web/brands.ts), the owner's "marques de jambon en Croatie".
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
import { CANDIDATES, enqueueSites, type CandidateInput } from '@/lib/v3/web/candidates'
import { brandSites } from '@/lib/v3/web/brands'
import { blocksFor, clusterUrl, countriesFrom, fetchBlock, latestCrawl, rootPagesIn, type Block, type RootPage } from '@/lib/v3/web/commoncrawl'
import { WORLD_COUNTRIES } from '@/lib/v3/web/worldQueries'

/** Halved on 12 October: its front pages were most of what the owner found dull ("99 % des sites sont un peu nazes"). */
const MAX_SITES = Number(process.env.RANDOM_CC_MAX ?? 1500)
/** Countries a run may go through when the day's one is small. */
const MAX_COUNTRIES = Number(process.env.RANDOM_CC_COUNTRIES ?? 6)
const MAX_MINUTES = Number(process.env.RANDOM_CC_MINUTES ?? 20)
const CACHE = process.env.RANDOM_CC_CACHE ?? './.cache/cc'
/** Common Crawl's sites waiting for a visit past which a night brings no more of them. */
const BACKLOG_MAX = Number(process.env.RANDOM_CC_BACKLOG ?? 3000)
/** Brands a night brings at most, from the countries it went through. */
const MAX_BRANDS = Number(process.env.RANDOM_BRANDS_MAX ?? 600)
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
  const countries = countryArg && /^[a-z]{2}$/i.test(countryArg) ? [countryArg.toLowerCase()] : countriesFrom(WORLD_COUNTRIES, MAX_COUNTRIES, startedAt)
  const client = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 20_000 })
  await client.connect()
  const db = client.db(process.env.MONGODB_DB || 'randomdb')
  const runId = dry ? null : await openRun(db, { line: 'web-commoncrawl', startedAt, host: journalHost() })
  const counters: RunCounters = { scanned: 0, inserted: 0, duplicates: 0, rejected: {}, byProvider: {} }
  const errors: string[] = []
  let crawl = '', blocks = 0, read = 0, hitDeadline = false
  const visited: string[] = []
  const rows: CandidateInput[] = []
  let backlog = 0
  try {
    backlog = await db.collection(CANDIDATES).countDocuments({ source: 'commoncrawl', status: 'new' }, { maxTimeMS: 20_000 }).catch(() => 0)
    const resting = backlog >= BACKLOG_MAX
    if (resting) console.log(`[commoncrawl] ${backlog} de ses sites attendent déjà leur visite : pas de nouveaux cette nuit`)
    crawl = resting ? '' : await latestCrawl()
    const file = resting ? '' : await clusterFile(crawl)
    for (const country of resting ? [] : countries) {
      if (rows.length >= MAX_SITES || hitDeadline) break
      const seen = new Map<string, RootPage>()
      // A big country has thousands of blocks and a run reads a hundred: in a random order, so each visit of the country reads other hosts than the last.
      const own = (await blocksOf(file, country)).map((block) => ({ block, order: Math.random() })).sort((a, b) => a.order - b.order).map(({ block }) => block)
      blocks += own.length
      visited.push(country)
      for (const block of own) {
        if (Date.now() > deadline) { hitDeadline = true; break }
        if (rows.length + seen.size >= MAX_SITES) break
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
      const pages = [...seen.values()].slice(0, Math.max(0, MAX_SITES - rows.length))
      rows.push(...pages.map((page) => ({ url: page.url, source: 'commoncrawl', sourceName: 'Common Crawl', sourceUrl: 'https://commoncrawl.org/', tags: [`country:${country}`] })))
      console.log(`[commoncrawl] ${crawl} · .${country} · ${own.length} blocs · ${pages.length} pages d'accueil vivantes`)
    }
    const queued = dry ? { queued: 0, known: 0 } : await enqueueSites(db, rows)
    // The brands of the night's countries, or of the day's when Common Crawl rests (lib/v3/web/brands.ts).
    const brands: CandidateInput[] = []
    const brandCountries: string[] = []
    for (const country of (visited.length ? visited : countries)) {
      if (brands.length >= MAX_BRANDS || Date.now() > deadline) break
      try {
        brands.push(...(await brandSites(country)).slice(0, MAX_BRANDS - brands.length))
        brandCountries.push(country)
      } catch (error) {
        errors.push(`marques .${country} : ${error instanceof Error ? error.message : 'unreadable'}`)
      }
      await wait(2000)
    }
    const brandsQueued = dry ? { queued: 0, known: 0 } : await enqueueSites(db, brands)
    console.log(`[marques] ${brandCountries.map((country) => `.${country}`).join(' ')} · ${brands.length} sites de marques · ${brandsQueued.queued} mis en attente`)
    counters.inserted = queued.queued + brandsQueued.queued
    counters.duplicates = queued.known + brandsQueued.known
    counters.byProvider = { commoncrawl: queued.queued, 'wikidata-brand': brandsQueued.queued }
    const note = `${resting ? `Common Crawl au repos (${backlog} en attente)` : `${visited.map((country) => `.${country}`).join(' ')} · ${crawl} · ${read}/${blocks} blocs lus · ${rows.length} pages d'accueil vivantes · ${queued.queued} mises en attente`} · marques ${brandCountries.map((country) => `.${country}`).join(' ')} : ${brandsQueued.queued} mises en attente`
    const status = errors.length && !read && !brands.length ? 'failed' : hitDeadline || errors.length ? 'partial' : 'ok'
    if (runId) await closeRun(db, runId, { finishedAt: new Date(), status, counters, errors, note })
    console.log(JSON.stringify({ commoncrawl: dry ? 'dry' : 'ok', countries: visited, crawl, blocks, read, scanned: counters.scanned, frontPages: rows.length, queued: queued.queued, known: queued.known, backlog, brands: brands.length, brandsQueued: brandsQueued.queued, errors, hitDeadline, durationMs: Date.now() - startedAt.getTime() }))
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
