import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProfile } from '../../lib/discovery/profile'
import { candidateFromRow } from '../../lib/discovery/catalog'
import { composeWave, relation, WaveSession } from '../../lib/discovery/waves'
import { createSubjectSearches } from '../../lib/discovery/subjectExploration'
import { focusMatchesVideo, taskId, youtubePageLoader, type DiscoveryTask } from '../../lib/discovery/exploration'
import type { Candidate, Format } from '../../lib/discovery/types'
import { appendExposure, diversityWeights, pickDiverse } from '../../lib/discovery/diversity'
import { seeded } from '../../lib/discovery/random'
import { parseSession } from '../../lib/discovery/sessionCodec'
import { newSession } from '../../lib/discovery/pool'

const now = Date.UTC(2026, 8, 13), scope = { ownerId: 'owner', referenceKey: 'source:johnny' }
const item = (key: string, title: string, type: Format = 'video', quiz = false): Candidate<string> => ({
  key, profile: buildProfile({ title }), type, quiz, provider: type === 'video' ? 'youtube' : 'fixture',
  payload: title, available: true, stock: false,
})

test('Random reduces repeated subjects across different treatments, without ever blocking an eligible subject', () => {
  const seen = item('seen', 'Johnny Hallyday collection memorabilia')
  const next = item('next', 'Johnny Hallyday portrait drawing'), other = item('other', 'Nora Legrand interview')
  const history = appendExposure([], seen), weights = diversityWeights([next, other], history)
  assert.ok(weights.get(next)! < weights.get(other)!)
  assert.ok(weights.get(next)! > 0)
  assert.equal(pickDiverse([next], weights, seeded(1)), next)
})
test('one named-subject item cannot reserve half the draws against a thousand different items', () => {
  const candidates = Array.from({ length: 1000 }, (_, i) => item(`johnny${i}`, `Johnny Hallyday collection ${i}`))
  const other = item('other', 'Nora Legrand collection'); candidates.push(other)
  const weights = diversityWeights(candidates, []), random = seeded(3)
  let selected = 0
  for (let i = 0; i < 300; i++) selected += Number(pickDiverse(candidates, weights, random)?.key === 'other')
  assert.ok(selected > 0 && selected < 15, `${selected}/300: bounded boost, not a 50% allocation`)
})
test('subject exposure survives session restoration, rejects invalid values and accepts pre-correction sessions', () => {
  const state = { ...newSession(1), exposures: appendExposure([], item('one', 'South Park GIF', 'image')) }
  assert.equal(parseSession(state)?.exposures?.[0].subject, state.exposures[0].subject)
  assert.equal(parseSession({ ...state, exposures: [{ ...state.exposures[0], subject: 'South Park' }] }), null)
  assert.ok(parseSession(newSession(1)))
})

test('South Park stays South Park across a video, quiz and image; park/animation/humour do not qualify', () => {
  const anchor = item('anchor', 'South Park reaction GIF', 'image')
  const valid = [item('scene', 'South Park classroom scene'), item('quiz', 'Who created South Park?', 'fact', true),
    item('art', 'South Park fan art', 'image')]
  const bad = [item('park', 'South London park walking tour'), item('animation', 'Funny animation reaction GIF', 'image')]
  const plan = composeWave(anchor, [...bad, ...valid])
  assert.ok(plan.ready)
  assert.deepEqual(new Set(plan.trio.map(x => x.key)), new Set(valid.map(x => x.key)))
  assert.ok(plan.trio.every(x => plan.relations[x.key].reasons.includes('subject:entity:south park')))
})
test('Johnny on a motorcycle opens Johnny representations, never a generic motorcycle/desert Wave', () => {
  const anchor = item('anchor', 'Johnny Hallyday en moto dans le désert')
  for (const title of ['Johnny Hallyday caricature', 'Collection de Johnny Hallyday', 'Johnny Hallyday reprise amateur']) {
    assert.ok(relation(anchor.profile, buildProfile({ title })), title)
  }
  for (const title of ['Motorcycle road trip desert', 'Ozzy Osbourne moto desert', 'Désert fun', 'Johnny Smith interview']) {
    assert.equal(relation(anchor.profile, buildProfile({ title })), null, title)
  }
})
test('unknown multi-word names use the same subject mechanism without adding a registry entry', () => {
  const anchor = buildProfile({ title: 'Nora Legrand live performance' })
  assert.equal(anchor.subject?.primary?.key, 'entity:nora legrand')
  assert.ok(relation(anchor, buildProfile({ title: 'Nora Legrand portrait drawing' })))
  assert.equal(relation(anchor, buildProfile({ title: 'Nora Martin live performance' })), null)
})
test('an incidental named phrase in a poetic subtitle does not hijack an advertising compilation', () => {
  const anchor = buildProfile({ title: '50 Minutes of Mid 80s TV Ads: Unearthed from the Depths of Betamax Oblivion' })
  assert.equal(anchor.subject?.primary?.key, 'topic:advertising-media')
  assert.ok(relation(anchor, buildProfile({ title: '1968 Ford Falcon Commercial' })))
})
test('desert fun retains both the setting and explicitly supported mood', () => {
  const anchor = buildProfile({ title: 'Désert fun : une course drôle' })
  assert.ok(relation(anchor, buildProfile({ title: 'Funny desert adventure' })))
  assert.equal(relation(anchor, buildProfile({ title: 'Desert geological documentary' })), null)
  assert.equal(relation(anchor, buildProfile({ title: 'Funny motorcycle in the city' })), null)
  assert.ok(relation(buildProfile({ title: 'Désert' }), buildProfile({ title: 'Desert geological documentary' })))
})
test('trusted source hints can resolve an arbitrary lower-case subject, but must occur in source evidence', () => {
  const primarySubject = { label: 'nora legrand', kind: 'entity' as const }
  const p = buildProfile({ title: 'nora legrand live', primarySubject })
  assert.equal(p.subject?.primary?.key, 'entity:nora legrand')
  assert.equal(buildProfile({ title: 'Motorcycle desert', primarySubject }).subject?.primary?.kind, 'topic')
})
test('tags and contextQueries do not manufacture subject evidence; a real description can qualify a camera filename', () => {
  const fake = buildProfile({ title: 'IMG_0001', tags: ['South Park'], description: 'Tags: South Park, Johnny Hallyday' })
  assert.equal(fake.subject?.primary, undefined)
  const source = buildProfile({ title: 'IMG_0001', description: 'Johnny Hallyday filmé par mon père pendant les vacances.' })
  assert.equal(source.subject?.primary?.key, 'entity:johnny hallyday')
  assert.equal(source.subject?.primary?.evidence, 'description')
})
test('legacy V3 profiles acquire subjects only in memory, without changing existing rows or requiring a migration', () => {
  const old = buildProfile({ title: 'South Park GIF' }); delete old.subject
  const row = { type: 'image', provider: 'giphy', discoveryVersion: 2, discoveryProfile: old,
    sourceMetadata: { title: 'South Park GIF' }, url: 'https://example.invalid/a.gif' }
  const before = structuredClone(row)
  assert.equal(candidateFromRow(row, 'payload', now).profile.subject?.primary?.key, 'entity:south park')
  assert.deepEqual(row, before)
})
test('three music clips are rejected, and many clips cannot crowd out other treatments before composition', () => {
  const anchor = item('anchor', 'Johnny Hallyday official music video')
  const clips = Array.from({ length: 40 }, (_, i) => item(`aaa${i}`, `Johnny Hallyday official music video ${i}`))
  assert.equal(composeWave(anchor, clips).ready, false)
  const other = [item('zzz-cover', 'Johnny Hallyday cover in my bedroom'),
    item('zzz-art', 'Johnny Hallyday portrait drawing'), item('zzz-collection', 'Johnny Hallyday collection memorabilia')]
  const plan = composeWave(anchor, [...clips, ...other])
  assert.ok(plan.ready)
  assert.ok(plan.trio.some(x => x.key.startsWith('zzz')))
  assert.ok(new Set(plan.trio.flatMap(x => x.profile.subject?.treatments ?? [])).size >= 3)
})
test('reserve recomposition preserves subject, three displays and the image ceiling', () => {
  const anchor = item('anchor', 'South Park reaction GIF', 'image')
  const neighbors = [item('a', 'South Park drawing', 'image'), item('b', 'South Park character', 'image'),
    item('c', 'South Park classroom scene'), item('d', 'South Park interview'), item('e', 'Motorcycle in desert')]
  const session = new WaveSession(anchor, neighbors), failed = session.next()!
  assert.ok(failed); session.failed(failed.key)
  const displayed: Candidate[] = []
  for (let i = 0; i < 3; i++) { const next = session.next()!; assert.ok(next); displayed.push(next); session.displayed(next.key) }
  assert.ok(displayed.every(x => x.key !== 'e' && x.key !== failed.key))
  assert.ok(displayed.filter(x => x.type === 'image').length <= 2)
  assert.equal(session.next(), null)
})
test('owner search planning covers the main subject deeply and separately rotates secondary topics', () => {
  const profile = buildProfile({ title: 'Johnny Hallyday moto road trip désert' })
  const specs = Array.from({ length: 10 }, (_, rotation) => createSubjectSearches(profile, scope, now, rotation)).flat()
  assert.equal(specs.length, 20)
  assert.equal(specs.filter(s => s.focus?.branch === 'primary').length, 14)
  assert.equal(specs.filter(s => s.focus?.branch === 'secondary').length, 6)
  assert.ok(new Set(specs.map(s => s.focus?.angle)).size >= 10)
  assert.ok(specs.some(s => s.focus?.subject.key === 'topic:motorcycle'))
  assert.ok(specs.some(s => s.focus?.subject.key === 'topic:desert'))
  assert.ok(specs.some(s => s.focus?.subject.key === 'topic:road-trip'))
  assert.ok(specs.filter(s => s.focus?.branch === 'primary').every(s => s.kind === 'search' && /johnny/.test(s.query)))
})
test('search tasks keep stable pagination IDs during a month, include recent uploads and sparse unqualified queries', () => {
  const profile = buildProfile({ title: 'Johnny Hallyday collection' })
  const all = Array.from({ length: 40 }, (_, i) => createSubjectSearches(profile, scope, now, i)).flat()
  const a = createSubjectSearches(profile, scope, now, 0)
  const b = createSubjectSearches(profile, scope, now + 86400000, 0)
  assert.deepEqual(a.map(taskId), b.map(taskId))
  assert.ok(all.some(s => s.kind === 'search' && new Date(s.before).getTime() > now))
  assert.ok(all.some(s => s.kind === 'search' && s.query === '"johnny hallyday"'))
  assert.equal(new Set(all.flatMap(s => s.kind === 'search' ? [s.language] : [])).size, 5)
})
test('scope qualification uses actual metadata, including obscure homemade uploads, and ignores search tags', () => {
  const focus = createSubjectSearches(buildProfile({ title: 'Johnny Hallyday' }), scope, now, 0)[0].focus!
  const raw = { provider: 'youtube' as const, videoId: 'abcdefghijk', url: 'https://youtu.be/abcdefghijk' }
  assert.ok(focusMatchesVideo({ ...raw, title: 'Johnny Hallyday collection', viewCount: 10 }, focus))
  assert.ok(focusMatchesVideo({ ...raw, title: 'IMG0001', description: 'Johnny Hallyday en vacances' }, focus))
  assert.equal(focusMatchesVideo({ ...raw, title: 'Minecraft gameplay', contextQueries: ['Johnny Hallyday'] }, focus), false)
  assert.ok(focusMatchesVideo({ ...raw, title: 'Minecraft gameplay' })) // Autonomous ingestion remains open.
})
test('creator and uploads exploration retain the subject fence and stable provider pagination', async () => {
  const spec = createSubjectSearches(buildProfile({ title: 'Johnny Hallyday' }), scope, now, 0)[0]
  const task: DiscoveryTask = { _id: 'test', spec, depth: 0, editorial: true, due: new Date(), leaseUntil: new Date(0), attempts: 0,
    pages: 1, dryPages: 0, priority: 1, cursor: 'page-2' }
  const calls: URL[] = []
  const load = youtubePageLoader('fixture-only', async input => {
    const url = new URL(String(input)); calls.push(url)
    if (url.pathname.endsWith('/channels')) return Response.json({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'UU-test' } } }] })
    return Response.json({ items: [{ id: { videoId: 'abcdefghijk' }, snippet: { title: 'Johnny Hallyday drawing', channelId: 'artist' } },
      { id: { videoId: '12345678901' }, snippet: { title: 'Generic gameplay', channelId: 'unrelated' } }], nextPageToken: 'page-3' })
  })
  const page = await load(task, new AbortController().signal, async () => true)
  assert.equal(calls[0].searchParams.get('pageToken'), 'page-2')
  assert.equal(page.nextCursor, 'page-3')
  assert.equal(page.children.length, 1)
  assert.deepEqual(page.children[0].focus, { ...spec.focus, angle: 'creator' })
  const channel = await load({ ...task, spec: page.children[0], depth: 1 }, new AbortController().signal, async () => true)
  assert.deepEqual(channel.children[0].focus, page.children[0].focus)
  assert.equal(channel.children[0].kind, 'playlist')
})
