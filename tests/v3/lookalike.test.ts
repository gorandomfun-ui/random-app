import assert from 'node:assert/strict'
import test from 'node:test'

import { ObjectId } from 'mongodb'

import { BYTES } from '../../lib/v3/ai/bits'
import { LIKE_COPY, NEAR_LIKE, nearestLike, resemblesLike } from '../../lib/v3/ai/likeness'
import type { LineContext } from '../../lib/v3/ingest/context'
import { mixSeeds } from '../../lib/v3/ingest/lines/drift'
import { likeQueries, likesOfRun, lookalikes, mostlyCjk, run, saysEnough, type LikeRow } from '../../lib/v3/ingest/lines/lookalike'
import type { DigVideo } from '../../lib/v3/dig/video'

/** A fingerprint that shares `same` of its 384 bits with `base` (the rest flipped). */
function near(base: Uint8Array, same: number): Uint8Array {
  const out = Uint8Array.from(base)
  for (let bit = same; bit < BYTES * 8; bit += 1) out[bit >> 3] ^= 1 << (bit & 7)
  return out
}
const seeded = (seed: number) => { let x = seed >>> 0 || 1; return Uint8Array.from({ length: BYTES }, () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x >>> 24 }) }

test('likeness: the nearest like counts, one by one; a copy is not a find', () => {
  const likes = [seeded(1), seeded(2)]
  const close = near(likes[1], Math.round(384 * 0.8))
  assert.equal(nearestLike(close, likes).index, 1)
  assert.ok(Math.abs(nearestLike(close, likes).score - 0.8) < 0.01)
  assert.ok(resemblesLike(nearestLike(close, likes)))
  assert.ok(!resemblesLike(nearestLike(near(likes[0], Math.round(384 * 0.6)), likes)), 'below the threshold')
  assert.ok(!resemblesLike(nearestLike(likes[0], likes)), 'the like itself')
  assert.ok(!resemblesLike(nearestLike(near(likes[0], 380), likes)), 'a re-upload')
  assert.equal(nearestLike(close, []).index, -1)
  assert.ok(NEAR_LIKE < LIKE_COPY)
})

test("a like's searches: what its title says it is, its telling words, its first words; never a hashtag", () => {
  assert.deepEqual(likeQueries('Crazy LEGO Brick Bowl : 2015 Super Bowl Commercials in Lego')[0], 'commercial 2015')
  const pottery = likeQueries('How to creatively repair broken pottery! ✨')
  assert.equal(pottery.length, 2)
  assert.ok(pottery.every((query) => !query.includes('!')))
  const pov = likeQueries('#pov : Ton âme soeur partage ta langue...🤣😱 #shorts #comedy')
  assert.ok(pov.length >= 1 && pov.every((query) => !query.includes('#')))
  assert.deepEqual(likeQueries('ok'), [])
})

test('the likes of a run turn in a fixed order and wrap around', () => {
  const likes = ['c', 'a', 'b'].map((id) => ({ id, title: id, bits: seeded(id.charCodeAt(0)) })) as LikeRow[]
  assert.deepEqual(likesOfRun(likes, 0, 2).map((like) => like.id), ['a', 'b'])
  assert.deepEqual(likesOfRun(likes, 2, 2).map((like) => like.id), ['c', 'a'])
  assert.deepEqual(likesOfRun([], 0, 2), [])
})

test('only what resembles a like goes on, the copies counted apart', () => {
  const likes = [{ id: 'l1', title: 'like', bits: seeded(7) }] as LikeRow[]
  const video = (id: string): DigVideo => ({ videoId: `dailymotion:${id}`, provider: 'dailymotion', url: id, title: id, seconds: 60, live: false })
  const judged = lookalikes([video('close'), video('far'), video('copy')], [near(likes[0].bits, 300), near(likes[0].bits, 200), near(likes[0].bits, 382)], likes, 0)
  assert.deepEqual(judged.close.map((entry) => entry.video.videoId), ['dailymotion:close'])
  assert.equal(judged.copies, 1)
  // Near another like than the one searched for: only when much nearer.
  const two = [likes[0], { id: 'l2', title: 'other', bits: seeded(8) }] as LikeRow[]
  const weak = lookalikes([video('weak'), video('strong')], [near(two[1].bits, Math.round(384 * 0.72)), near(two[1].bits, Math.round(384 * 0.8))], two, 0)
  assert.deepEqual(weak.close.map((entry) => entry.video.videoId), ['dailymotion:strong'])
  assert.equal(weak.close[0].likeness.index, 1)
  assert.ok(!saysEnough('Rocky') && !saysEnough('basket') && !saysEnough('Cats& animals') && saysEnough('Police go round in circles') && saysEnough('Cheerios commercial #2, 1999') && saysEnough('【ドッキリ】 燃焼系フィットネスに参加したら'))
  assert.ok(mostlyCjk('「はさみ持ってあつまれ 工作レッスン（１）」＜こどもちゃれんじ＞ライブ授業') && !mostlyCjk('ALLDAY PROJECT(올데이 프로젝트) WICKED STUDIO CHOOM ORIGINAL'))
})

test("the drift's seeds: half from the taste, half from the wandering, one side short and the other fills in", () => {
  const taste = Array.from({ length: 30 }, (_, index) => `t${index}`)
  const wander = Array.from({ length: 30 }, (_, index) => `w${index}`)
  const mixed = mixSeeds(taste, wander, Math.random, 40)
  assert.equal(mixed.length, 40)
  assert.equal(mixed.filter((seed) => seed.startsWith('t')).length, 20)
  assert.equal(mixSeeds(taste, wander.slice(0, 5), Math.random, 40).filter((seed) => seed.startsWith('t')).length, 30)
  assert.equal(mixSeeds(taste.slice(0, 3), wander, Math.random, 40).length, 33)
})

test('a run: searches with the like\'s words, reads with the model, lets in only the look-alikes, with their fingerprint and their like', async () => {
  const likeId = new ObjectId()
  const likeBits = seeded(11)
  const rows = new Map<string, Record<string, unknown>>([
    ['close', { id: 'xclose', title: 'Repairing a broken bowl with gold', description: '' }],
    ['far', { id: 'xfar', title: 'Football highlights of the week', description: '' }],
    ['copy', { id: 'xcopy', title: 'How to creatively repair broken pottery', description: '' }],
    ['known', { id: 'xknown', title: 'Kintsugi at home', description: '' }],
  ])
  const printsByTitle = new Map<string, Uint8Array>([
    ['Repairing a broken bowl with gold', near(likeBits, 300)],
    ['Football highlights of the week', near(likeBits, 190)],
    ['How to creatively repair broken pottery', near(likeBits, 383)],
  ])
  const http = (async (input: string | URL) => {
    const url = String(input)
    if (url.includes('/player/metadata/')) return new Response(JSON.stringify({ qualities: {} }), { status: 200 })
    if (url.includes('api.dailymotion.com/videos?')) return new Response(JSON.stringify({ list: [...rows.values()].map((row) => ({ ...row, url: `https://www.dailymotion.com/video/${row.id}`, duration: 120, 'owner.id': `o${row.id}`, 'owner.screenname': 'someone' })) }), { status: 200 })
    return new Response(JSON.stringify({ list: [] }), { status: 200 })
  }) as typeof fetch
  const admitted: string[] = []
  const writes: unknown[] = []
  let saved: Record<string, unknown> | null = null
  const collection = (name: string) => ({
    find: (filter: Record<string, unknown>) => ({
      toArray: async () => {
        if (name === 'items' && filter.videoId) return [{ videoId: 'dailymotion:xknown' }]
        return []
      },
    }),
    findOne: async () => null,
    countDocuments: async () => 0,
    updateOne: async (_filter: unknown, update: { $set: Record<string, unknown> }) => { saved = update.$set; return {} },
    bulkWrite: async (operations: unknown[]) => { writes.push(...operations); return {} },
  })
  const ctx = {
    db: { collection } as unknown as LineContext['db'],
    line: 'lookalike', deadline: Date.now() + 60_000, timeLeft: () => 60_000, dryRun: false, cursor: null,
    quota: { reserve: async () => false } as unknown as LineContext['quota'],
    admit: async (batch: { videos?: Array<{ videoId: string }> }) => { admitted.push(...(batch.videos ?? []).map((video) => video.videoId)); return { scanned: batch.videos?.length ?? 0, inserted: batch.videos?.length ?? 0, duplicates: 0, rejected: {}, insertedIds: [] } },
    search: async () => undefined, log: () => undefined, http,
  } as unknown as LineContext
  const likes = async () => [{ id: String(likeId), title: 'How to creatively repair broken pottery! ✨', provider: 'youtube', videoId: 'abc', bits: likeBits }]
  const result = await run(ctx, { likes, prints: async (texts) => texts.map((text) => [...printsByTitle.entries()].find(([title]) => text.startsWith(title))?.[1] ?? seeded(99)) })
  assert.deepEqual([...new Set(admitted)], ['dailymotion:xclose'])
  assert.equal(result.counters.inserted, admitted.length)
  assert.ok(result.counters.rejected['pas assez proche d\'un like'] >= 1)
  assert.ok(result.counters.rejected['copie du like'] >= 1)
  const write = writes[0] as { updateMany: { filter: { videoId: string }; update: { $set: Record<string, unknown> } } }
  assert.equal(write.updateMany.filter.videoId, 'dailymotion:xclose')
  assert.equal((write.updateMany.update.$set['v3.lookalike'] as { like: string }).like, String(likeId))
  assert.ok(saved && (saved as { next: number }).next === 0)
})
