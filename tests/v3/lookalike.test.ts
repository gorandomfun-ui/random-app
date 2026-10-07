import assert from 'node:assert/strict'
import test from 'node:test'

import { ObjectId } from 'mongodb'

import { BYTES } from '../../lib/v3/ai/bits'
import { LIKE_COPY, NEAR_LIKE, nearestLike, nearestLikeInScript, resemblesLike, scriptOf } from '../../lib/v3/ai/likeness'
import type { LineContext } from '../../lib/v3/ingest/context'
import { mixSeeds } from '../../lib/v3/ingest/lines/drift'
import { likeQueries, likesOfRun, lookalikes, mostlyCjk, PAGES, QUERIES_PER_LIKE, run, saysEnough, SEEN, uploadsOf, type LikeRow } from '../../lib/v3/ingest/lines/lookalike'
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

test("a like's searches: what its title says it is, its telling words, its first words, its tags, its channel, the nearest titles; never a hashtag, never twice", () => {
  assert.deepEqual(likeQueries({ title: 'Crazy LEGO Brick Bowl : 2015 Super Bowl Commercials in Lego' })[0], 'commercial 2015')
  const pottery = likeQueries({ title: 'How to creatively repair broken pottery! ✨' })
  assert.ok(pottery.length >= 2 && pottery.length <= 3)
  assert.ok(pottery.every((query) => !query.includes('!')))
  const pov = likeQueries({ title: '#pov : Ton âme soeur partage ta langue...🤣😱 #shorts #comedy' })
  assert.ok(pov.length >= 1 && pov.every((query) => !query.includes('#')))
  assert.deepEqual(likeQueries({ title: 'ok' }), [])
  const full = likeQueries({ title: 'Thailand street food', tags: ['street food', 'bangkok', 'thai_cuisine', 'ok', 'Street Food'], channel: 'Mark Wiens' }, ['Thai Street Food - Bangkok Thailand Compilation', 'camboya STREET FOOD 🇰🇭', 'ok', 'Thai Street Food - Bangkok Thailand Compilation'])
  assert.ok(full.includes('street food bangkok'), 'the first two tags together')
  assert.ok(full.includes('thai cuisine') && !full.includes('ok'), 'tags cleaned, short ones left out')
  assert.equal(full.filter((query) => query.toLowerCase() === 'street food').length, 1, 'never twice')
  assert.ok(full.includes('Mark Wiens'), 'the channel')
  assert.ok(full.includes('Thai Street Food Bangkok Thailand') && full.includes('camboya STREET FOOD'), 'the nearest titles, first words')
  assert.equal(full.filter((query) => query === 'Thai Street Food Bangkok Thailand').length, 1)
  assert.ok(full.length <= QUERIES_PER_LIKE)
  const many = likeQueries({ title: 'Thailand street food', tags: Array.from({ length: 30 }, (_, index) => `tag number ${index}`), channel: 'Mark Wiens' }, Array.from({ length: 30 }, (_, index) => `Title number ${String.fromCharCode(97 + index)}${String.fromCharCode(97 + index)} says enough`))
  assert.equal(many.length, 1 + 8 + 1 + 8)
  assert.equal(many.filter((query) => query.startsWith('tag number')).length, 8, 'eight tag searches at most, the first two together among them')
  assert.equal(many.filter((query) => query.startsWith('Title number')).length, 8, 'eight nearest titles at most')
  assert.ok(QUERIES_PER_LIKE >= 1 + 8 + 1 + 8)
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
  assert.ok(!saysEnough('#tgiks') && !saysEnough('suara hantu pagi hari || #shorts #comedy') && !saysEnough('New Zealand'), 'a hashtag soup or a bare name says nothing')
  assert.ok(mostlyCjk('「はさみ持ってあつまれ 工作レッスン（１）」＜こどもちゃれんじ＞ライブ授業') && !mostlyCjk('ALLDAY PROJECT(올데이 프로젝트) WICKED STUDIO CHOOM ORIGINAL'))
  // The script must agree: a Korean game stream came to a Japanese like at 0.83 (6 October), the script more than the sense.
  assert.equal(scriptOf('【マインクラフト】とうとうドッキリもここまできてしまいました【日常組】'), 'ja')
  assert.equal(scriptOf('홍구한테 1승 하고싶어서 ... 모든걸 금지시키는 졸렬한 상대 ㅋㅋㅋㅋㅋ'), 'ko')
  assert.equal(scriptOf('ALLDAY PROJECT(올데이 프로젝트) WICKED STUDIO CHOOM ORIGINAL'), 'ko')
  assert.equal(scriptOf('【熱血武俠】乞丐跌落山崖竟得猴王真傳！'), 'zh')
  assert.equal(scriptOf('Anh Hùng Vũ Trụ Tập 42'), 'other')
  assert.equal(scriptOf('Pioneer DVL-V888 LaserDisc 映像'), 'other', 'two characters do not tell')
  const japanese = { id: 'ja', title: '【マインクラフト】ドッキリ', bits: seeded(21) } as LikeRow
  const korean = lookalikes([{ ...video('ko'), title: '홍구한테 1승 하고싶어서 모든걸 금지시키는 상대' }, { ...video('ja2'), title: '【RUST】ちーちゃんに教えてもらう' }], [near(japanese.bits, Math.round(384 * 0.85)), near(japanese.bits, Math.round(384 * 0.85))], [japanese], 0)
  assert.deepEqual(korean.close.map((entry) => entry.video.videoId), ['dailymotion:ja2'])
  assert.equal(nearestLikeInScript(near(japanese.bits, 380), 'Anh Hùng Vũ Trụ Tập 42', [japanese]).index, -1)
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
  const pages: string[] = []
  const related: string[] = []
  const http = (async (input: string | URL) => {
    const url = String(input)
    if (url.includes('/player/metadata/')) return new Response(JSON.stringify({ qualities: {} }), { status: 200 })
    if (url.includes('api.dailymotion.com/videos?')) {
      const params = new URL(url).searchParams
      pages.push(`${params.get('sort')}:${params.get('page') ?? '1'}`)
      return new Response(JSON.stringify({ list: [...rows.values()].map((row) => ({ ...row, url: `https://www.dailymotion.com/video/${row.id}`, duration: 120, 'owner.id': `o${row.id}`, 'owner.screenname': 'someone' })) }), { status: 200 })
    }
    if (url.includes('/related?')) { related.push(url.split('/video/')[1].split('/')[0]); return new Response(JSON.stringify({ list: [{ id: 'xjudged', title: 'A vase glued back together', description: '', url: 'https://www.dailymotion.com/video/xjudged', duration: 100, 'owner.id': 'oj', 'owner.screenname': 'someone' }] }), { status: 200 }) }
    return new Response(JSON.stringify({ list: [] }), { status: 200 })
  }) as typeof fetch
  const admitted: string[] = []
  const writes: unknown[] = []
  const remembered: string[] = []
  const spreadMarked: unknown[] = []
  let saved: Record<string, unknown> | null = null
  let clock: unknown = null
  const collection = (name: string) => ({
    find: (filter: Record<string, unknown>) => ({
      toArray: async () => {
        if (name === 'items' && filter.videoId) return [{ videoId: 'dailymotion:xknown' }]
        // The base's look-alikes of this like: one on Dailymotion whose neighbours are still to read, its title a search of its own.
        if (name === 'items' && filter['v3.lookalike.like']) return [{ _id: new ObjectId(), title: 'Kintsugi bowl repair with gold', videoId: 'dailymotion:xfound' }]
        if (name === SEEN) return [{ _id: 'dailymotion:xjudged' }]
        return []
      },
    }),
    findOne: async () => ({ next: 0, visits: { [String(likeId)]: 3 } }),
    countDocuments: async () => 0,
    createIndex: async (keys: unknown, options: unknown) => { clock = { keys, options }; return 'seen_ttl' },
    updateOne: async (_filter: unknown, update: { $set: Record<string, unknown> }) => { saved = update.$set; return {} },
    updateMany: async (filter: unknown, update: unknown) => { spreadMarked.push({ filter, update }); return {} },
    bulkWrite: async (operations: Array<{ insertOne?: { document: { _id: string } } }>) => {
      if (name === SEEN) remembered.push(...operations.map((operation) => operation.insertOne!.document._id)); else writes.push(...operations)
      return {}
    },
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
  // By relevance, on the page the visit says (the fourth visit reads page 4); never the random, visited or recent sorts.
  assert.ok(pages.length >= 2 && pages.every((page) => page === 'relevance:4'), pages.join(' '))
  assert.ok((saved as { visits: Record<string, number> }).visits[String(likeId)] === 4)
  assert.equal(likeQueries({ title: 'x' }).length, 0)
  assert.ok(PAGES >= 4)
  // The neighbours of the look-alike already found were read, and it is marked read.
  assert.deepEqual(related, ['xfound'])
  assert.equal(spreadMarked.length, 1)
  // The video the model judged these last weeks was not read again; the ones judged now and found nothing alike are remembered; the three-week clock is set.
  assert.ok(!remembered.includes('dailymotion:xjudged'))
  assert.ok(remembered.includes('dailymotion:xfar') && !remembered.includes('dailymotion:xclose'))
  assert.ok(result.counters.rejected['déjà jugée'] === 1)
  assert.ok(clock && (clock as { options: { expireAfterSeconds: number } }).options.expireAfterSeconds === 21 * 86_400)
})

test("a YouTube like gives its channel: two pages of uploads a visit, details only for what is new, the week's cap, the day's units", async () => {
  process.env.YOUTUBE_API_KEY = 'test-key'
  const likeId = new ObjectId()
  const likeBits = seeded(31)
  const calls: string[] = []
  const reserved: number[] = []
  const http = (async (input: string | URL) => {
    const url = new URL(String(input))
    calls.push(url.hostname + url.pathname)
    if (url.pathname.endsWith('/playlistItems')) {
      assert.equal(url.searchParams.get('playlistId'), 'UUabcdefghijklmnopqrstuv')
      const page = url.searchParams.get('pageToken')
      if (!page) return new Response(JSON.stringify({ items: [{ contentDetails: { videoId: 'ytclose' } }, { contentDetails: { videoId: 'ytknown' } }, { contentDetails: { videoId: 'ytjudged' } }], nextPageToken: 'p2' }), { status: 200 })
      return new Response(JSON.stringify({ items: [{ contentDetails: { videoId: 'ytfar' } }] }), { status: 200 })
    }
    if (url.hostname === 'www.googleapis.com' && url.pathname.endsWith('/videos')) {
      const ids = (url.searchParams.get('id') ?? '').split(',')
      assert.ok(!ids.includes('ytknown') && !ids.includes('ytjudged'), 'no unit spent on what the base holds or the model judged')
      return new Response(JSON.stringify({ items: ids.map((id) => ({ id, snippet: { title: id === 'ytclose' ? 'Repairing a broken bowl with gold' : 'Football highlights of the week', description: '', channelId: 'UCabcdefghijklmnopqrstuv', channelTitle: 'potter', publishedAt: '2024-01-01T00:00:00Z' }, status: { embeddable: true, privacyStatus: 'public' }, statistics: { viewCount: '100' }, contentDetails: { duration: 'PT2M' } })) }), { status: 200 })
    }
    if (url.pathname.endsWith('/channels')) return new Response(JSON.stringify({ items: [{ id: 'UCabcdefghijklmnopqrstuv', statistics: { videoCount: '40' } }] }), { status: 200 })
    return new Response(JSON.stringify({ list: [] }), { status: 200 })
  }) as typeof fetch
  const printsByTitle = new Map<string, Uint8Array>([['Repairing a broken bowl with gold', near(likeBits, 300)], ['Football highlights of the week', near(likeBits, 190)]])
  const admitted: Array<{ videoId: string; provider: string }> = []
  let saved: Record<string, unknown> | null = null
  const collection = (name: string) => ({
    find: (filter: Record<string, unknown>) => ({ toArray: async () => {
      if (name === 'items' && filter.videoId) return [{ videoId: 'ytknown' }]
      if (name === SEEN) return [{ _id: 'ytjudged' }]
      return []
    } }),
    findOne: async () => ({ next: 0, visits: {}, youtube: {} }),
    countDocuments: async () => 0,
    createIndex: async () => 'seen_ttl',
    updateOne: async (_filter: unknown, update: { $set: Record<string, unknown> }) => { saved = update.$set; return {} },
    updateMany: async () => ({}),
    bulkWrite: async () => ({}),
  })
  const ctx = {
    db: { collection } as unknown as LineContext['db'],
    line: 'lookalike', deadline: Date.now() + 60_000, timeLeft: () => 60_000, dryRun: false, cursor: null,
    quota: { reserve: async (units: number) => { reserved.push(units); return true } } as unknown as LineContext['quota'],
    admit: async (batch: { videos?: Array<{ videoId: string; provider: string }> }) => { admitted.push(...(batch.videos ?? [])); return { scanned: batch.videos?.length ?? 0, inserted: batch.videos?.length ?? 0, duplicates: 0, rejected: {}, insertedIds: [] } },
    search: async () => undefined, log: () => undefined, http,
  } as unknown as LineContext
  const likes = async () => [{ id: String(likeId), title: 'How to creatively repair broken pottery! ✨', provider: 'youtube', videoId: 'abc', channelId: 'UCabcdefghijklmnopqrstuv', bits: likeBits }]
  const result = await run(ctx, { likes, prints: async (texts) => texts.map((text) => [...printsByTitle.entries()].find(([title]) => text.startsWith(title))?.[1] ?? seeded(99)) })
  assert.deepEqual(admitted.map((video) => `${video.provider}:${video.videoId}`), ['youtube:ytclose'])
  assert.equal(result.counters.byProvider?.youtube, 1)
  assert.equal(calls.filter((path) => path.endsWith('/playlistItems')).length, 2, 'two pages')
  assert.equal(calls.filter((path) => path === 'www.googleapis.com/youtube/v3/videos').length, 1, 'one details call')
  // Two pages, one details call, one channel-size call for the media windows: four units, each reserved first.
  assert.equal(reserved.length, 4)
  assert.equal((saved as { youtube: Record<string, string | null> }).youtube[String(likeId)], null, 'past the last page: the next visit starts over')
  assert.equal(uploadsOf('UCabcdefghijklmnopqrstuv'), 'UUabcdefghijklmnopqrstuv')
  assert.equal(uploadsOf('x1abc'), null)
  delete process.env.YOUTUBE_API_KEY
})
