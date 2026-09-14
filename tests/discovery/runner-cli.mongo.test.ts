import test from 'node:test'
import assert from 'node:assert/strict'
import { MongoClient } from 'mongodb'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'

const uri = process.env.RANDOM_TEST_MONGO_URI
for (const mode of ['normal', 'youtube-rate-limit']) test(`MongoDB: real direct CLI (${mode}) writes through existing ingestion without a Vercel call`, { skip: !uri }, async () => {
  const client = new MongoClient(uri!, { serverSelectionTimeoutMS: 5000 })
  const db = client.db(`random_discovery_test_${randomUUID().replaceAll('-', '')}`)
  try {
    const result = await new Promise<{ code: number | null; out: string; err: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', '--import', './tests/discovery/runner.mock.mjs', 'scripts/discovery/explore.ts'], {
        env: { ...process.env, MONGO_URI: '', MONGO_DB: '', MONGODB_URI: uri!, MONGODB_DB: db.databaseName,
          RANDOM_TEST_RUNNER_MODE: mode, DRY_RUN: 'false', GITHUB_STEP_SUMMARY: '', RANDOM_DISCOVERY_WORKER_ENABLED: '1',
          RANDOM_DM_DISCOVERY_ENABLED: '1', RANDOM_DM_DISCOVERY_DAILY_LIMIT: '10', RANDOM_YOUTUBE_QUOTA_ENABLED: '1',
          YOUTUBE_API_KEY: 'FAKE_TEST_KEY', RANDOM_YT_SEARCH_DAILY_LIMIT: '100', RANDOM_YT_OTHER_DAILY_LIMIT: '10000',
          RANDOM_YT_SEARCH_BASE_RESERVE: '80', RANDOM_YT_OTHER_BASE_RESERVE: '9000', RANDOM_YT_EXTRA_SEARCH_LIMIT: '20',
          RANDOM_DISCOVERY_GITHUB_MINUTES: '1' },
        stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000,
      })
      let out = '', err = ''
      child.stdout.on('data', b => { out += b }); child.stderr.on('data', b => { err += b })
      child.on('error', reject); child.on('exit', code => resolve({ code, out, err }))
    })
    // A provider warning with real progress exits cleanly in 6797fa1; it is still reported.
    assert.equal(result.code, 0, result.out + result.err)
    const rows = await db.collection('items').find({ type: 'video' }).toArray()
    assert.equal(rows.filter(r => r.provider === 'dailymotion').length, 1)
    assert.equal(rows.filter(r => r.provider === 'youtube').length, mode === 'normal' ? 1 : 0)
    assert.ok(rows.every(r => r.discoveryProfile.subject?.primary?.key))
    assert.equal(await db.collection<{ _id: string }>('discovery_scheduler_v2').countDocuments({ _id: 'github-discovery-run' }), 0)
    const messages = result.out.split('\n').filter(x => x.startsWith('{')).map(x => JSON.parse(x))
    assert.equal(messages.filter(x => x.provider).length, 2)
    assert.equal(messages.filter(x => x.provider).reduce((n, x) => n + x.inserted, 0), rows.length)
    if (mode === 'youtube-rate-limit') {
      assert.equal(messages.find(x => x.provider === 'youtube').errors.rateLimit, 3)
      assert.equal(messages.find(x => x.status)?.status, 'completed-with-warnings')
    }
    assert.ok(!result.out.includes('FAKE_TEST_KEY') && !result.err.includes('FAKE_TEST_KEY'))
  } finally { await db.dropDatabase(); await client.close() }
})
