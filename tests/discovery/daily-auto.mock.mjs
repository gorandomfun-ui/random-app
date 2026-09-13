// Imported only by the child-process integration test; never imported by production.
import fs from 'node:fs'
const calls = [], scenario = process.env.RANDOM_TEST_SCENARIO
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input))
  if (url.hostname !== 'test.invalid') throw new Error('Test forbids real network requests')
  if (!init.signal) throw new Error('HTTP call has no deadline')
  if (url.pathname.endsWith('/report')) {
    fs.writeFileSync(process.env.RANDOM_TEST_REPORT, JSON.stringify({ calls, report: JSON.parse(init.body) }))
    return Response.json({ ok: true })
  }
  if (url.pathname.endsWith('/status')) {
    if (scenario === 'already-complete') {
      const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date())
      return Response.json({ runs: [{ status: 'success', startedAt: `${date}T09:00:00.000Z`,
        details: { profile: 'morning', videoInserted: 2400, dryRun: false } }] })
    }
    return Response.json({ runs: [] })
  }
  const params = Object.fromEntries(url.searchParams); calls.push(params)
  const phase = params.phase, web = phase === 'web', youtubeOnly = params.providers === 'youtube'
  let inserted = web ? 12 : phase === 'combo-videos' ? 200 : 100
  if (scenario === 'empty' && !web || scenario === 'youtube-empty' && youtubeOnly) inserted = 0
  return Response.json({ ok: true, phase, durationMs: 1, result: {
    inserted, scanned: 500, unique: 400, existingSkipped: 400 - inserted,
    providerCounts: { youtube: scenario === 'youtube-empty' || scenario === 'empty' ? 0 : 200, dailymotion: youtubeOnly ? 0 : 300 },
  } })
}
