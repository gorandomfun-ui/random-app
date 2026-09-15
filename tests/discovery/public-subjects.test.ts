import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProfile } from '../../lib/discovery/profile'
import { createSubjectSearches } from '../../lib/discovery/subjectExploration'
import { gapSearches } from '../../lib/discovery/publicSubjectExploration'
import { geographicSearch, SEARCH_AREAS } from '../../lib/discovery/searchGeography'
import { taskId, focusMatchesVideo } from '../../lib/discovery/exploration'
const now = Date.UTC(2026, 8, 15)

test('an unfamiliar artist keeps one identity across fan, dated amateur and official recordings', () => {
  for (const suffix of ['fan interview', '1973 amateur interview in a village', 'audience recording concert', 'official video']) {
    assert.equal(buildProfile({ title: `Nora Legrand ${suffix}` }).subject?.primary?.key, 'entity:nora legrand')
  }
  assert.equal(buildProfile({ title: 'Fan Bingbing interview' }).subject?.primary?.key, 'entity:fan bingbing')
  assert.equal(buildProfile({ title: 'The 1975 interview' }).subject?.primary?.key, 'entity:the 1975')
})

test('public subjects retain broad mainstream search on EVERY turn and traverse eras, treatments and local/world destinations', () => {
  for (const name of ['Johnny Hallyday', 'Nora Legrand']) {
    const profile = buildProfile({ title: `${name} motorcycle road trip désert` })
    const all = Array.from({ length: 240 }, (_, turn) => gapSearches(profile, now, turn))
    for (const [broad, deeper] of all) {
      assert.equal(broad.kind, 'search'); assert.equal(deeper.kind, 'search')
      if (broad.kind !== 'search' || deeper.kind !== 'search') continue
      assert.ok(profile.subject!.primary!.aliases.some(alias => broad.query === `"${alias}"`))
      assert.equal(broad.subjectScope?.subject.key, profile.subject!.primary!.key)
      assert.equal(deeper.subjectScope?.subject.key, profile.subject!.primary!.key, 'a public gap cannot drift to the incidental motorcycle/desert')
      assert.ok(!broad.focus && !deeper.focus)
    }
    const specs = all.flat()
    const queries = specs.flatMap(s => s.kind === 'search' ? [s.query] : [])
    assert.ok(queries.some(q => q.includes('United States')))
    assert.ok(queries.some(q => q.includes('Cameroun')))
    assert.ok(queries.some(q => q.includes('Jura')))
    assert.ok(specs.some(s => s.subjectScope?.angle.startsWith('era-')))
    assert.ok(specs.some(s => s.subjectScope?.angle === 'fan'))
    assert.deepEqual(new Set(specs.flatMap(s => s.coverage ? [s.coverage.area] : [])), new Set(SEARCH_AREAS))
    assert.deepEqual(new Set(all.map(([s]) => s.kind === 'search' ? s.order : '')), new Set(['viewCount', 'relevance', 'date']))
  }
})

test('1973 performance remains discoverable when uploaded in 2026; query years never become source metadata', () => {
  const profile = buildProfile({ title: '1973 - Nora Legrand concert amateur' })
  const before = JSON.stringify(profile)
  const spec = gapSearches(profile, now, 2)[1]
  assert.equal(spec.kind, 'search')
  if (spec.kind !== 'search') return
  assert.ok(spec.query.includes('1973'), spec.query)
  assert.equal(new Date(spec.after).getUTCFullYear(), 2005, 'do not filter upload dates down to 1973')
  assert.ok(new Date(spec.before).getTime() > now)
  assert.equal(JSON.stringify(profile), before)
  assert.ok(focusMatchesVideo({ provider: 'youtube', videoId: 'abcdefghijk', url: 'https://example.invalid/old',
    title: 'Nora Legrand 1973 audience recording', publishedAt: new Date(now) }, spec.subjectScope))
  const unverified = buildProfile({ title: 'Nora Legrand interview' })
  gapSearches(unverified, now, 2)
  assert.ok(!unverified.tokens.includes('1960'), 'the era query cannot fabricate a year in the profile')
})

test('additional geography uses the existing slots; curation retains 70/30 while public gaps stay on the main subject', () => {
  const profile = buildProfile({ title: 'Johnny Hallyday moto désert' })
  const owner = Array.from({ length: 10 }, (_, i) => createSubjectSearches(profile, { ownerId: 'owner', referenceKey: 'ref' }, now, i)).flat()
  const publicPlans = Array.from({ length: 10 }, (_, i) => gapSearches(profile, now, i)).flat()
  assert.equal(owner.length, 20); assert.equal(publicPlans.length, 20)
  assert.equal(owner.filter(s => s.focus?.branch === 'primary').length, 14)
  assert.ok(publicPlans.every(s => s.subjectScope?.branch === 'primary'))
  for (let i = 0; i < 80; i++) {
    assert.deepEqual(gapSearches(profile, now, i).map(taskId), gapSearches(profile, now + 86400000, i).map(taskId))
  }
  const places = Array.from({ length: 120 }, (_, i) => geographicSearch(i))
  assert.equal(places.length, 120)
  assert.ok(new Set(places.map(p => p.coverage.place)).size > 40)
})
