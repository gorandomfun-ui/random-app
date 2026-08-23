#!/usr/bin/env node

import fs from 'node:fs'

let host = process.env.HOST || process.env.RANDOM_INGEST_HOST || ''
const key = process.env.ADMIN_INGEST_KEY || process.env.KEY || ''
const dryRun = ['1', 'true', 'yes'].includes(String(process.env.DRY_RUN || '').toLowerCase())
const runProfile = resolveProfile(process.env.DAILY_AUTO_PROFILE || 'auto')

const minVideoInserted = readInt('DAILY_AUTO_MIN_VIDEO_INSERTED', 600, 0, 5000)
const maxVideoChunks = readInt('DAILY_AUTO_MAX_VIDEO_CHUNKS', 24, 1, 120)
const maxRuntimeMs = readInt('DAILY_AUTO_MAX_RUNTIME_MINUTES', 110, 10, 330) * 60 * 1000
const continueChunkThreshold = readInt('DAILY_AUTO_CONTINUE_CHUNK_INSERTED', 20, 0, 500)
const webCount = readInt('DAILY_AUTO_WEB_COUNT', 8, 1, 20)
const webPer = readInt('DAILY_AUTO_WEB_PER', 10, 1, 10)
const webPages = readInt('DAILY_AUTO_WEB_PAGES', 3, 1, 10)
const webProviders = process.env.DAILY_AUTO_WEB_PROVIDERS || 'cse,curated,neocities'
const enrichLimit = readInt('DAILY_AUTO_ENRICH_LIMIT', 120, 0, 500)

if (!host || !key) {
  console.error('HOST/RANDOM_INGEST_HOST et ADMIN_INGEST_KEY doivent être définis.')
  process.exit(1)
}

if (!/^https?:\/\//i.test(host)) {
  host = `https://${host}`
}

function readInt(name, fallback, min, max) {
  const parsed = Number(process.env[name])
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function localHour(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      hour12: false,
    }).formatToParts(new Date())
    const hour = Number(parts.find((part) => part.type === 'hour')?.value)
    return Number.isFinite(hour) ? hour : new Date().getUTCHours()
  } catch {
    return new Date().getUTCHours()
  }
}

function resolveProfile(value) {
  const normalized = String(value || 'auto').trim().toLowerCase()
  if (normalized === 'morning' || normalized === 'evening') return normalized
  const hour = localHour('Europe/Amsterdam')
  return hour >= 12 ? 'evening' : 'morning'
}

function getNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function asResult(payload) {
  return payload && typeof payload === 'object' && payload.result && typeof payload.result === 'object'
    ? payload.result
    : {}
}

function videoInsertedFrom(payload) {
  const result = asResult(payload)
  if (payload?.phase === 'web') return 0
  return getNumber(result.inserted)
}

function webInsertedFrom(payload) {
  const result = asResult(payload)
  if (payload?.phase !== 'web') return 0
  return getNumber(result.inserted)
}

function mergeCounts(target, source) {
  if (!source || typeof source !== 'object') return
  for (const [keyName, value] of Object.entries(source)) {
    target[keyName] = (target[keyName] || 0) + getNumber(value)
  }
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (!minutes) return `${seconds}s`
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

async function callDailyAuto(params) {
  const url = new URL('/api/ingest/daily-auto', host)
  for (const [keyName, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    url.searchParams.set(keyName, String(value))
  }
  if (dryRun) url.searchParams.set('dry', '1')

  console.log(`→ ${url.pathname}?${url.searchParams.toString()}`)
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { 'x-admin-ingest-key': key },
  })
  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = { error: text || 'non-json response' }
  }

  const result = asResult(body)
  console.log({
    phase: body.phase || params.phase,
    ok: body.ok,
    durationMs: body.durationMs,
    scanned: result.scanned,
    unique: result.unique,
    inserted: result.inserted,
    updated: result.updated,
    existingSkipped: result.existingSkipped,
    providerCounts: result.providerCounts,
  })

  if (!response.ok || body.ok === false) {
    throw new Error(body.error || `daily-auto failed with HTTP ${response.status}`)
  }

  return body
}

async function submitReport(summary) {
  try {
    const url = new URL('/api/ingest/daily-auto/report', host)
    const response = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        'x-admin-ingest-key': key,
      },
      body: JSON.stringify(summary),
    })
    if (!response.ok) {
      console.warn(`Daily auto report was not stored: HTTP ${response.status}`)
    }
  } catch (error) {
    console.warn('Daily auto report was not stored:', error)
  }
}

function writeGithubSummary(summary) {
  const target = process.env.GITHUB_STEP_SUMMARY
  if (!target) return

  const rows = summary.phases.map((phase) => {
    const result = phase.result || {}
    return `| ${phase.phase} | ${result.inserted ?? 0} | ${result.updated ?? 0} | ${result.existingSkipped ?? 0} | ${result.scanned ?? 0} | ${formatDuration(phase.durationMs || 0)} |`
  }).join('\n')

  const providerRows = Object.entries(summary.providerCounts || {})
    .sort((a, b) => b[1] - a[1])
    .map(([provider, count]) => `| ${provider} | ${count} |`)
    .join('\n')

  const markdown = [
    `# Daily Auto Ingest`,
    ``,
    `**Profile:** ${summary.profile}`,
    `**Dry run:** ${summary.dryRun ? 'yes' : 'no'}`,
    `**Duration:** ${formatDuration(summary.durationMs)}`,
    `**Target:** ${summary.videoInserted >= summary.minVideoInserted ? 'reached' : 'not reached'} (${summary.videoInserted}/${summary.minVideoInserted})`,
    ``,
    `## Totals`,
    ``,
    `| Metric | Count |`,
    `| --- | ---: |`,
    `| Videos inserted | ${summary.videoInserted} |`,
    `| Web inserted | ${summary.webInserted} |`,
    `| Video enriched | ${summary.videoEnriched} |`,
    `| Duplicates skipped | ${summary.existingSkipped} |`,
    `| Chunks | ${summary.chunks} |`,
    ``,
    `## Phases`,
    ``,
    `| Phase | Inserted | Updated | Existing skipped | Scanned | Duration |`,
    `| --- | ---: | ---: | ---: | ---: | ---: |`,
    rows || `| none | 0 | 0 | 0 | 0 | 0s |`,
    ``,
    `## Providers`,
    ``,
    `| Provider | Count |`,
    `| --- | ---: |`,
    providerRows || `| none | 0 |`,
    ``,
  ].join('\n')

  fs.appendFileSync(target, markdown)
}

async function main() {
  const started = Date.now()
  const startedAt = new Date(started).toISOString()
  let videoInserted = 0
  let webInserted = 0
  let videoEnriched = 0
  let chunks = 0
  let lastVideoChunkInserted = 0
  let existingSkipped = 0
  const providerCounts = {}
  const phases = []

  const remember = (payload) => {
    const result = asResult(payload)
    phases.push({
      phase: payload.phase,
      durationMs: payload.durationMs,
      queries: payload.queries,
      providers: payload.providers,
      regions: payload.regions,
      result,
    })
    existingSkipped += getNumber(result.existingSkipped)
    mergeCounts(providerCounts, result.providerCounts)
  }

  const fixedPhases = [
    { phase: 'trending', limit: 50, run: `${runProfile}:trending` },
    { phase: 'retro', count: 8, per: 12, providers: 'youtube,dailymotion', run: `${runProfile}:retro` },
  ]

  for (const phase of fixedPhases) {
    const payload = await callDailyAuto(phase)
    remember(payload)
    const inserted = videoInsertedFrom(payload)
    videoInserted += inserted
    lastVideoChunkInserted = inserted
    chunks += 1
  }

  while (chunks < maxVideoChunks && Date.now() - started < maxRuntimeMs) {
    const targetReached = videoInserted >= minVideoInserted
    if (targetReached && lastVideoChunkInserted < continueChunkThreshold) {
      break
    }

    const youtubeOnly = runProfile === 'morning'
      ? chunks % 3 !== 2
      : chunks % 2 === 0
    const payload = await callDailyAuto({
      phase: 'combo-videos',
      count: youtubeOnly ? 6 : 8,
      per: youtubeOnly ? 16 : 18,
      pages: 1,
      days: 365,
      durations: 'any',
      providers: youtubeOnly ? 'youtube' : 'youtube,dailymotion',
      run: `${runProfile}:combo:${chunks}`,
    })

    remember(payload)
    const inserted = videoInsertedFrom(payload)
    videoInserted += inserted
    lastVideoChunkInserted = inserted
    chunks += 1
  }

  const webPayload = await callDailyAuto({
    phase: 'web',
    count: webCount,
    per: webPer,
    pages: webPages,
    providers: webProviders,
    requireOg: '1',
    run: `${runProfile}:web`,
  })
  remember(webPayload)
  webInserted += webInsertedFrom(webPayload)

  if (enrichLimit > 0) {
    const enrichPayload = await callDailyAuto({
      phase: 'enrich-videos',
      limit: enrichLimit,
      days: 2,
      run: `${runProfile}:enrich`,
    })
    remember(enrichPayload)
    videoEnriched += getNumber(asResult(enrichPayload).updated)
  }

  const durationMs = Date.now() - started
  const summary = {
    dryRun,
    profile: runProfile,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs,
    chunks,
    videoInserted,
    webInserted,
    videoEnriched,
    existingSkipped,
    providerCounts,
    minVideoInserted,
    maxVideoChunks,
    phases,
  }

  console.log('Daily auto summary:', summary)
  await submitReport(summary)
  writeGithubSummary(summary)

  if (!dryRun && videoInserted < minVideoInserted) {
    console.warn(`Video target not reached: ${videoInserted}/${minVideoInserted}`)
  }
}

main().catch((error) => {
  console.error('Daily auto ingest failed:', error)
  process.exit(1)
})
