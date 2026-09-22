import test from 'node:test'
import assert from 'node:assert/strict'

import { HOME_PREFETCH_PARALLEL, RANDOM_HOME_PREFETCH_MAX, adoptHomeAdvance, mediaUrlOf, parseHomeAdvance, readHomeAdvance, startHomePrefetch } from '../../lib/discovery/homePrefetch'
import { beats } from '../../lib/v3/cool/score'
import { seeded } from '../../lib/discovery/random'
import { buildProfile } from '../../lib/discovery/profile'
import type { Session } from '../../lib/discovery/pool'
import type { Format } from '../../lib/discovery/types'
import type { RandomContentItem } from '../../lib/random/clientTypes'
import { homeAdvanceKey, randomSessionKey } from '../../lib/random/sessionKeys'

/** The tab's storage, in memory. */
const memory = new Map<string, string>()
;(globalThis as { sessionStorage?: unknown }).sessionStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => { memory.set(key, String(value)) },
  removeItem: (key: string) => { memory.delete(key) },
  clear: () => memory.clear(),
  key: () => null,
  get length() { return memory.size },
}

const NOW = Date.UTC(2026, 8, 22, 12)

/** /api/discovery/random, answering one content per call, after a delay; the same content twice when asked to. */
function fakeApi(options: { delayMs?: number; duplicateFirstTwo?: boolean } = {}) {
  let calls = 0
  let inFlight = 0
  const concurrency: number[] = []
  const request = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls += 1
    inFlight += 1
    concurrency.push(inFlight)
    // Which content this call answers is settled when it starts: three calls in flight are three contents.
    const n = options.duplicateFirstTwo && calls <= 2 ? 1 : calls
    const body = JSON.parse(String(init?.body)) as { session: Session; type: Format }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, options.delayMs ?? 1)
      init?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')) })
    })
    inFlight -= 1
    const payload = { _id: `id${n}`, type: body.type, url: `https://www.youtube.com/watch?v=vid${String(n).padStart(7, '0')}`, text: `texte ${n}`, author: 'a', provider: 'youtube' } as unknown as RandomContentItem
    const candidate = { key: `youtube:v${n}`, type: body.type, provider: 'youtube', profile: buildProfile({ title: `contenu ${n}` }), payload, stock: false, available: true }
    return { status: 200, ok: true, json: async () => ({ version: 2, candidate }) } as Response
  }) as typeof fetch
  return { request, stats: () => ({ calls, concurrency }) }
}

test.beforeEach(() => memory.clear())

test('trois tirages tout de suite, ensemble, puis un à la fois jusqu_à huit ; l_avance est dans l_onglet avec la session', async () => {
  const api = fakeApi()
  const advance = startHomePrefetch('en', { request: api.request, random: seeded(1), now: () => NOW })
  await advance.done
  const { calls, concurrency } = api.stats()
  assert.equal(calls, RANDOM_HOME_PREFETCH_MAX)
  assert.equal(Math.max(...concurrency.slice(0, HOME_PREFETCH_PARALLEL)), HOME_PREFETCH_PARALLEL, 'les trois premiers partent ensemble')
  assert.ok(concurrency.slice(HOME_PREFETCH_PARALLEL).every((count) => count === 1), 'ensuite un seul à la fois')

  const stored = readHomeAdvance('en', false, NOW)
  assert.ok(stored)
  assert.equal(stored.entries.length, RANDOM_HOME_PREFETCH_MAX)
  assert.deepEqual(stored.entries.map((entry) => entry.ticket.revision), [0, 1, 2, 3, 4, 5, 6, 7], 'les tickets se suivent')
  assert.equal(new Set(stored.entries.map((entry) => entry.candidate.key)).size, RANDOM_HOME_PREFETCH_MAX, 'huit contenus différents')
  for (const entry of stored.entries) assert.equal(entry.candidate.type, entry.slot.itemType)
  const visuals = stored.entries.filter((entry) => entry.slot.itemType === 'video' || entry.slot.itemType === 'image')
  assert.deepEqual(visuals.map((entry) => entry.ticket.mode), beats(stored.session.seed, visuals.length), 'les visuels de l_accroche sont cool')
  assert.equal(stored.session.displayed, 0, 'la session gardée précède les tirages')
  assert.equal(stored.sequence.draws, 0)
  assert.equal(stored.entries[7].sequenceAfter.draws, 8)
})

test('l_avance s_arrête dès que le visiteur quitte la home', async () => {
  const api = fakeApi({ delayMs: 15 })
  const advance = startHomePrefetch('en', { request: api.request, random: seeded(2), now: () => NOW })
  await new Promise((resolve) => setTimeout(resolve, 40))
  advance.stop()
  await advance.done
  const stored = readHomeAdvance('en', false, NOW)
  assert.ok(stored)
  assert.ok(stored.entries.length >= HOME_PREFETCH_PARALLEL && stored.entries.length < RANDOM_HOME_PREFETCH_MAX, `${stored.entries.length} tirages`)
  assert.ok(api.stats().calls < RANDOM_HOME_PREFETCH_MAX)
})

test('rien n_est préparé quand l_onglet tient déjà une session Random, ni une avance', async () => {
  memory.set(randomSessionKey('en', false), JSON.stringify({ timestamp: NOW - 1000, discovery: { version: 2 } }))
  const api = fakeApi()
  await startHomePrefetch('en', { request: api.request, now: () => NOW }).done
  assert.equal(api.stats().calls, 0)

  memory.clear()
  const first = fakeApi()
  await startHomePrefetch('fr', { request: first.request, random: seeded(3), now: () => NOW }).done
  const again = fakeApi()
  await startHomePrefetch('fr', { request: again.request, now: () => NOW }).done
  assert.equal(again.stats().calls, 0, 'une avance fraîche suffit')

  memory.set(randomSessionKey('en', false), JSON.stringify({ timestamp: NOW - 7 * 3600 * 1000, discovery: { version: 2 } }))
  const stale = fakeApi()
  await startHomePrefetch('en', { request: stale.request, random: seeded(4), now: () => NOW }).done
  assert.equal(stale.stats().calls, RANDOM_HOME_PREFETCH_MAX, 'une session périmée ne compte pas')
})

test('le même contenu deux fois parmi les trois premiers : la position est retirée seule', async () => {
  const api = fakeApi({ duplicateFirstTwo: true })
  await startHomePrefetch('de', { request: api.request, random: seeded(5), now: () => NOW }).done
  const stored = readHomeAdvance('de', false, NOW)
  assert.ok(stored)
  assert.equal(stored.entries.length, RANDOM_HOME_PREFETCH_MAX)
  assert.equal(new Set(stored.entries.map((entry) => entry.candidate.key)).size, RANDOM_HOME_PREFETCH_MAX)
  assert.equal(api.stats().calls, RANDOM_HOME_PREFETCH_MAX + 1, 'un tirage de plus, pour la position en doublon')
})

test('la page adopte l_avance : les tirages sont réservés dans l_ordre, la partition continue après eux', async () => {
  const api = fakeApi()
  await startHomePrefetch('es', { request: api.request, random: seeded(6), now: () => NOW }).done
  const stored = readHomeAdvance('es', false, NOW)
  assert.ok(stored)
  const { controller, entries } = adoptHomeAdvance(stored)
  assert.equal(entries.length, RANDOM_HOME_PREFETCH_MAX)
  assert.equal(controller.projected.displayed, RANDOM_HOME_PREFETCH_MAX)
  assert.equal(controller.snapshot().displayed, 0, 'rien n_est affiché encore')
  const visuals = entries.filter((entry) => entry.slot.itemType === 'video' || entry.slot.itemType === 'image').length
  assert.equal(controller.projected.beat, visuals, 'la position dans la partition est celle d_après l_avance')
  controller.displayed(entries[0].candidate.key)
  assert.equal(controller.snapshot().displayed, 1)

  const partial = adoptHomeAdvance(stored, (candidate) => candidate.key !== stored.entries[2].candidate.key)
  assert.equal(partial.entries.length, 2, 'un contenu refusé arrête l_adoption là, l_ordre reste entier')
  assert.equal(partial.controller.projected.displayed, 2)
})

test('une avance illisible, périmée ou d_une autre langue est ignorée', () => {
  assert.equal(parseHomeAdvance('{}', 'en', NOW), null)
  assert.equal(parseHomeAdvance('pas du json', 'en', NOW), null)
  const api = fakeApi()
  return startHomePrefetch('jp', { request: api.request, random: seeded(7), now: () => NOW }).done.then(() => {
    const raw = memory.get(homeAdvanceKey('jp', false))!
    assert.ok(parseHomeAdvance(raw, 'jp', NOW))
    assert.equal(parseHomeAdvance(raw, 'en', NOW), null)
    assert.equal(parseHomeAdvance(raw, 'jp', NOW + 7 * 3600 * 1000), null)
  })
})

test('ce que la home réchauffe : la vignette de la vidéo, l_image elle-même', () => {
  assert.equal(mediaUrlOf({ type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } as RandomContentItem), 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
  assert.equal(mediaUrlOf({ type: 'video', url: 'https://www.dailymotion.com/video/x8abc12', thumbUrl: 'https://cdn/x.jpg' } as RandomContentItem), 'https://cdn/x.jpg')
  assert.equal(mediaUrlOf({ type: 'video', url: 'https://www.dailymotion.com/video/x8abc12' } as RandomContentItem), 'https://www.dailymotion.com/thumbnail/video/x8abc12')
  assert.equal(mediaUrlOf({ type: 'image', url: 'https://i/full.gif', thumbUrl: 'https://i/small.gif' } as RandomContentItem), 'https://i/small.gif')
  assert.equal(mediaUrlOf({ type: 'quote', text: 'x', author: 'y', provider: 'p' } as RandomContentItem), null)
})
