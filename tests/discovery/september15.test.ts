import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProfile } from '../../lib/discovery/profile'
import { createSubjectSearches } from '../../lib/discovery/subjectExploration'
import { relation } from '../../lib/discovery/waves'
import { createSearchSeeds } from '../../lib/discovery/seeds'
import { geographicSearch, SEARCH_AREAS } from '../../lib/discovery/searchGeography'
import { planVideoQueries } from '../../lib/ingest/daily-auto/videoPortfolio'
import { runTrendingBatches } from '../../lib/ingest/trendingDirect'
import { requestWavePlan } from '../../lib/discovery/clientRequest'
import { seeded } from '../../lib/discovery/random'
const now = Date.UTC(2026, 8, 15)

test('predicate-led titles produce the same subject across representations, without name-specific aliases', () => {
  for (const name of ['Overwatch', 'Godzilla', 'Madonna', 'Nora Legrand', 'Zelda']) {
    const anchor = buildProfile({ title: `${name} Answers the Call | official trailer` })
    const related = buildProfile({ title: `${name} interview` })
    assert.equal(anchor.subject?.primary?.key, related.subject?.primary?.key)
    assert.ok(relation(anchor, related))
    assert.equal(relation(anchor, buildProfile({ title: 'Generic punk guitar performance' })), null)
    const tasks = createSubjectSearches(anchor, { ownerId: 'test', referenceKey: 'ref' }, now, 0)
    assert.ok(tasks.every(x => x.kind !== 'search' || !x.query.includes('answers')))
  }
  assert.equal(buildProfile({ title: 'Godzilla is back - official trailer' }).subject?.primary?.key, 'entity:godzilla')
  assert.equal(buildProfile({ title: 'Godzilla Back - Official Trailer' }).subject?.primary?.key, 'entity:godzilla')
  assert.equal(buildProfile({ title: 'Sydney Travelogue' }).subject?.primary?.key, 'entity:sydney')
  assert.equal(buildProfile({ title: 'Taking Back Sunday - interview' }).subject?.primary?.key, 'entity:taking back sunday')
  assert.equal(buildProfile({ title: 'The Empire Strikes Back - Official Trailer' }).subject?.primary?.key, 'entity:the empire strikes back')
  assert.equal(buildProfile({ title: 'Die toten Hosen - Bis zum bitteren Ende Live' }).subject?.primary?.key, 'entity:die toten hosen')
})

test('geographic rotation covers every configured area and alternates places/languages without fabricating metadata', () => {
  const queries = Array.from({ length: 120 }, (_, i) => geographicSearch(i))
  assert.deepEqual(new Set(queries.map(x => x.coverage.area)), new Set(SEARCH_AREAS))
  for (const area of SEARCH_AREAS) assert.ok(queries.filter(x => x.coverage.area === area).length >= 8)
  assert.ok(queries.some(x => x.language === 'ko'))
  assert.ok(queries.some(x => x.language === 'ar'))
  assert.ok(queries.some(x => x.language === 'sw'))
  assert.ok(queries.some(x => x.query === x.coverage.place), 'unguided searches remain possible')
  assert.equal(buildProfile({ title: 'Amateur sculpture', tags: ['Japan'] }).subject?.primary, undefined)
})

test('geography uses existing query slots: legacy half, modern/unusual lanes and search limits remain bounded', () => {
  const planned = planVideoQueries(Array.from({ length: 60 }, (_, i) => `existing-${i}`), { count: 60, seed: 'run-1' })
  assert.equal(planned.length, 60)
  assert.equal(planned.filter(x => x.lane === 'existing').length, 30)
  assert.equal(planned.filter(x => x.lane === 'contemporary').length, 15)
  assert.equal(planned.filter(x => x.lane === 'unusual').length, 15)
  const seeds = Array.from({ length: 4 }, (_, rotation) => createSearchSeeds(seeded(rotation), now, 20, undefined, rotation)).flat()
  assert.equal(seeds.length, 80); assert.equal(seeds.filter(x => x.coverage).length, 20)
  assert.equal(new Set(seeds.flatMap(x => x.coverage ? [x.coverage.area] : [])).size, SEARCH_AREAS.length)
})

test('a private reference tries all five search languages in five turns while retaining primary/secondary proportions', () => {
  const profile = buildProfile({ title: 'Johnny Hallyday motorcycle road trip désert' })
  const tasks = Array.from({ length: 5 }, (_, i) => createSubjectSearches(profile, { ownerId: 'test', referenceKey: 'ref' }, now, i)).flat()
  assert.equal(new Set(tasks.flatMap(x => x.kind === 'search' ? [x.language] : [])).size, 5)
  const ten = Array.from({ length: 10 }, (_, i) => createSubjectSearches(profile, { ownerId: 'test', referenceKey: 'ref' }, now, i)).flat()
  assert.equal(ten.filter(x => x.focus?.branch === 'primary').length, 14)
})

test('trends keep successful batches when one provider fails and never launch concurrent writes', async () => {
  let running = 0, maximum = 0
  const events: Record<string, unknown>[] = []
  const result = await runTrendingBatches(['JP', 'KR'], async ({ provider, region }) => {
    running++; maximum = Math.max(maximum, running)
    try {
      if (provider === 'youtube' && region === 'JP') throw new Error('upstream-url-with-secret')
      return { scanned: 50, inserted: 12, updated: 30, existingSkipped: 38 }
    } finally { running-- }
  }, event => events.push(event))
  assert.equal(maximum, 1); assert.equal(events.length, 4)
  assert.equal(result.inserted, 36); assert.equal(result.updated, 90)
  assert.equal(events.filter(x => x.status === 'failed').length, 1)
  assert.ok(!JSON.stringify(events).includes('secret'))
})

test('quota warnings cannot become a fully successful trends phase', async () => {
  const result = await runTrendingBatches(['FR'], async () => ({ inserted: 0, updated: 0, scanned: 0,
    warnings: [{ label: 'youtube:trending', message: 'quota unavailable' }] }))
  assert.ok(result.batches.every(x => x.status === 'warning'))
})

test('generic transient Wave 503 retries once, definitive empty never retries', async () => {
  let calls = 0
  const result = await requestWavePlan({}, new AbortController().signal, (async () => {
    calls++; return calls === 1 ? Response.json({ error: 'unavailable' }, { status: 503 }) : Response.json({ ready: true })
  }) as typeof fetch)
  assert.equal(calls, 2); assert.equal((await result.json()).ready, true)
  calls = 0
  await requestWavePlan({}, new AbortController().signal, (async () => {
    calls++; return Response.json({ ready: false, diagnostics: { cause: 'subject-unresolved' } })
  }) as typeof fetch)
  assert.equal(calls, 1)
})
