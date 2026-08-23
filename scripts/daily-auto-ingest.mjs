#!/usr/bin/env node

let host = process.env.HOST || process.env.RANDOM_INGEST_HOST || ''
const key = process.env.ADMIN_INGEST_KEY || process.env.KEY || ''
const dryRun = ['1', 'true', 'yes'].includes(String(process.env.DRY_RUN || '').toLowerCase())

const minVideoInserted = readInt('DAILY_AUTO_MIN_VIDEO_INSERTED', 600, 0, 5000)
const maxVideoChunks = readInt('DAILY_AUTO_MAX_VIDEO_CHUNKS', 24, 1, 120)
const maxRuntimeMs = readInt('DAILY_AUTO_MAX_RUNTIME_MINUTES', 110, 10, 330) * 60 * 1000
const continueChunkThreshold = readInt('DAILY_AUTO_CONTINUE_CHUNK_INSERTED', 20, 0, 500)

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

async function main() {
  const started = Date.now()
  let videoInserted = 0
  let webInserted = 0
  let chunks = 0
  let lastVideoChunkInserted = 0

  const fixedPhases = [
    { phase: 'trending', limit: 50 },
    { phase: 'retro', count: 8, per: 12, providers: 'youtube,dailymotion' },
  ]

  for (const phase of fixedPhases) {
    const payload = await callDailyAuto(phase)
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

    const youtubeOnly = chunks % 3 !== 2
    const payload = await callDailyAuto({
      phase: 'combo-videos',
      count: youtubeOnly ? 6 : 8,
      per: youtubeOnly ? 16 : 18,
      pages: 1,
      days: 365,
      durations: 'any',
      providers: youtubeOnly ? 'youtube' : 'youtube,dailymotion',
    })

    const inserted = videoInsertedFrom(payload)
    videoInserted += inserted
    lastVideoChunkInserted = inserted
    chunks += 1
  }

  const webPayload = await callDailyAuto({
    phase: 'web',
    count: 4,
    per: 8,
    pages: 2,
    providers: 'cse,curated',
    requireOg: '1',
  })
  webInserted += webInsertedFrom(webPayload)

  const durationMs = Date.now() - started
  console.log('Daily auto summary:', {
    dryRun,
    durationMs,
    chunks,
    videoInserted,
    webInserted,
    minVideoInserted,
    maxVideoChunks,
  })

  if (!dryRun && videoInserted < minVideoInserted) {
    console.warn(`Video target not reached: ${videoInserted}/${minVideoInserted}`)
  }
}

main().catch((error) => {
  console.error('Daily auto ingest failed:', error)
  process.exit(1)
})
