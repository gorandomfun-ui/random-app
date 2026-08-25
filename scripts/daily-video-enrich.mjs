#!/usr/bin/env node

import fs from 'node:fs'

let host = process.env.HOST || process.env.RANDOM_INGEST_HOST || ''
const key = process.env.ADMIN_INGEST_KEY || process.env.KEY || ''
const dryRun = ['1', 'true', 'yes'].includes(String(process.env.DRY_RUN || '').toLowerCase())
const rounds = readInt('DAILY_ENRICH_ROUNDS', 6, 1, 30)
const limit = readInt('DAILY_ENRICH_LIMIT', 25, 1, 120)
const days = readInt('DAILY_ENRICH_DAYS', 3, 1, 30)
const pauseMs = readInt('DAILY_ENRICH_PAUSE_MS', 1500, 0, 30000)

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

function getErrorMessage(error) {
  if (error instanceof Error) return error.message
  return String(error || 'unknown error')
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (!minutes) return `${seconds}s`
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

function wait(ms) {
  if (!ms) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function callEnrich(round) {
  const url = new URL('/api/ingest/daily-auto', host)
  url.searchParams.set('phase', 'enrich-videos')
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('days', String(days))
  url.searchParams.set('sample', '0')
  url.searchParams.set('run', `enrich:${round}`)
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
    phase: body.phase || 'enrich-videos',
    ok: body.ok,
    durationMs: body.durationMs,
    scanned: result.scanned,
    unique: result.unique,
    checked: result.checked,
    updated: result.updated,
    remaining: result.remaining,
    warnings: result.warnings,
  })

  if (!response.ok || body.ok === false) {
    throw new Error(body.error || `enrich failed with HTTP ${response.status}`)
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
      console.warn(`Daily enrich report was not stored: HTTP ${response.status}`)
    }
  } catch (error) {
    console.warn('Daily enrich report was not stored:', error)
  }
}

function writeGithubSummary(summary) {
  const target = process.env.GITHUB_STEP_SUMMARY
  if (!target) return

  const rows = summary.phases.map((phase) => {
    const result = phase.result || {}
    return `| ${phase.run || '-'} | ${result.scanned ?? 0} | ${result.checked ?? 0} | ${result.updated ?? 0} | ${result.remaining ?? 0} | ${formatDuration(phase.durationMs || 0)} | ${phase.error || 'ok'} |`
  }).join('\n')

  const markdown = [
    `# Daily Video Enrich`,
    ``,
    `**Status:** ${summary.status}`,
    `**Dry run:** ${summary.dryRun ? 'yes' : 'no'}`,
    `**Duration:** ${formatDuration(summary.durationMs)}`,
    `**Checked:** ${summary.videoChecked}`,
    `**Enriched:** ${summary.videoEnriched}`,
    `**Remaining recent:** ${summary.enrichRemaining}`,
    ``,
    `| Round | Scanned | Checked | Enriched | Remaining | Duration | Result |`,
    `| --- | ---: | ---: | ---: | ---: | ---: | --- |`,
    rows || `| none | 0 | 0 | 0 | 0 | 0s | ok |`,
    ``,
  ].join('\n')

  fs.appendFileSync(target, markdown)
}

async function main() {
  const started = Date.now()
  const startedAt = new Date(started).toISOString()
  const phases = []
  const errors = []
  let videoChecked = 0
  let videoEnriched = 0
  let enrichRemaining = 0

  for (let round = 1; round <= rounds; round += 1) {
    const phaseStarted = Date.now()
    try {
      const payload = await callEnrich(round)
      const result = asResult(payload)
      const checked = getNumber(result.checked)
      const updated = getNumber(result.updated)
      const remaining = getNumber(result.remaining)

      videoChecked += checked
      videoEnriched += updated
      enrichRemaining = remaining
      phases.push({
        phase: payload.phase || 'enrich-videos',
        run: `round:${round}`,
        durationMs: payload.durationMs || Date.now() - phaseStarted,
        providers: payload.providers || ['youtube'],
        result,
      })

      if (!checked || remaining <= 0) break
      await wait(pauseMs)
    } catch (error) {
      const message = getErrorMessage(error)
      errors.push({ phase: 'enrich-videos', run: `round:${round}`, error: message })
      phases.push({
        phase: 'enrich-videos',
        run: `round:${round}`,
        durationMs: Date.now() - phaseStarted,
        providers: ['youtube'],
        error: message,
        result: {},
      })
      await wait(pauseMs)
    }
  }

  const summary = {
    reportKind: 'enrich',
    dryRun,
    status: errors.length && !videoChecked ? 'failure' : errors.length ? 'partial' : 'success',
    profile: 'enrich',
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    chunks: phases.length,
    videoInserted: 0,
    webInserted: 0,
    videoChecked,
    videoEnriched,
    enrichRemaining,
    existingSkipped: 0,
    providerCounts: { youtube: videoChecked },
    errors,
    phases,
  }

  console.log('Daily video enrich summary:', summary)
  await submitReport(summary)
  writeGithubSummary(summary)

  if (summary.status === 'failure') {
    throw new Error(errors.map((entry) => entry.error).join('; ') || 'video enrich failed')
  }
}

main().catch((error) => {
  console.error('Daily video enrich failed:', error)
  process.exit(1)
})
