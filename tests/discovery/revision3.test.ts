import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProfile } from '../../lib/discovery/profile'
import { foldSubject } from '../../lib/discovery/subjects'
import { relation, composeWave, WaveSession } from '../../lib/discovery/waves'
import { relatedSignals } from '../../lib/discovery/retrieval'
import { assignEditorial } from '../../lib/discovery/editorial'
import { createSubjectSearches } from '../../lib/discovery/subjectExploration'
import { focusMatchesVideo } from '../../lib/discovery/exploration'
import type { Candidate, Format } from '../../lib/discovery/types'

// These are reconstructed regression cases, NOT the unprovided 20 private source records.
const item = (key: string, title: string, type: Format = 'video'): Candidate<string> => ({
  key, type, provider: 'fixture', available: true, stock: false, payload: title, profile: buildProfile({ title }),
})
const pairs = [
  ['A$AP Rocky punk interview', 'Punk guitar workshop', 'ASAP Rocky interview'],
  ['Marvel / Hasbro stop motion', 'Stop motion tutorial', 'Marvel fan art'],
  ['Telstra TV Commercial', 'Ford Falcon TV Commercial', 'TELSTRA TV COMMERCIAL'],
  ['Frosted Mini-Wheats TV Commercial', 'General Foods TV Commercial', 'Frosted Mini-Wheats collection'],
] as const
for (const [title, unrelated, related] of pairs) test(`specific subject survives practice and format: ${title}`, () => {
  const anchor = buildProfile({ title }), bad = buildProfile({ title: unrelated }), good = buildProfile({ title: related })
  assert.ok(anchor.subject?.primary)
  assert.equal(relation(anchor, bad), null)
  assert.ok(relation(anchor, good))
  const refs = [{ ownerId: 'owner', contentKey: 'anchor', familyId: 'direction', active: true, profile: anchor, type: 'video' as const, version: 2 }]
  assert.deepEqual(assignEditorial([item('bad', unrelated)], refs, 'owner').candidates[0].editorialFamilies, [])
  assert.ok(relatedSignals(anchor).every(s => !('discoveryProfile.practices' in s.query)))
})

test('stage names, lower-case contexts, punctuation and unfamiliar names do not need new dictionary entries', () => {
  for (const [a, b] of [
    ['A$AP ROCKY - PRAISE THE LORD (OFFICIAL VIDEO)', 'asap rocky interview'],
    ['AC/DC - Thunderstruck (Official Video)', 'AC/DC collection'],
    ['zora valentic - souvenir', 'Zora Valentic interview'],
    ['TELSTRA TV COMMERCIAL', 'telstra tv commercial'],
  ]) {
    const source = buildProfile({ title: a, category: '10' })
    assert.ok(source.subject?.primary, a)
    assert.ok(relation(source, buildProfile({ title: b })), `${a} -> ${b}`)
  }
  assert.notEqual(foldSubject('ハ'), foldSubject('パ'), 'Japanese voicing marks are not accents to strip')
})

test('missing subject cannot create a Wave from a title overlap, verified IDs or a generic practice fallback', () => {
  const anchor = item('anchor', 'ordinary lowercase description'), neighbors = [1, 2, 3].map(i => item(`n${i}`, 'ordinary lowercase description', i === 3 ? 'image' : 'video'))
  assert.equal(anchor.profile.subject?.primary, undefined)
  assert.equal(composeWave(anchor, neighbors).ready, false)
  assert.deepEqual(relatedSignals(anchor.profile), [])
  const stripped = buildProfile({ title: 'Minecraft gameplay' }); delete stripped.subject
  assert.equal(relation(stripped, buildProfile({ title: 'Minecraft fan art' })), null)
  assert.equal(relation(stripped, buildProfile({ title: 'Japanese reaction GIF' })), null)
})

test('a sparse title can use its clean source description; query tags and copied paragraphs cannot', () => {
  const recovered = buildProfile({ title: 'ANIMATION vidéo', description: 'Minecraft gameplay filmed in my room.' })
  assert.equal(recovered.subject?.primary?.key, 'entity:minecraft')
  assert.equal(recovered.subject?.primary?.evidence, 'description')
  assert.equal(buildProfile({ title: 'ANIMATION vidéo', description: 'Tags: Minecraft, South Park' }).subject?.primary, undefined)
  const copied = buildProfile({ title: 'ANIMATION vidéo', description: 'Minecraft gameplay from one channel.\nA completely unrelated product commercial.\nAnother unrelated announcement from the channel.' })
  assert.equal(copied.metadataQuality, 'unverified')
  assert.equal(relation(copied, recovered), null)
})

test('three song-title videos cannot pass by omitting the music-video tag; a related image opens a mixed trio', () => {
  const anchor = item('anchor', 'Johnny Hallyday official music video')
  const clips = ['Que je t’aime', 'Allumer le feu', 'Le Pénitencier'].map((song, i) => item(`clip${i}`, `Johnny Hallyday — ${song}`))
  assert.ok(clips.every(c => c.profile.subject?.treatments.length === 0))
  assert.equal(composeWave(anchor, clips).ready, false)
  const ready = composeWave(anchor, [...clips, item('art', 'Johnny Hallyday fan art', 'image')])
  assert.ok(ready.ready)
  assert.ok(ready.trio.some(c => c.type === 'image'))
})

test('known artist videos need positive treatment variety; unknown is never counted as a distinct treatment', () => {
  const anchor = item('anchor', 'Nora Legrand official music video')
  const clip = item('clip', 'Nora Legrand official music video'), unknown = item('unknown', 'Nora Legrand — Un soir')
  assert.equal(composeWave(anchor, [clip, unknown, item('u2', 'Nora Legrand — Minuit')]).ready, false)
  const ready = composeWave(anchor, [clip, item('cover', 'Nora Legrand cover'), item('portrait', 'Nora Legrand portrait drawing')])
  assert.ok(ready.ready)
  const session = new WaveSession(anchor, [clip, unknown, item('interview', 'Nora Legrand interview'), item('art', 'Nora Legrand fan art', 'image')])
  const first = session.next(); assert.ok(first); session.displayed(first.key)
  if (['interview', 'art'].includes(first.key)) session.revokeLast(first.key)
  session.failed('interview'); session.failed('art')
  assert.equal(session.next(), null, 'reserve failure cannot silently turn the remaining trio into unknown clips')
})

test('one hundred clips do not hide a valid video/quiz/image trio for the same artist', () => {
  const anchor = item('a', 'A$AP Rocky official music video')
  const clips = Array.from({ length: 100 }, (_, i) => item(`clip${i}`, 'ASAP Rocky official music video'))
  const quiz = { ...item('quiz', 'ASAP Rocky interview quiz', 'fact'), quiz: true }
  const result = composeWave(anchor, [...clips, quiz, item('art', 'ASAP Rocky fan art', 'image')])
  assert.ok(result.ready)
  assert.ok(result.trio.some(c => c.type === 'video'))
  assert.ok(result.trio.some(c => c.type !== 'video'))
  assert.ok(result.trio.every(c => relation(anchor.profile, c.profile)))
})

test('corrected subjects drive primary exploration while secondary topics stay separate', () => {
  const profile = buildProfile({ title: 'A$AP Rocky punk interview' })
  const searches = createSubjectSearches(profile, { ownerId: 'owner', referenceKey: 'ref' }, Date.UTC(2026, 8, 14), 0)
  assert.ok(searches.every(s => s.focus?.subject.key === 'entity:asap rocky'))
  assert.ok(searches.every(s => s.focus?.subjectVersion === 5))
  const raw = { provider: 'youtube' as const, videoId: 'abcdefghijk', url: 'https://youtu.be/abcdefghijk' }
  assert.ok(focusMatchesVideo({ ...raw, title: 'A$AP Rocky collection' }, searches[0].focus))
  assert.equal(focusMatchesVideo({ ...raw, title: 'Punk guitar workshop' }, searches[0].focus), false)
})

test('format markers and incidental topic mentions cannot manufacture subjects or Waves', () => {
  const pov = buildProfile({ title: 'POV: Day 4 as a Yacht Chef | My Bedroom Is Smaller Than the Pantry' })
  assert.equal(pov.subject?.primary, undefined)
  assert.deepEqual(createSubjectSearches(pov, { ownerId: 'owner', referenceKey: 'pov' }, Date.UTC(2026, 8, 14), 0), [])

  const cooking = buildProfile({ title: 'Cooking on a superyacht' })
  const songQuiz = buildProfile({ title: 'Which show is known for the songs "You are a Pirate", "Cooking by the Book" and "We Are Number One"?' })
  const namedDish = buildProfile({ title: 'Fried Rice Cooking GIF by Nigel Ng' })
  assert.equal(cooking.subject?.primary?.key, 'topic:cooking')
  assert.ok(![songQuiz.subject?.primary, ...(songQuiz.subject?.secondary ?? [])].some(subject => subject?.key === 'topic:cooking'))
  assert.equal(relation(cooking, songQuiz), null)
  assert.ok(relation(cooking, namedDish))
  assert.ok(relation(cooking, buildProfile({ title: 'Cooking fail moments' })))
})

test('leading articles and numbered products keep the actual named subject', () => {
  const hosen = buildProfile({
    title: 'Die toten Hosen - Bis zum bitteren Ende Live - Anti WAAhnsins Festival 1986',
  })
  assert.equal(hosen.subject?.primary?.key, 'entity:die toten hosen')

  const diablo = buildProfile({
    description: 'Nicht mehr lange, dann erfahren wir endlich, wie es in der Geschichte von Diablo 4 und mit dem Herrn des Hasses Mephisto weitergeht.',
  })
  assert.equal(diablo.subject?.primary?.key, 'entity:diablo 4')
  assert.equal(diablo.subject?.primary?.evidence, 'description')
})
