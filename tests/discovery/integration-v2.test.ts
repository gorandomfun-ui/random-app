import test from 'node:test'
import assert from 'node:assert/strict'
import { DiscoveryController } from '../../lib/discovery/controller'
import { newSession } from '../../lib/discovery/pool'
import { buildProfile } from '../../lib/discovery/profile'
import { WaveSession } from '../../lib/discovery/waves'
import { createCuratorToken, validCuratorToken, matchesCuratorSecret, sameOrigin } from '../../lib/discovery/curatorAuth'
import { dailymotionPageLoader } from '../../lib/discovery/dailymotion'
import type { Candidate } from '../../lib/discovery/types'
import type { DiscoveryTask } from '../../lib/discovery/exploration'

const item = (key: string, type: 'image' | 'video' = 'video'): Candidate<string> => ({ key, type, provider: 'youtube',
  profile: buildProfile({ title: 'Stone carving workshop' }), payload: key, stock: false, available: true })
test('three reserved items commit only on display; invalidation restores all projected counters', async () => {
  const controller = new DiscoveryController<string>(newSession(19))
  for (let i = 0; i < 3; i++) await controller.prepare('video', async () => item(`v${i}`))
  assert.equal(controller.snapshot().displayed, 0); assert.equal(controller.projected.displayed, 3)
  controller.displayed('v0'); controller.invalidate()
  assert.equal(controller.snapshot().displayed, 1); assert.equal(controller.projected.displayed, 1)
  await controller.prepare('video', async () => item('replacement'))
  controller.displayed('replacement'); assert.equal(controller.snapshot().displayed, 2)
})
test('a late image response cannot replace a requested video slot', async () => {
  const controller = new DiscoveryController<string>(newSession(5))
  await assert.rejects(controller.prepare('video', async () => item('wrong', 'image')), /invalid Random reservation/)
  assert.equal(controller.projected.displayed, 0)
})
test('Wave appearance updates repetition history without consuming an ordinary Random or its cool tickets', () => {
  const controller = new DiscoveryController<string>(newSession(6))
  controller.waveDisplayed(item('wave'))
  assert.equal(controller.snapshot().displayed, 0); assert.equal(controller.snapshot().coolTickets, 0)
  assert.equal(controller.snapshot().recent[0].key, 'wave')
})
test('a failure reported just after Wave display is replaced in the same three-item trail', () => {
  const wave = new WaveSession(item('anchor'), [item('a'), item('b'), item('c'), item('d'), item('e', 'image')])
  const first = wave.next()!; wave.displayed(first.key); wave.revokeLast(first.key)
  assert.equal(wave.displayedCount, 0); assert.notEqual(wave.next()?.key, first.key)
  for (let i = 0; i < 3; i++) wave.displayed(wave.next()!.key)
  assert.equal(wave.next(), null)
})
test('private curation requires configured secret, signed nonexpired cookie and same-origin writes', () => {
  const oldSecret = process.env.RANDOM_CURATOR_SECRET, oldOwner = process.env.RANDOM_EDITOR_OWNER_ID
  try {
    process.env.RANDOM_CURATOR_SECRET = 'test-only-secret-012345678901234567890'; process.env.RANDOM_EDITOR_OWNER_ID = 'test-owner'
    const now = Date.now(), token = createCuratorToken(now)
    assert.ok(validCuratorToken(token, now)); assert.ok(!validCuratorToken(token, now + 86400001))
    assert.ok(!validCuratorToken(token.slice(0, -2) + 'zz', now)); assert.ok(!matchesCuratorSecret('wrong'))
    assert.ok(!sameOrigin(new Request('https://test.invalid/api', { headers: { origin: 'https://outside.invalid' } })))
    delete process.env.RANDOM_CURATOR_SECRET; assert.ok(!validCuratorToken(token, now))
  } finally {
    if (oldSecret === undefined) delete process.env.RANDOM_CURATOR_SECRET; else process.env.RANDOM_CURATOR_SECRET = oldSecret
    if (oldOwner === undefined) delete process.env.RANDOM_EDITOR_OWNER_ID; else process.env.RANDOM_EDITOR_OWNER_ID = oldOwner
  }
})
test('Dailymotion partitions keep dates/sort/category across pagination and never use the query as evidence', async () => {
  const urls: URL[] = []
  const loader = dailymotionPageLoader((async input => {
    urls.push(new URL(String(input))); return Response.json({ list: [{ id: 'x123', title: 'MVI 0781', 'owner.id': 'u123', views_total: 10 }], has_more: true })
  }) as typeof fetch)
  const task = { _id: 'task', depth: 0, spec: { kind: 'dailymotion', category: 'creation', after: '2008-01-01', before: '2009-01-01', sort: 'least-visited' } } as DiscoveryTask
  const page = await loader(task, new AbortController().signal, async () => true)
  await loader({ ...task, cursor: page.nextCursor }, new AbortController().signal, async () => true)
  for (const key of ['created_after', 'created_before', 'sort', 'channel']) assert.equal(urls[0].searchParams.get(key), urls[1].searchParams.get(key))
  assert.equal(urls[1].searchParams.get('page'), '2'); assert.equal(page.videos[0].channelId, 'u123')
  assert.equal(page.videos[0].title, 'MVI 0781'); assert.equal(page.videos[0].viewCount, 10)
})
