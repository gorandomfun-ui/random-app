import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runDiscoveryLoop, type BatchReport } from '../../lib/discovery/runner'
import type { DiscoveryBatchOptions } from '../../lib/discovery/worker'
import { withAbortDeadline } from '../../lib/discovery/exploration'

const report = (extra: Partial<BatchReport> = {}): BatchReport => ({ pages: 1, inserted: 3, failures: 0, quotaDenied: 0,
  errors: { timeout: 0, rateLimit: 0, http: 0, other: 0 }, stopReason: 'time-budget', ...extra })

test('direct runner rotates providers, seeds each once and stays within eight bounded batches', async () => {
  let clock = 0
  const calls: DiscoveryBatchOptions[] = []
  const result = await runDiscoveryLoop({ providers: ['youtube', 'dailymotion'], maxMs: 300000, now: () => clock,
    runBatch: async options => { calls.push(options); clock += 1000; return report() },
  })
  assert.equal(calls.length, 8)
  assert.deepEqual(calls.map(x => x.provider), ['youtube', 'dailymotion', 'youtube', 'dailymotion', 'youtube', 'dailymotion', 'youtube', 'dailymotion'])
  assert.deepEqual(calls.map(x => x.seed), [true, true, false, false, false, false, false, false])
  assert.ok(calls.every(x => x.maxMs! <= 90000))
  assert.equal(result.inserted, 24)
  assert.equal(result.stopReason, 'batch-budget')
})

test('YouTube exhausted or failing cannot consume the Dailymotion turn', async () => {
  for (const reason of ['quota', 'provider-errors'] as const) {
    let clock = 0
    const calls: string[] = []
    const result = await runDiscoveryLoop({ providers: ['youtube', 'dailymotion'], maxMs: 60000, now: () => clock,
      runBatch: async options => {
        calls.push(options.provider!); clock += options.maxMs! - 15000
        return options.provider === 'youtube' ? report({ pages: 0, inserted: 0, stopReason: reason }) : report({ stopReason: 'idle' })
      },
    })
    assert.deepEqual(calls, ['youtube', 'dailymotion'])
    assert.equal(result.inserted, 3)
  }
})

test('an empty queue stops immediately; an already cancelled run starts no batch', async () => {
  const result = await runDiscoveryLoop({ providers: ['youtube', 'dailymotion'], maxMs: 300000,
    runBatch: async () => report({ pages: 0, inserted: 0, stopReason: 'idle' }),
  })
  assert.equal(result.reports.length, 2)
  const cancelled = new AbortController(); cancelled.abort()
  const stopped = await runDiscoveryLoop({ providers: ['youtube'], maxMs: 300000, signal: cancelled.signal,
    runBatch: async () => { throw new Error('Must never execute') },
  })
  assert.equal(stopped.reports.length, 0)
  assert.equal(stopped.stopReason, 'cancelled')
})

test('database or insertion failure is surfaced rather than labelled a provider failure', async () => {
  await assert.rejects(runDiscoveryLoop({ providers: ['youtube', 'dailymotion'], maxMs: 300000,
    runBatch: async () => { throw new Error('database unavailable') },
  }), /database unavailable/)
})

test('provider deadline settles even when the underlying request ignores abort', async () => {
  const started = Date.now()
  await assert.rejects(withAbortDeadline(20, undefined, async () => new Promise(() => undefined)),
    (error: unknown) => error instanceof DOMException && error.name === 'TimeoutError')
  assert.ok(Date.now() - started < 500)
})

test('a whole provider batch is bounded and reports its last stage', async () => {
  const stages: string[] = []
  const started = Date.now()
  const result = await runDiscoveryLoop({ providers: ['dailymotion'], maxMs: 60000, batchDeadlineMs: 20,
    onStage: event => stages.push(`${event.provider}:${event.stage}`),
    runBatch: async options => {
      options.onStage?.('seeding')
      return new Promise(() => undefined)
    },
  })
  assert.ok(Date.now() - started < 500)
  assert.deepEqual(stages, ['dailymotion:seeding'])
  assert.equal(result.reports[0]?.stopReason, 'provider-errors')
  assert.equal(result.reports[0]?.errors.timeout, 1)
})

function check(env: Record<string, string | undefined>, args: string[] = []) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'scripts/discovery/explore.ts', ...args], {
    env: { ...process.env, MONGO_URI: '', MONGO_DB: '', MONGODB_URI: '', MONGODB_DB: '', DRY_RUN: '',
      RANDOM_DISCOVERY_WORKER_ENABLED: '', RANDOM_YOUTUBE_QUOTA_ENABLED: '', RANDOM_DM_DISCOVERY_ENABLED: '',
      RANDOM_DISCOVERY_GITHUB_MINUTES: '', ...env }, encoding: 'utf8', timeout: 10000,
  })
}

test('CLI dry run requires no credentials and makes no connection', () => {
  const result = check({ DRY_RUN: 'true' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /skipped: dry run/)
})

test('CLI configuration check supports Dailymotion alone without connecting or exposing credentials', () => {
  const result = check({ MONGODB_URI: 'mongodb://TEST_SECRET@unreachable.invalid:27017', MONGODB_DB: 'test',
    RANDOM_DISCOVERY_WORKER_ENABLED: '1', RANDOM_DM_DISCOVERY_ENABLED: '1', RANDOM_YOUTUBE_QUOTA_ENABLED: '0' }, ['--check'])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), { configured: true, providers: ['dailymotion'], maxMs: 300000 })
  assert.ok(!result.stdout.includes('TEST_SECRET') && !result.stderr.includes('TEST_SECRET'))
})

test('CLI rejects a missing database name and runtime above ten minutes before any connection', () => {
  const env = { MONGODB_URI: 'mongodb://unreachable.invalid', RANDOM_DISCOVERY_WORKER_ENABLED: '1', RANDOM_DM_DISCOVERY_ENABLED: '1' }
  assert.equal(check(env, ['--check']).status, 1)
  assert.equal(check({ ...env, MONGODB_DB: 'test', RANDOM_DISCOVERY_GITHUB_MINUTES: '11' }, ['--check']).status, 1)
})

test('daily workflow output distinguishes a real run, catch-up skip and dry run', () => {
  for (const scenario of ['normal', 'already-complete', 'dry']) {
    const folder = mkdtempSync(join(tmpdir(), 'random-runner-output-'))
    try {
      const output = join(folder, 'outputs'), reportPath = join(folder, 'report.json')
      const result = spawnSync(process.execPath, ['--import', './tests/discovery/daily-auto.mock.mjs', 'scripts/daily-auto-ingest.mjs'], {
        env: { ...process.env, HOST: 'https://test.invalid', ADMIN_INGEST_KEY: 'FAKE_TEST_KEY', DAILY_AUTO_PROFILE: 'morning',
          DAILY_AUTO_SKIP_COMPLETED: 'true', DAILY_AUTO_MIN_VIDEO_INSERTED: '1200', DAILY_AUTO_VIDEO_MULTIPLIER: '2',
          DAILY_AUTO_DISCOVERY_ENABLED: '0', DAILY_AUTO_ENRICH_LIMIT: '0', DRY_RUN: scenario === 'dry' ? 'true' : 'false',
          RANDOM_TEST_SCENARIO: scenario, RANDOM_TEST_REPORT: reportPath, GITHUB_STEP_SUMMARY: '', GITHUB_OUTPUT: output },
        encoding: 'utf8', timeout: 10000,
      })
      assert.equal(result.status, 0, result.stderr)
      const values = readFileSync(output, 'utf8').trim().split('\n')
      assert.equal(values.at(-1), scenario === 'normal' ? 'ingest_ran=1' : 'ingest_ran=0')
      if (scenario !== 'already-complete') {
        const { calls } = JSON.parse(readFileSync(reportPath, 'utf8'))
        assert.ok(calls.every((call: { phase: string }) => call.phase !== 'discovery'))
        assert.deepEqual(calls.slice(0, 2).map((call: { phase: string }) => call.phase), ['trending', 'retro'])
      }
    } finally { rmSync(folder, { recursive: true, force: true }) }
  }
})
