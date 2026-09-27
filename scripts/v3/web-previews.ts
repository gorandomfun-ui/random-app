/**
 * The server's `web-previews` line: visits the sites waiting in
 * web_candidates_v1 (lib/v3/web/candidates.ts), one at a time, and puts the
 * living ones into the catalogue with a preview — their own og:image when it
 * is good, otherwise a capture of the page taken by Chromium and stored in
 * the previews bucket (lib/v3/web/gcs.ts).
 *
 *   node --import tsx scripts/v3/web-previews.ts                 a pass: 20 minutes, 200 sites at most
 *   node --import tsx scripts/v3/web-previews.ts --minutes=5 --max=20
 *   node --import tsx scripts/v3/web-previews.ts --dry --max=10  visits and captures, writes nothing
 *   node --import tsx scripts/v3/web-previews.ts --url=https://… --url=https://…   those sites only, dry
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
import { candidateCounts, deferCandidate, previewObjectName, settleCandidate, siteKey, storedForms, takeCandidates, type Candidate, type CandidateStatus } from '@/lib/v3/web/candidates'
import { gcsUploader, PREVIEW_KEY_FILE, type Upload } from '@/lib/v3/web/gcs'
import { notASiteReason, readPage } from '@/lib/v3/web/pageSignals'
import { probePreview } from '@/lib/v3/web/previewImage'
import { boringWebReason, frontPageOf } from '@/lib/v3/web/quality'
import { upsertWebRows, type WebInsertRow } from '@/lib/v3/web/store'

const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
const CHROMIUM = process.env.RANDOM_CHROMIUM || '/usr/bin/chromium'
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

type Page = { finalUrl: string; html: string }

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
    return { finalUrl: response.url || url, html: Buffer.concat(chunks).toString('utf8') }
  } catch (error) {
    const cause = (error as { cause?: { code?: string } })?.cause?.code
    return { error: `unreachable: ${cause || (error instanceof Error ? error.name : 'error')}` }
  }
}

class Camera {
  private browser: Browser | null = null
  private shots = 0

  private async open(): Promise<Browser> {
    if (this.browser && this.shots < SHOTS_PER_BROWSER) return this.browser
    await this.close()
    const { chromium } = await import('playwright-core')
    this.browser = await chromium.launch({
      executablePath: CHROMIUM,
      headless: true,
      args: ['--disable-dev-shm-usage', '--disable-gpu', '--mute-audio', '--no-first-run', '--disable-extensions', '--disable-background-networking', '--disable-sync'],
    })
    this.shots = 0
    return this.browser
  }

  /** The page as a browser sees it: its address after redirects, its HTML, and a capture when it shows something. */
  async shoot(url: string): Promise<{ image: Buffer | null; finalUrl: string; html: string; blank?: string } | { error: string }> {
    const browser = await this.open()
    this.shots += 1
    const context = await browser.newContext({ viewport: VIEWPORT, userAgent: BROWSER_UA, locale: 'en-US', acceptDownloads: false, serviceWorkers: 'block' })
    try {
      const page = await context.newPage()
      await page.route('**/*', (route) => (['media', 'websocket'].includes(route.request().resourceType()) ? route.abort() : route.continue()))
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      if (response && response.status() >= 400) return { error: `http ${response.status()} in the browser too` }
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
      if (visible.text < 20 && visible.images === 0) return { image: null, finalUrl, html, blank: 'blank page' }
      // The e2-micro is slow: a capture can take twenty seconds when the page is heavy; animations are stopped for it.
      const image = await page.screenshot({ type: 'jpeg', quality: 72, timeout: 30_000, animations: 'disabled', caret: 'hide' })
      if (image.length < MIN_SHOT_BYTES) return { image: null, finalUrl, html, blank: `blank capture (${image.length} bytes)` }
      return { image, finalUrl, html }
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

type Visit = { status: CandidateStatus | 'deferred'; outcome: string; row?: WebInsertRow }

async function alreadyStored(db: Db, url: string): Promise<boolean> {
  return Boolean(await db.collection('items').findOne({ type: 'web', url: { $in: storedForms(url) } }, { projection: { _id: 1 } }))
}

const SAVE_DIR = process.env.RANDOM_PREVIEW_SAVE

async function visit(db: Db, candidate: Candidate, camera: Camera, upload: Upload | null, dryRun: boolean): Promise<Visit> {
  let page: Page | { error: string } = await fetchPage(candidate.url)
  let capture: { image: Buffer | null; blank?: string } | null = null
  // A small site behind a shield often refuses a plain request and shows itself to a browser.
  if ('error' in page && /^http (?:403|429|503)$/.test(page.error)) {
    const shot = await camera.shoot(candidate.url)
    if ('error' in shot) return { status: 'dead', outcome: `${page.error}; ${shot.error}` }
    page = { finalUrl: shot.finalUrl, html: shot.html }
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

  let ogImage: string | null = null
  let imageMeta = { width: VIEWPORT.width, height: VIEWPORT.height }
  let preview: 'og' | 'shot' = 'og'
  const own = reading.ogImage ? await probePreview(reading.ogImage) : null
  if (own) {
    ogImage = own.url
    imageMeta = { width: own.width, height: own.height }
  } else {
    // No bucket yet: the site waits for it rather than being given up.
    if (!dryRun && !upload) return { status: 'deferred', outcome: 'waits for the captures bucket' }
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

async function main(): Promise<void> {
  const byHand = handCandidates()
  const dryRun = process.argv.includes('--dry') || byHand.length > 0
  const minutes = numericFlag('minutes', 20)
  const max = numericFlag('max', 200)
  const deadline = Date.now() + minutes * 60_000
  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  const startedAt = new Date()
  const runId = dryRun ? null : await openRun(db, { line: 'web-previews', startedAt, host: journalHost() })
  const counters: RunCounters = { scanned: 0, inserted: 0, duplicates: 0, rejected: {}, byProvider: {} }
  const previews = { og: 0, shot: 0 }
  const errors: string[] = []
  const camera = new Camera()
  let upload: Upload | null = null
  try {
    if (!dryRun) {
      try {
        upload = gcsUploader(PREVIEW_KEY_FILE)
      } catch {
        // Without the bucket the sites with their own image still go in; the others wait for it (deferred).
        errors.push(`no key for the previews bucket at ${PREVIEW_KEY_FILE}: captures deferred`)
      }
    }
    let hitDeadline = false
    while (counters.scanned < max) {
      if (Date.now() > deadline) { hitDeadline = true; break }
      const batch = byHand.length ? byHand : await takeCandidates(db, Math.min(10, max - counters.scanned))
      if (!batch.length) break
      for (const candidate of batch) {
        if (Date.now() > deadline) { hitDeadline = true; break }
        counters.scanned += 1
        let result: Visit
        try {
          result = await visit(db, candidate, camera, upload, dryRun)
        } catch (error) {
          result = { status: 'failed', outcome: error instanceof Error ? error.message.slice(0, 120) : 'error' }
        }
        if (result.row && !dryRun) {
          const written = await upsertWebRows(db, [result.row])
          if (written.inserted) {
            counters.inserted += 1
            counters.byProvider![candidate.source] = (counters.byProvider![candidate.source] ?? 0) + 1
            previews[result.row.webPreview ?? 'og'] += 1
          } else counters.duplicates += 1
        } else if (result.row) {
          previews[result.row.webPreview ?? 'og'] += 1
        } else if (result.status === 'done') {
          counters.duplicates += 1
        } else if (result.status === 'deferred') {
          counters.rejected['waiting for the bucket'] = (counters.rejected['waiting for the bucket'] ?? 0) + 1
        } else {
          counters.rejected[result.status] = (counters.rejected[result.status] ?? 0) + 1
        }
        console.log(`${result.status.padEnd(7)} ${candidate.url.slice(0, 70)} · ${result.row ? `${result.outcome} · ${String(result.row.title).slice(0, 50)}` : result.outcome}`)
        if (!dryRun) {
          if (result.status === 'deferred') await deferCandidate(db, candidate, result.outcome)
          else await settleCandidate(db, candidate, result.status, result.outcome)
        }
      }
      if (dryRun) break
    }
    const waiting = await candidateCounts(db)
    const note = `${counters.scanned} sites visités : ${counters.inserted} ajoutés (${previews.og} avec leur image, ${previews.shot} photographiés), ` +
      `${Object.entries(counters.rejected).map(([reason, n]) => `${n} ${reason}`).join(', ') || 'aucun refus'} ; en attente ${waiting.new}`
    if (runId) {
      const status = hitDeadline || errors.length ? 'partial' : counters.scanned ? 'ok' : 'skipped'
      await closeRun(db, runId, { finishedAt: new Date(), status, counters, errors, note })
    }
    console.log(JSON.stringify({ webPreviews: dryRun ? 'dry' : 'ok', ...counters, previews, waiting, errors, note, durationMs: Date.now() - startedAt.getTime() }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'web-previews failed'
    if (runId) await closeRun(db, runId, { finishedAt: new Date(), status: 'failed', counters, errors: [...errors, message] }).catch(() => undefined)
    throw error
  } finally {
    await camera.close()
  }
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
