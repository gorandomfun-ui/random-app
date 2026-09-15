import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProfile } from '../../lib/discovery/profile'
import { legacySourceSnapshot } from '../../lib/discovery/backfill'
import { resolveEntityHit, sourceEntityQueries } from '../../lib/discovery/entityResolver'
import { providerPageWords } from '../../lib/discovery/sourceEvidence'
import { composeAvailableWave, relation, WaveSession } from '../../lib/discovery/waves'
import { createSubjectSearches } from '../../lib/discovery/subjectExploration'
import { gapSearches } from '../../lib/discovery/subjectMaintenance'
import type { Candidate } from '../../lib/discovery/types'
const now = Date.UTC(2026, 8, 15)
const item = (key: string, title: string, type: 'video' | 'image' = 'video'): Candidate => ({ key, type,
  provider: 'fixture', payload: key, profile: buildProfile({ title }), available: true, stock: false })

test('observed source title patterns recognise arbitrary subjects, not a hand-maintained artist list', () => {
  const cases = [
    ['1993 - WABC-TV Neil Diamond Christmas Special Promo - theVHSfiles', 'entity:neil diamond'],
    ['En cuisine avec Pierre Augé, et sa tielle à la seiche', 'entity:pierre auge'],
    ['1999 - KXYZ-TV Nora Legrand Christmas Special Promo', 'entity:nora legrand'],
    ['In the studio with Lina Moreau, and her sculptures', 'entity:lina moreau'],
    ['Peugeot 108 - World’s First Interactive Automotive Trailer', 'entity:peugeot 108'],
  ]
  for (const [title, key] of cases) assert.equal(buildProfile({ title }).subject?.primary?.key, key, title)
  assert.equal(buildProfile({ title: 'POV: Day 4 as a Yacht Chef' }).subject?.primary, undefined)
})

test('actual provider permalink can recover a GIF subject when the visual caption cannot; CDN and fake hosts cannot', () => {
  const source = legacySourceSnapshot({ type: 'image', provider: 'tenor', title: 'a woman wearing a black hat and making a funny face .',
    source: { url: 'https://tenor.com/view/dojacat-doja-shocked-shocked-stan-twt-doja-gif-24117910' } })
  const p = buildProfile(source)
  assert.equal(p.subject?.primary?.key, 'entity:doja cat')
  assert.ok(relation(p, buildProfile({ title: 'Doja Cat interview' })))
  assert.ok(p.tokens.includes('dojacat'))
  assert.deepEqual(providerPageWords({ ...source, pageUrl: 'https://tenor.com.attacker.invalid/view/doja-cat-gif-1' }), [])
  assert.deepEqual(providerPageWords({ ...source, pageUrl: 'https://media.tenor.com/123/doja-cat.gif' }), [])
  assert.equal(buildProfile({ title: 'a person smiles', provider: 'tenor', pageUrl: 'https://tenor.com/view/happyjump-gif-12345' }).subject?.primary, undefined, 'a compact reaction slug alone does not establish an entity')
  assert.equal(buildProfile({ title: 'Anonymous reaction', tags: ['Doja Cat'] }).subject?.primary, undefined)
})

test('canonical entities resolve through source evidence and domain, with uncertain homonyms rejected', () => {
  const hits = [
    { id: 'Q1', label: 'Madonna', description: 'American singer and songwriter', aliases: ['Madonna'] },
    { id: 'Q2', label: 'Madonna', description: 'painting by an Italian painter', aliases: ['Madonna'] },
  ]
  assert.equal(resolveEntityHit({ title: 'Madonna — Official music video' }, 'Madonna', hits)?.entityId, 'Q1')
  assert.equal(resolveEntityHit({ title: 'Madonna' }, 'Madonna', hits), undefined)
  assert.equal(resolveEntityHit({ title: 'Unrelated punk performance' }, 'Madonna', hits), undefined)
  assert.equal(resolveEntityHit({ title: 'Nora Legrand interview' }, 'Nora Legrand', [{ id: 'Q9', label: 'Nora Legrand', aliases: ['Nora Legrand'] }])?.entityId, 'Q9')
  const a = buildProfile({ title: 'Fictional Name interview', primarySubject: { label: 'Canonical Name', aliases: ['Fictional Name'], kind: 'entity', entityId: 'Q900' } })
  const b = buildProfile({ title: 'Canonical Name collection', primarySubject: { label: 'Canonical Name', kind: 'entity', entityId: 'Q900' } })
  assert.ok(relation(a, b))
  const homonym = buildProfile({ title: 'Canonical Name collection', primarySubject: { label: 'Canonical Name', kind: 'entity', entityId: 'Q901' } })
  assert.equal(relation(a, homonym), null, 'different verified identities cannot match through a shared label')
  assert.ok(sourceEntityQueries({ title: '【MV】祝祭！無スティバル / 剣持刀也' }).includes('剣持刀也'))
})

test('one or two real relations remain available; no unrelated filler or trio of images/clips', () => {
  const anchor = item('anchor', 'Nora Legrand official video')
  for (const count of [1, 2, 3] as const) {
    const candidates = [item('interview', 'Nora Legrand interview'), item('art', 'Nora Legrand fan art', 'image'), item('collection', 'Nora Legrand collection')].slice(0, count)
    const plan = composeAvailableWave(anchor, [...candidates, item('unrelated', 'Generic punk concert')])
    assert.ok(plan.ready); assert.equal(plan.trio.length, count)
    const session = new WaveSession(anchor, plan.trio, count)
    for (let i = 0; i < count; i++) { const next = session.next(); assert.ok(next); session.displayed(next.key) }
    assert.equal(session.next(), null)
  }
  const clips = composeAvailableWave(anchor, [1, 2, 3].map(i => item(`clip${i}`, 'Nora Legrand official video')))
  assert.ok(clips.ready); assert.equal(clips.trio.length, 1)
  const images = composeAvailableWave(anchor, [1, 2, 3].map(i => item(`image${i}`, 'Nora Legrand portrait', 'image')))
  assert.ok(images.ready); assert.equal(images.trio.length, 1)
  assert.equal(composeAvailableWave(anchor, [item('other', 'Lina Moreau interview')]).ready, false)
})

test('every curation turn includes an unrestricted subject search, while depth/geography and side topics rotate', () => {
  const p = buildProfile({ title: 'Johnny Hallyday moto désert' })
  const turns = Array.from({ length: 48 }, (_, i) => createSubjectSearches(p, { ownerId: 'owner', referenceKey: 'ref' }, now, i))
  for (const [open, depth] of turns) {
    assert.equal(open.kind, 'search'); if (open.kind !== 'search') continue
    assert.ok(p.subject!.primary!.aliases.some(a => open.query === `"${a}"`)); assert.equal(open.focus?.branch, 'primary')
    assert.ok(depth.focus)
  }
  assert.equal(new Set(turns.map(x => x[0].kind === 'search' && x[0].order)).size, 3)
  assert.ok(turns.flat().some(x => x.coverage?.area === 'japan'))
  assert.ok(turns.flat().some(x => x.focus?.branch === 'secondary'))
  const gap = gapSearches(p, now)
  assert.equal(gap.length, 2); assert.ok(gap.every(x => !x.focus && x.subjectScope?.subject.key === 'entity:johnny hallyday'))
})
