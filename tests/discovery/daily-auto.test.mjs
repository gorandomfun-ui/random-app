import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { integerSetting, videoRunPolicy, runStopReason } from '../../scripts/lib/daily-auto-policy.mjs'

test('the existing 1200 target becomes 2400; old 150-minute configuration is bounded at 30 minutes', () => {
  const policy = videoRunPolicy({ DAILY_AUTO_MIN_VIDEO_INSERTED: '1200', DAILY_AUTO_MAX_RUNTIME_MINUTES: '150' })
  assert.equal(policy.target, 2400); assert.equal(policy.maxChunks, 80); assert.equal(policy.maxRuntimeMs, 1800000)
  assert.equal(videoRunPolicy({ DAILY_AUTO_VIDEO_MULTIPLIER: '1' }).target, 1200)
  assert.equal(integerSetting('', 1200, 0, 5000), 1200)
  assert.equal(videoRunPolicy({ DAILY_AUTO_MIN_VIDEO_INSERTED: '1500' }).target, 3000)
})
test('budgets terminate even with endless duplicates; a positive last batch cannot prolong a completed target', () => {
  const state = { inserted: 2400, target: 2400, chunks: 14, maxChunks: 80, elapsed: 1000, maxRuntimeMs: 1800000, emptyStreak: 0 }
  assert.equal(runStopReason(state), 'target-reached')
  assert.equal(runStopReason({ ...state, inserted: 0, elapsed: 1800000 }), 'time-budget')
  assert.equal(runStopReason({ ...state, inserted: 0, chunks: 80 }), 'chunk-budget')
  assert.equal(runStopReason({ ...state, inserted: 0, emptyStreak: 8 }), 'sources-exhausted')
})
async function run(scenario, multiplier = '2') {
  const folder = await mkdtemp(join(tmpdir(), 'random-ingest-test-')), reportPath = join(folder, 'report.json')
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', './tests/discovery/daily-auto.mock.mjs', 'scripts/daily-auto-ingest.mjs'], {
        cwd: process.cwd(), env: { ...process.env, HOST: 'https://test.invalid', ADMIN_INGEST_KEY: 'fake-test-key',
          DAILY_AUTO_PROFILE: 'morning', DAILY_AUTO_SKIP_COMPLETED: 'false', DAILY_AUTO_MIN_VIDEO_INSERTED: '1200', DAILY_AUTO_VIDEO_MULTIPLIER: multiplier,
          DAILY_AUTO_MAX_VIDEO_CHUNKS: '40', DAILY_AUTO_DISCOVERY_ENABLED: '0', DAILY_AUTO_ENRICH_LIMIT: '0', DRY_RUN: 'false',
          RANDOM_TEST_SCENARIO: scenario, RANDOM_TEST_REPORT: reportPath }, stdio: ['ignore', 'ignore', 'pipe'], timeout: 10000,
      })
      let error = ''; child.stderr.on('data', chunk => { error += chunk })
      child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(error || `Exit ${code}`)))
    })
    return JSON.parse(await readFile(reportPath, 'utf8'))
  } finally { await rm(folder, { recursive: true, force: true }) }
}
test('real daily script reaches 2400 inserts, preserves trends/retro/web and enriches nothing', async () => {
  const { calls, report } = await run('normal')
  assert.equal(report.videoInserted, 2400); assert.equal(report.videoEnriched, 0); assert.equal(report.webInserted, 12)
  assert.equal(report.stopReason, 'target-reached')
  assert.deepEqual(calls.slice(0, 2).map(x => x.phase), ['trending', 'retro'])
  assert.ok(calls.filter(x => x.phase === 'combo-videos').every(x => x.per === '50'))
  assert.equal(calls.filter(x => x.phase === 'web').length, 1)
})
test('duplicate candidates never count toward the target and empty sources terminate', async () => {
  const { report } = await run('empty')
  assert.equal(report.videoInserted, 0); assert.ok(report.existingSkipped > 0)
  assert.equal(report.stopReason, 'sources-exhausted'); assert.ok(report.chunks <= 8)
})
test('empty YouTube batches give way to productive Dailymotion within the same run', async () => {
  const { calls, report } = await run('youtube-empty')
  assert.equal(report.videoInserted, 2400)
  assert.equal(calls.filter(x => x.providers === 'youtube').length, 3)
  assert.ok(calls.some(x => x.providers === 'dailymotion'))
})
test('multiplier one returns to the original target without changing the schedule', async () => {
  const { report } = await run('normal', '1')
  assert.equal(report.videoInserted, 1200); assert.equal(report.minVideoInserted, 1200)
})
