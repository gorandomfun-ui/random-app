/**
 * The server's `web-previews` line: visits the sites waiting in
 * web_candidates_v1 (lib/v3/web/candidates.ts), a few at a time, and puts the
 * living ones into the catalogue with a preview — their own og:image when it
 * is good, else the largest picture their page shows (27 September: that
 * covers 49 sites in 52), else, only when the previews bucket exists, a
 * capture of the page taken by Chromium (lib/v3/web/gcs.ts). Without the
 * bucket no browser is started at all: a site with no picture is left.
 *
 *   node --import tsx scripts/v3/web-previews.ts                 a pass: 20 minutes, 300 sites at most, 4 at a time
 *   node --import tsx scripts/v3/web-previews.ts --minutes=5 --max=20 --parallel=2
 *   node --import tsx scripts/v3/web-previews.ts --dry --max=10  visits, writes nothing
 *   node --import tsx scripts/v3/web-previews.ts --url=https://… --url=https://… [--captures]   those sites only, dry
 *
 * Built on 28 September for the owner's picture of the web part — the small
 * sites of the world, a plumber in Douala — after two good sites in three were
 * found to have no usable preview. Debian's own Chromium (security updates by
 * apt), its sandbox kept, one page at a time: the machine is an e2-micro.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Db } from 'mongodb'
import type { Browser } from 'playwright-core'

import { closeRun, journalHost, openRun, type RunCounters } from '@/lib/v3/ingest/journal'
import { candidateCounts, previewObjectName, settleCandidates, siteKey, storedForms, takeCandidates, type Candidate, type CandidateStatus } from '@/lib/v3/web/candidates'
import { gcsUploader, PREVIEW_KEY_FILE, type Upload } from '@/lib/v3/web/gcs'
import { checkEmbeddable, embedVerdict, type EmbedVerdict } from '@/lib/v3/web/embed'
import { notASiteReason, pageImages, readPage } from '@/lib/v3/web/pageSignals'
import { probePreview } from '@/lib/v3/web/previewImage'
import { boringWebReason, frontPageOf, institutionReason } from '@/lib/v3/web/quality'
import { upsertWebRows, type WebInsertRow } from '@/lib/v3/web/store'
import { toneOfPage } from '@/lib/v3/web/tone'

const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
const CHROMIUM = process.env.RANDOM_CHROMIUM || '/usr/bin/chromium'

/** What a browser needs to run, and nothing of .env.ingest. */
function browserEnvironment(): Record<string, string> {
  const keep = ['HOME', 'PATH', 'TMPDIR', 'LANG', 'TZ']
  return Object.fromEntries(keep.flatMap((name) => (process.env[name] ? [[name, process.env[name] as string]] : [])))
}
const VIEWPORT = { width: 1200, height: 750 }
const HTML_LIMIT = 1_500_000
/** A blank or nearly blank capture compresses to almost nothing. */
const MIN_SHOT_BYTES = 14_000
const SHOTS_PER_BROWSER = 25
/** The button that closes a cookie banner, in the languages of the sites visited: its first words, and a short label. */
const CONSENT = /^\s*(?:accept|i accept|agree|i agree|allow all|allow cookies|ok|okay|got it|consent|accepter|tout accepter|j'accepte|autoriser|aceptar|acepto|aceitar|akzeptieren|alle akzeptieren|alles akzeptieren|zustimmen|accetta|accetto|zgadzam się|akceptuj|godkänn|acceptera|tillåt alla|akkoord|accepteren|alles accepteren|kabul et|kabul ediyorum|setuju|đồng ý)\b.{0,24}$/i

function numericFlag(name: string, fallback: number): number {
  const raw = process.argv.find((argument) => argument.startsWith(`--${name}=`))
  const value = raw ? Number(raw.split('=')[1]) : NaN
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function keywordsOf(value: string): string[] {
  const out: string[] = []
  for (const word of value.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)) {
    if (word.length >= 3 && word.length <= 18 && !out.includes(word)) out.push(word)
    if (out.length >= 8) break
  }
  return out
}

type HeaderReader = { get(name: string): string | null }
/** The page as received: its address after redirects, its HTML, and its answer's status and headers (whether it may be framed). */
type Page = { finalUrl: string; html: string; status?: number; headers?: HeaderReader }

async function fetchPage(url: string): Promise<Page | { error: string }> {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
      headers: { 'user-agent': BROWSER_UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en,fr;q=0.8,*;q=0.5' },
    })
    if (response.status >= 400) return { error: `http ${response.status}` }
    const type = response.headers.get('content-type') ?? ''
    if (type && !/html/i.test(type)) return { error: `not a page: ${type.split(';')[0]}` }
    const reader = response.body?.getReader()
    if (!reader) return { error: 'empty' }
    const chunks: Uint8Array[] = []
    let size = 0
    while (size < HTML_LIMIT) {
      const { done, value } = await reader.read()
      if (done || !value) break
      chunks.push(value)
      size += value.length
    }
    reader.cancel().catch(() => undefined)
    return { finalUrl: response.url || url, html: Buffer.concat(chunks).toString('utf8'), status: response.status, headers: response.headers }
  } catch (error) {
    const cause = (error as { cause?: { code?: string } })?.cause?.code
    return { error: `unreachable: ${cause || (error instanceof Error ? error.name : 'error')}` }
  }
}

class Camera {
  private browser: Browser | null = null
  private shots = 0
  /** One page at a time in the browser, whatever the number of visits running: the machine is small. */
  private turn: Promise<unknown> = Promise.resolve()

  shoot(url: string): ReturnType<Camera['shootNow']> {
    const run = this.turn.then(() => this.shootNow(url))
    this.turn = run.catch(() => undefined)
    return run
  }

  private async open(): Promise<Browser> {
    if (this.browser && this.shots < SHOTS_PER_BROWSER) return this.browser
    await this.close()
    const { chromium } = await import('playwright-core')
    // Its own sandbox on (Playwright turns it off unless asked: the browser visited thousands of unknown sites a day
    // without it, 18 October; tested on the server under the line's own restrictions), and none of the line's settings:
    // the base's address and the keys stay out of the browser's environment.
    this.browser = await chromium.launch({
      executablePath: CHROMIUM,
      headless: true,
      chromiumSandbox: true,
      env: browserEnvironment(),
      args: ['--disable-dev-shm-usage', '--disable-gpu', '--mute-audio', '--no-first-run', '--disable-extensions', '--disable-background-networking', '--disable-sync'],
    })
    this.shots = 0
    return this.browser
  }

  /** The page as a browser sees it: its address after redirects, its HTML, its answer's headers, and a capture when it shows something. */
  private async shootNow(url: string): Promise<{ image: Buffer | null; finalUrl: string; html: string; status?: number; headers?: HeaderReader; blank?: string } | { error: string }> {
    const browser = await this.open()
    this.shots += 1
    const context = await browser.newContext({ viewport: VIEWPORT, userAgent: BROWSER_UA, locale: 'en-US', acceptDownloads: false, serviceWorkers: 'block' })
    try {
      const page = await context.newPage()
      await page.route('**/*', (route) => (['media', 'websocket'].includes(route.request().resourceType()) ? route.abort() : route.continue()))
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      if (response && response.status() >= 400) return { error: `http ${response.status()} in the browser too` }
      const all = response ? await response.allHeaders().catch(() => ({} as Record<string, string>)) : null
      const answer = response && all ? { status: response.status(), headers: { get: (name: string) => all[name.toLowerCase()] ?? null } } : {}
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined)
      await page.getByRole('button', { name: CONSENT }).first().click({ timeout: 1_500 }).then(() => page.waitForTimeout(600)).catch(() => undefined)
      // A banner the button did not close: a fixed layer speaking of cookies is hidden, the page underneath let scroll again.
      await page.evaluate(() => {
        for (const element of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
          const style = getComputedStyle(element)
          if (style.position !== 'fixed' && style.position !== 'sticky') continue
          const box = element.getBoundingClientRect()
          if (box.width * box.height < 40_000) continue
          if (/cookie|consent|gdpr|rgpd|privacy|confidentialité|kakor|datenschutz|privacidad/i.test(element.innerText.slice(0, 1500))) element.style.setProperty('display', 'none', 'important')
        }
        document.documentElement.style.setProperty('overflow', 'auto', 'important')
        document.body?.style.setProperty('overflow', 'auto', 'important')
      }).catch(() => undefined)
      const visible = await page.evaluate(() => ({
        text: (document.body?.innerText ?? '').trim().length,
        images: Array.from(document.images).filter((image) => image.naturalWidth > 80 && image.getBoundingClientRect().top < 750).length,
      })).catch(() => ({ text: 0, images: 0 }))
      const finalUrl = page.url()
      const html = await page.content().catch(() => '')
      if (visible.text < 20 && visible.images === 0) return { image: null, finalUrl, html, ...answer, blank: 'blank page' }
      // The e2-micro is slow: a capture can take twenty seconds when the page is heavy; animations are stopped for it.
      const image = await page.screenshot({ type: 'jpeg', quality: 72, timeout: 30_000, animations: 'disabled', caret: 'hide' })
      if (image.length < MIN_SHOT_BYTES) return { image: null, finalUrl, html, ...answer, blank: `blank capture (${image.length} bytes)` }
      return { image, finalUrl, html, ...answer }
    } catch (error) {
      return { error: `capture: ${error instanceof Error ? error.message.split('\n')[0].slice(0, 120) : 'error'}` }
    } finally {
      await context.close().catch(() => undefined)
    }
  }

  async close(): Promise<void> {
    await this.browser?.close().catch(() => undefined)
    this.browser = null
  }
}

type Visit = { status: CandidateStatus; outcome: string; row?: WebInsertRow }

async function alreadyStored(db: Db, url: string): Promise<boolean> {
  return Boolean(await db.collection('items').findOne({ type: 'web', url: { $in: storedForms(url) } }, { projection: { _id: 1 } }))
}

/** The first of the page's pictures good enough to stand for the site. */
async function firstPicture(urls: string[]): Promise<{ url: string; width: number; height: number } | null> {
  for (const url of urls) {
    const picture = await probePreview(url)
    if (picture) return picture
  }
  return null
}

const SAVE_DIR = process.env.RANDOM_PREVIEW_SAVE

/**
 * Common Crawl's universities, town halls and administrations are taken in up to this share of the sites a pass takes
 * in (the owner, 13 October: "ça me va, mais comme toujours pas 90 % du pool"); past it, the pass leaves the next ones
 * out. They were 4.7 % of the stored sites that day.
 */
const INSTITUTION_SHARE = 0.1
class InstitutionShare {
  private taken = 0
  private institutions = 0
  room(): boolean { return this.institutions + 1 <= INSTITUTION_SHARE * (this.taken + 1) + 2 }
  count(institution: boolean): void { this.taken += 1; if (institution) this.institutions += 1 }
}

/**
 * Whether the site opens inside Random, read from the answer the visit just received — the same verdict the night
 * check gives (lib/v3/web/embed.ts), a day sooner and without asking again. A site left on plain http is asked once
 * for its https twin. Since 12 October only these are drawn (the owner: "s'ouvrent toujours à côté").
 */
async function frameOf(page: Page): Promise<EmbedVerdict> {
  const verdict = page.headers ? embedVerdict({ status: page.status ?? 200, headers: page.headers, url: page.finalUrl }) : await checkEmbeddable(page.finalUrl)
  if (verdict.embeddable || verdict.reason !== 'http-only') return verdict
  const twin = await checkEmbeddable(page.finalUrl.replace(/^http:/i, 'https:'))
  return twin.embeddable ? twin : verdict
}

async function visit(db: Db, candidate: Candidate, camera: Camera | null, upload: Upload | null, dryRun: boolean, share: InstitutionShare): Promise<Visit> {
  let page: Page | { error: string } = await fetchPage(candidate.url)
  let capture: { image: Buffer | null; blank?: string } | null = null
  // A small site behind a shield often refuses a plain request and shows itself to a browser (only when captures are on).
  if ('error' in page && camera && /^http (?:403|429|503)$/.test(page.error)) {
    const shot = await camera.shoot(candidate.url)
    if ('error' in shot) return { status: 'dead', outcome: `${page.error}; ${shot.error}` }
    page = { finalUrl: shot.finalUrl, html: shot.html, status: shot.status, headers: shot.headers }
    capture = shot
  }
  if ('error' in page) return { status: /^not a page/.test(page.error) ? 'dull' : 'dead', outcome: page.error }
  const finalUrl = page.finalUrl
  const front = siteKey(candidate.url) === candidate.host
  if (front && !frontPageOf(finalUrl)) return { status: 'dull', outcome: `moved to a platform: ${new URL(finalUrl).hostname}` }
  if (siteKey(finalUrl) !== siteKey(candidate.url) && await alreadyStored(db, finalUrl)) return { status: 'done', outcome: 'already in the catalogue' }
  const reading = readPage(page.html, finalUrl)
  const notASite = notASiteReason(reading, page.html)
  if (notASite) return { status: 'dull', outcome: notASite }
  const title = candidate.title || reading.title || new URL(finalUrl).hostname.replace(/^www\./, '')
  const dull = boringWebReason(finalUrl, title, front ? null : candidate.source)
  if (dull) return { status: 'dull', outcome: dull }
  // Common Crawl's universities, town halls and administrations: in, while they stay under their share.
  const institution = candidate.source === 'commoncrawl' ? institutionReason(finalUrl, title) : null
  if (institution && !share.room()) return { status: 'dull', outcome: `institution: ${institution}, au-delà de sa part` }
  // A site that will not open inside Random is never drawn: it is not taken in, nor photographed.
  const frame = await frameOf(page)
  if (!frame.embeddable) return { status: 'noframe', outcome: `ne s'ouvre pas dans Random : ${frame.reason}` }

  let ogImage: string | null = null
  let imageMeta = { width: VIEWPORT.width, height: VIEWPORT.height }
  let preview: 'og' | 'source' | 'page' | 'shot' = 'og'
  const own = reading.ogImage ? await probePreview(reading.ogImage) : null
  // The picture its source gives — Neocities' own screenshot — before the page's pictures and before a capture.
  const given = !own && candidate.image ? await probePreview(candidate.image) : null
  const picture = own || given ? null : await firstPicture(pageImages(page.html, finalUrl, 6))
  if (own || given || picture) {
    const chosen = (own ?? given ?? picture)!
    ogImage = chosen.url
    imageMeta = { width: chosen.width, height: chosen.height }
    preview = own ? 'og' : given ? 'source' : 'page'
  } else {
    if (!camera) return { status: 'noimage', outcome: 'no picture on the page (captures off)' }
    if (!capture) {
      const shot = await camera.shoot(finalUrl)
      if ('error' in shot) return { status: /^capture/.test(shot.error) ? 'failed' : 'dead', outcome: shot.error }
      capture = shot
    }
    if (!capture.image) return { status: 'noimage', outcome: capture.blank ?? 'no capture' }
    preview = 'shot'
    const name = previewObjectName(finalUrl)
    if (SAVE_DIR) {
      mkdirSync(join(SAVE_DIR, 'previews'), { recursive: true })
      writeFileSync(join(SAVE_DIR, name), capture.image)
    }
    ogImage = dryRun || !upload ? `dry:${name}` : await upload(name, capture.image, 'image/jpeg')
  }
  const host = new URL(finalUrl).hostname.replace(/^www\./, '')
  const text = candidate.text || reading.description || title
  // Light or dark, as the site declares it, for the logo over the frame (as the night check reads it).
  const tone = await toneOfPage(page.html, finalUrl, { timeoutMs: 6000 })
  share.count(Boolean(institution))
  return {
    status: 'done',
    outcome: preview,
    row: {
      type: 'web',
      url: finalUrl,
      title,
      text,
      host,
      ogImage,
      provider: candidate.source,
      source: { name: candidate.sourceName || host, url: candidate.sourceUrl || finalUrl },
      tags: Array.from(new Set([host, ...(candidate.tags ?? [])])).filter(Boolean),
      keywords: keywordsOf(`${title} ${text}`),
      imageMeta,
      webPreview: preview,
      embeddable: true,
      embedReason: 'ok',
      embedUrl: frame.url && frame.url !== finalUrl ? frame.url : null,
      embedTone: tone.tone,
      embedToneEvidence: tone.evidence,
      embedCheckedAt: new Date(),
    },
  }
}

/** Sites given by hand, to see what a visit would make of them. */
function handCandidates(): Candidate[] {
  const now = new Date()
  return process.argv.filter((argument) => argument.startsWith('--url=')).map((argument, index) => {
    const url = argument.slice('--url='.length)
    const key = siteKey(url) ?? url
    return { _id: key, url, host: key.split('/')[0], source: 'test', status: 'new', attempts: 0, rand: index, createdAt: now, nextAt: now }
  })
}

/** A site's whole visit, at most. Past it the site is "failed" and comes back with the next retries. */
const SITE_MS = 60_000
function withinSiteLimit(visiting: Promise<Visit>): Promise<Visit> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ status: 'failed', outcome: 'visite trop longue (plus d’une minute)' }), SITE_MS)
    visiting.then((result) => { clearTimeout(timer); resolve(result) }, (error) => { clearTimeout(timer); reject(error) })
  })
}

async function main(): Promise<void> {
  const byHand = handCandidates()
  const dryRun = process.argv.includes('--dry') || byHand.length > 0
  const minutes = numericFlag('minutes', 20)
  const max = numericFlag('max', 300)
  const parallel = Math.min(8, numericFlag('parallel', 4))
  const deadline = Date.now() + minutes * 60_000
  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  const startedAt = new Date()
  const runId = dryRun ? null : await openRun(db, { line: 'web-previews', startedAt, host: journalHost() })
  const counters: RunCounters = { scanned: 0, inserted: 0, duplicates: 0, rejected: {}, byProvider: {} }
  const previews = { og: 0, source: 0, page: 0, shot: 0 }
  const errors: string[] = []
  let upload: Upload | null = null
  if (!dryRun) {
    try {
      upload = gcsUploader(PREVIEW_KEY_FILE)
    } catch {
      // No bucket (the owner's choice, 27 September: nothing more to pay): no captures, no browser.
    }
  }
  const camera = upload || (dryRun && process.argv.includes('--captures')) ? new Camera() : null
  const institutions = new InstitutionShare()
  const queue: Candidate[] = []
  const held: string[] = []
  const pending: Array<{ candidate: Candidate; result: Visit }> = []
  let refilling: Promise<void> | null = null
  let hitDeadline = false
  /**
   * A visit that never ends — a page that holds the browser — kept the run past systemd's 26 minutes nine times in
   * three days (9–11 October): killed, its journal left "running", its last captures lost. A visit gets a minute at
   * most; and three minutes past its time the run closes its journal itself and leaves.
   */
  const hardStop = setTimeout(() => {
    hitDeadline = true
    void (async () => {
      await flush().catch(() => undefined)
      if (runId) await closeRun(db, runId, { finishedAt: new Date(), status: 'partial', counters, errors: [...errors, 'arrêt : le temps du passage est dépassé'] }).catch(() => undefined)
      await camera?.close().catch(() => undefined)
      process.exit(0)
    })()
  }, (minutes + 3) * 60_000)
  hardStop.unref()

  async function next(): Promise<Candidate | null> {
    if (!queue.length) {
      refilling ??= (async () => {
        const got = byHand.length ? byHand.splice(0) : dryRun && held.length ? [] : await takeCandidates(db, 20, held)
        for (const candidate of got) held.push(candidate._id)
        queue.push(...got)
      })().finally(() => { refilling = null })
      await refilling
    }
    return queue.shift() ?? null
  }

  /** The visits since the last write: the new sites in one upsert, their outcomes in one bulk write. */
  async function flush(): Promise<void> {
    const done = pending.splice(0)
    if (!done.length) return
    const withRow = done.filter((entry) => entry.result.row)
    if (dryRun) {
      for (const entry of withRow) previews[entry.result.row!.webPreview ?? 'og'] += 1
      return
    }
    const written = await upsertWebRows(db, withRow.map((entry) => entry.result.row!))
    const fresh = new Set(written.insertedIndexes)
    withRow.forEach((entry, index) => {
      if (!fresh.has(index)) { counters.duplicates += 1; return }
      counters.inserted += 1
      counters.byProvider![entry.candidate.source] = (counters.byProvider![entry.candidate.source] ?? 0) + 1
      previews[entry.result.row!.webPreview ?? 'og'] += 1
    })
    await settleCandidates(db, done.map((entry) => ({ candidate: entry.candidate, status: entry.result.status, outcome: entry.result.outcome })))
  }

  async function worker(): Promise<void> {
    while (counters.scanned < max) {
      if (Date.now() > deadline) { hitDeadline = true; return }
      const candidate = await next()
      if (!candidate) return
      counters.scanned += 1
      let result: Visit
      try {
        result = await withinSiteLimit(visit(db, candidate, camera, upload, dryRun, institutions))
      } catch (error) {
        result = { status: 'failed', outcome: error instanceof Error ? error.message.slice(0, 120) : 'error' }
      }
      if (!result.row) {
        if (result.status === 'done') counters.duplicates += 1
        else counters.rejected[result.status] = (counters.rejected[result.status] ?? 0) + 1
      }
      console.log(`${result.status.padEnd(7)} ${candidate.url.slice(0, 70)} · ${result.row ? `${result.outcome} · ${String(result.row.title).slice(0, 50)}` : result.outcome}`)
      pending.push({ candidate, result })
      if (pending.length >= 20) await flush()
    }
  }

  try {
    await Promise.all(Array.from({ length: parallel }, () => worker()))
    await flush()
    const waiting = await candidateCounts(db)
    const note = `${counters.scanned} sites visités : ${counters.inserted} ajoutés (${previews.og} avec leur image, ${previews.source ? `${previews.source} avec celle de leur source, ` : ''}${previews.page} avec une photo de leur page, ${previews.shot} photographiés), ` +
      `${Object.entries(counters.rejected).map(([reason, n]) => `${n} ${reason}`).join(', ') || 'aucun refus'} ; en attente ${waiting.new}`
    if (runId) {
      const status = hitDeadline ? 'partial' : counters.scanned ? 'ok' : 'skipped'
      await closeRun(db, runId, { finishedAt: new Date(), status, counters, errors, note })
    }
    console.log(JSON.stringify({ webPreviews: dryRun ? 'dry' : 'ok', ...counters, previews, waiting, errors, note, durationMs: Date.now() - startedAt.getTime() }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'web-previews failed'
    await flush().catch(() => undefined)
    if (runId) await closeRun(db, runId, { finishedAt: new Date(), status: 'failed', counters, errors: [...errors, message] }).catch(() => undefined)
    throw error
  } finally {
    await camera?.close()
  }
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
