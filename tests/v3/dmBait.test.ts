import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { BSON, ObjectId, type Db, type Document } from 'mongodb'

import { screenJunk } from '../../lib/ingest/junkStore'
import { askUploads } from '../../lib/v3/bait/ask'
import { judgeAccount, MIN_UPLOADS, type Upload } from '../../lib/v3/bait/rule'
import { BAIT_ACCOUNTS, BAIT_CHECKS, FEW_RECHECK_MS, resetBaitAccountsCache, verdictHolds } from '../../lib/v3/bait/store'
import type { LineContext } from '../../lib/v3/ingest/context'
import { run, SPACING_MS, WINDOW_MS } from '../../lib/v3/ingest/lines/dm-bait'

// Account x1cfbdd as Dailymotion listed it on 24 October: thirty-eight uploads of 19 November 2013, all 302 s, no word.
const X1CFBDD_TITLES = ['スクール革命　20131110　HeySayJump', 'vs嵐 ももクロ', 'SNOW DOMEの約束　キスマイ', 'AKBドラフト会議　③', '20131118 週間EXILE']
const bait = (count: number, seconds = 302, start = 1384866658): Upload[] =>
  Array.from({ length: count }, (_, index) => ({ id: `x17d${index}`, title: X1CFBDD_TITLES[index % X1CFBDD_TITLES.length], description: '', duration: seconds, created_time: start + index * 900 }))
const real = (count: number): Upload[] =>
  Array.from({ length: count }, (_, index) => ({ id: `xr${index}`, title: `Clip ${index}`, description: '', duration: 40 + index * 7, created_time: 1700000000 + index * 86400 }))

test('the signature of x1cfbdd: ten uploads or more, all of one length to the second, none with a word under it', () => {
  assert.deepEqual(judgeAccount(bait(38)), { verdict: 'bait', listed: 38, seconds: 302 })
  assert.equal(judgeAccount(bait(MIN_UPLOADS)).verdict, 'bait')
  // Spaces and line breaks are no description either.
  assert.equal(judgeAccount(bait(12).map((upload, index) => ({ ...upload, description: index % 2 ? '  \n ' : null }))).verdict, 'bait')
})

test('under ten uploads the account is not judged: three videos of one length prove nothing', () => {
  assert.deepEqual(judgeAccount(bait(MIN_UPLOADS - 1)), { verdict: 'few', listed: MIN_UPLOADS - 1 })
  assert.deepEqual(judgeAccount([]), { verdict: 'few', listed: 0 })
})

test('one word under one upload, or one upload a second longer, and the account is clean', () => {
  const described = bait(38)
  described[17] = { ...described[17], description: 'Watch the full episode here' }
  assert.equal(judgeAccount(described).verdict, 'clean')
  const longer = bait(38)
  longer[37] = { ...longer[37], duration: 303 }
  assert.equal(judgeAccount(longer).verdict, 'clean')
  assert.equal(judgeAccount(real(60)).verdict, 'clean', 'a real account without descriptions has many lengths')
})

test('a length that is no length — a live at 0, a missing one — is never "the same length"', () => {
  assert.equal(judgeAccount(bait(20, 0)).verdict, 'clean', 'twenty lives of a television channel')
  assert.equal(judgeAccount(bait(20).map((upload) => ({ ...upload, duration: null }))).verdict, 'clean')
  const oneMissing = bait(20)
  oneMissing[0] = { ...oneMissing[0], duration: undefined }
  assert.equal(judgeAccount(oneMissing).verdict, 'clean')
})

test('the nearest real account measured on 24 October — 55 % of its hundred clips at 32 s, no descriptions — is clean', () => {
  const clips: Upload[] = Array.from({ length: 100 }, (_, index) => ({ id: `xs${index}`, description: '', duration: index < 55 ? 32 : [28, 30, 31, 33, 34, 36][index % 6] }))
  assert.equal(judgeAccount(clips).verdict, 'clean')
})

test('one question per account: its hundred latest uploads, newest first; an unknown account is gone, a refusal throws', async () => {
  const asked: string[] = []
  const request = (async (input: string | URL) => {
    const url = new URL(String(input))
    asked.push(url.pathname)
    assert.equal(url.searchParams.get('limit'), '100')
    assert.equal(url.searchParams.get('sort'), 'recent')
    assert.deepEqual(url.searchParams.get('fields')?.split(',').sort(), ['created_time', 'description', 'duration', 'id', 'title'])
    if (url.pathname.includes('xgone')) return new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 })
    if (url.pathname.includes('xbusy')) return new Response('', { status: 429 })
    return new Response(JSON.stringify({ total: 38, list: bait(3).map(({ id, title, description, duration, created_time }) => ({ id, title, description, duration, created_time })) }))
  }) as typeof fetch
  const answer = await askUploads('x1cfbdd', request)
  assert.equal(answer.gone, false)
  assert.equal(!answer.gone && answer.total, 38)
  assert.equal(!answer.gone && answer.uploads[0].duration, 302)
  assert.deepEqual(await askUploads('xgone', request), { gone: true })
  await assert.rejects(askUploads('xbusy', request), /HTTP 429/)
  assert.deepEqual(asked, ['/user/x1cfbdd/videos', '/user/xgone/videos', '/user/xbusy/videos'])
})

test('a verdict holds for good, but "too few" a month only: the account may have grown', () => {
  const now = Date.now()
  assert.equal(verdictHolds({ verdict: 'clean', at: new Date(now - 400 * 86_400_000) }, now), true)
  assert.equal(verdictHolds({ verdict: 'few', at: new Date(now - 86_400_000) }, now), true)
  assert.equal(verdictHolds({ verdict: 'few', at: new Date(now - FEW_RECHECK_MS - 1) }, now), false)
})

/** Enough of a database for the door and the line: equality, `$in`, `$gt`/`$lt`/`$gte`, `$not` a pattern; every write recorded. */
function memoryDb(collections: Record<string, Document[]>) {
  const writes: Array<{ collection: string; op: string; args: unknown[] }> = []
  const read = (row: Document, path: string) => path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], row)
  const same = (value: unknown, wanted: unknown) => String(value) === String(wanted)
  const matches = (row: Document, filter: Document) => Object.entries(filter).every(([path, condition]) => {
    const value = read(row, path)
    if (condition instanceof Date || condition instanceof ObjectId || typeof condition !== 'object' || condition === null) return same(value, condition)
    const ops = condition as Record<string, unknown>
    if ('$in' in ops && !(ops.$in as unknown[]).some((wanted) => same(value, wanted))) return false
    if ('$gt' in ops && !(value !== undefined && (value as string) > (ops.$gt as string))) return false
    if ('$lt' in ops && !(value !== undefined && (value as string) < (ops.$lt as string))) return false
    if ('$gte' in ops && !(value !== undefined && (value as Date) >= (ops.$gte as Date))) return false
    if ('$not' in ops && (ops.$not as RegExp).test(typeof value === 'string' ? value : '')) return false
    return true
  })
  const rows = (name: string) => (collections[name] ??= [])
  const collection = (name: string) => ({
    find: (filter: Document = {}, options: { limit?: number; sort?: Record<string, number>; projection?: Document } = {}) => ({
      toArray: async () => {
        let found = rows(name).filter((row) => matches(row, filter))
        const sortKey = Object.keys(options.sort ?? {})[0]
        if (sortKey) found = [...found].sort((left, right) => { const a = String(read(left, sortKey)), b = String(read(right, sortKey)); return a < b ? -1 : a > b ? 1 : 0 })
        return options.limit ? found.slice(0, options.limit) : found
      },
    }),
    findOne: async (filter: Document) => rows(name).find((row) => matches(row, filter)) ?? null,
    countDocuments: async (filter: Document) => rows(name).filter((row) => matches(row, filter)).length,
    aggregate: (pipeline: Document[]) => ({
      toArray: async () => {
        // The window's question only: a match, a group by the channel key, a sort by count.
        const match = pipeline[0].$match as Document
        const counts = new Map<unknown, number>()
        for (const row of rows(name).filter((candidate) => matches(candidate, match))) {
          const key = read(row, 'v3.channelKey')
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
        return [...counts].map(([_id, n]) => ({ _id, n })).sort((left, right) => right.n - left.n)
      },
    }),
    updateOne: async (filter: Document, update: { $set?: Document; $setOnInsert?: Document }, options?: { upsert?: boolean }) => {
      writes.push({ collection: name, op: 'updateOne', args: [filter, update] })
      const row = rows(name).find((candidate) => matches(candidate, filter))
      if (row) Object.assign(row, update.$set)
      else if (options?.upsert) rows(name).push({ ...filter, ...update.$setOnInsert, ...update.$set })
      return {}
    },
    bulkWrite: async (operations: Array<{ updateOne: { filter: Document; update: { $set: Document } } }>) => {
      writes.push({ collection: name, op: 'bulkWrite', args: [operations] })
      for (const { updateOne } of operations) {
        const row = rows(name).find((candidate) => matches(candidate, updateOne.filter))
        if (row) Object.assign(row, updateOne.update.$set)
        else rows(name).push({ ...updateOne.filter, ...updateOne.update.$set })
      }
      return {}
    },
    deleteMany: async (filter: Document) => {
      writes.push({ collection: name, op: 'deleteMany', args: [filter] })
      const before = rows(name).length
      collections[name] = rows(name).filter((row) => !matches(row, filter))
      return { deletedCount: before - rows(name).length }
    },
  })
  return { db: { collection } as unknown as Db, writes, collections }
}

test('at the door, a listed account is refused on every line, with the one found by hand; its namesake elsewhere is not', async () => {
  resetBaitAccountsCache()
  const { db } = memoryDb({ [BAIT_ACCOUNTS]: [{ _id: 'dailymotion:xbait1' }] })
  const videos = [
    { videoId: 'dailymotion:x9a', provider: 'dailymotion', title: '安堂ロイド 第6話', channelId: 'xbait1' },
    { videoId: 'dailymotion:x9b', provider: 'dailymotion', title: 'スクール革命　20131110　HeySayJump', channelId: 'x1cfbdd' },
    { videoId: 'dailymotion:x9c', provider: 'dailymotion', title: 'Gloria Gaynor - Reach Out', channelId: 'x17hq0' },
    { videoId: 'pexels:1', provider: 'pexels', title: 'Waves', channelId: 'xbait1' },
  ]
  const result = await screenJunk(db, videos, { dryRun: true })
  assert.deepEqual(result.videos.map((video) => video.videoId), ['dailymotion:x9c', 'pexels:1'])
  assert.equal(result.refused, 2)
})

test('the door reads the list once in a while, and a list that cannot be read still refuses the account found by hand', async () => {
  resetBaitAccountsCache()
  let reads = 0
  const db = { collection: (name: string) => ({ find: () => ({ toArray: async () => { if (name === BAIT_ACCOUNTS) { reads += 1; throw new Error('base occupée') } return [] } }) }) } as unknown as Db
  const videos = [{ videoId: 'dailymotion:x9c', provider: 'dailymotion', title: 'Gloria Gaynor - Reach Out', channelId: 'x17hq0' }, { videoId: 'dailymotion:x9b', provider: 'dailymotion', title: 'vs嵐', channelId: 'x1cfbdd' }]
  for (let pass = 0; pass < 3; pass += 1) {
    const result = await screenJunk(db, videos, { dryRun: true })
    assert.deepEqual(result.videos.map((video) => video.videoId), ['dailymotion:x9c'], 'the account found by hand stays refused')
  }
  assert.equal(reads, 1)
})

/**
 * A night: the two accounts known before to list (x1awub0 with its one video still in the base, as on 24 October), a
 * bait account among the day's, a clean one, one gone, one already asked; one outside the window, one described.
 */
function night(dryRun: boolean) {
  const now = Date.now()
  const recent = new Date(now - 3_600_000)
  const row = (owner: string, description = '', extra: Document = {}) => ({ _id: new ObjectId(), type: 'video', provider: 'dailymotion', videoId: `dailymotion:${owner}${Math.random()}`, createdAt: recent, description, v3: { channelKey: `dailymotion:${owner}` }, ...extra })
  const items = [
    row('xbait'), row('xbait'), row('xbait'),
    row('xclean'), row('xclean', 'a real description'),
    row('xgone'),
    row('xknown'),
    row('xold', '', { createdAt: new Date(now - WINDOW_MS - 3_600_000) }),
    row('xdescribed', 'every video of it has words'),
    row('x1awub0', '', { title: '”グラビアの裏女王”人気中学生グラドル' }),
    { _id: new ObjectId(), type: 'video', provider: 'youtube', createdAt: recent, description: '', v3: { channelKey: 'youtube:UCxxxxxxxxxxxxxxxxxxxxxx' } },
  ]
  const memory = memoryDb({ items, [BAIT_CHECKS]: [{ _id: 'dailymotion:xknown', verdict: 'clean', at: new Date(now - 86_400_000) }] })
  const asked: Array<{ owner: string; at: number }> = []
  let clock = 1_000_000
  const request = (async (input: string | URL) => {
    const owner = new URL(String(input)).pathname.split('/')[2]
    asked.push({ owner, at: clock })
    if (owner === 'xgone') return new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 })
    const list = owner === 'xbait' ? bait(24, 600) : owner === 'x1cfbdd' ? bait(38) : owner === 'x1awub0' ? bait(25, 312) : real(30)
    return new Response(JSON.stringify({ total: list.length, list }))
  }) as typeof fetch
  const ctx = {
    db: memory.db, line: 'dm-bait', deadline: now + 600_000, timeLeft: () => 600_000, dryRun, cursor: null,
    quota: { reserve: async () => false, spent: () => 0 },
    admit: async () => { throw new Error('the bait check admits nothing') }, search: async () => undefined, log: () => undefined,
  } as unknown as LineContext
  const deps = { request, now, clock: () => clock, sleep: async (ms: number) => { clock += ms } }
  return { ...memory, ctx, deps, asked, items }
}

test('a night: the day\'s undescribed accounts asked once each, two a second at most; the bait listed, saved, then deleted', async () => {
  resetBaitAccountsCache()
  const backupDir = await mkdtemp(join(tmpdir(), 'dm-bait-'))
  try {
    const { ctx, deps, asked, collections, writes } = night(false)
    const result = await run(ctx, { ...deps, backupDir })
    // The accounts known before first (listed from what Dailymotion still shows), then the day's: the most undescribed videos first.
    assert.deepEqual(asked.map((entry) => entry.owner), ['x1cfbdd', 'x1awub0', 'xbait', 'xclean', 'xgone'])
    for (let index = 1; index < asked.length; index += 1) assert.ok(asked[index].at - asked[index - 1].at >= SPACING_MS, 'two questions a second at most')
    assert.deepEqual(collections[BAIT_ACCOUNTS].map((row) => row._id).sort(), ['dailymotion:x1awub0', 'dailymotion:x1cfbdd', 'dailymotion:xbait'])
    assert.match(collections[BAIT_ACCOUNTS].find((row) => row._id === 'dailymotion:x1awub0')!.reason, /^trouvé le 24 octobre par la mesure de la règle : 25 vidéos listées, toutes de 312 s/)
    const listed = collections[BAIT_ACCOUNTS].find((row) => row._id === 'dailymotion:xbait')!
    assert.equal(listed.seconds, 600)
    assert.equal(listed.sample.length, 5)
    assert.match(listed.reason, /24 vidéos listées, toutes de 600 s exactement, aucune description/)
    const verdicts = Object.fromEntries(collections[BAIT_CHECKS].map((row) => [row._id, row.verdict]))
    assert.deepEqual(verdicts, { 'dailymotion:xknown': 'clean', 'dailymotion:xbait': 'bait', 'dailymotion:xclean': 'clean', 'dailymotion:xgone': 'gone' })
    // Each account's rows saved, read back, and only then deleted — x1awub0's one video too; nothing else touched.
    const files = (await readdir(join(backupDir, 'dm-bait'))).sort()
    assert.equal(files.length, 2)
    assert.match(files[1], /^xbait-\d{8}T\d{6}Z\.json$/)
    const saved = BSON.EJSON.parse(await readFile(join(backupDir, 'dm-bait', files[1]), 'utf8'), { relaxed: false }) as Document[]
    assert.equal(saved.length, 3)
    assert.ok(saved.every((row) => row._id instanceof ObjectId && row.createdAt instanceof Date), 'every type kept')
    assert.match(files[0], /^x1awub0-/)
    assert.equal(collections.items.filter((row) => ['dailymotion:xbait', 'dailymotion:x1awub0'].includes(row.v3.channelKey)).length, 0)
    assert.equal(collections.items.length, 7)
    assert.equal(writes.filter((write) => write.op === 'deleteMany').length, 2)
    assert.equal(result.counters.scanned, 3)
    assert.equal(result.counters.rejected['compte appât'], 3)
    assert.equal(result.counters.rejected['vidéos retirées'], 4)
    // x1awub0's video set aside before the day's accounts are read: four of them, not five.
    assert.match(String((result.cursor as { note: string }).note), /^4 comptes du jour avec une vidéo sans description, 3 jamais demandés · 3 demandés · 1 appât \(dailymotion:xbait\) · 2 connus d'avance listés · 4 vidéos supprimées sur 4, sauvegardées dans /)
    assert.deepEqual(result.errors, [])
  } finally {
    await rm(backupDir, { recursive: true, force: true })
  }
})

test('a dry run asks and judges, and writes nothing: no verdict, no list, no file, no deletion', async () => {
  resetBaitAccountsCache()
  const backupDir = await mkdtemp(join(tmpdir(), 'dm-bait-'))
  try {
    const { ctx, deps, asked, writes, collections } = night(true)
    const result = await run(ctx, { ...deps, backupDir, base: true })
    // Each account once: the base's walk skips those asked tonight, those known before, and those already judged.
    assert.deepEqual(asked.map((entry) => entry.owner), ['x1cfbdd', 'x1awub0', 'xbait', 'xclean', 'xgone', 'xdescribed', 'xold'])
    assert.deepEqual(writes, [])
    assert.deepEqual(await readdir(backupDir), [])
    assert.equal(collections.items.length, 11)
    assert.match(String((result.cursor as { note: string }).note), /^à blanc : .* 1 appât \(dailymotion:xbait\) .* 4 vidéos à sauvegarder puis supprimer/)
  } finally {
    await rm(backupDir, { recursive: true, force: true })
  }
})

test('the base walked in key order from where the last night stopped, the asked ones skipped, back to the start at its end', async () => {
  resetBaitAccountsCache()
  const backupDir = await mkdtemp(join(tmpdir(), 'dm-bait-'))
  try {
    const { ctx, deps, asked, collections } = night(false)
    collections.dig_meta_v4 = [{ _id: 'dm-bait', after: 'dailymotion:xc', cycle: 0 }]
    // The accounts known before are listed already: the night starts with the day's.
    collections[BAIT_ACCOUNTS] = [{ _id: 'dailymotion:x1cfbdd' }, { _id: 'dailymotion:x1awub0' }]
    await run(ctx, { ...deps, backupDir, base: true, baseAsks: 1 })
    // The day's (xbait, xclean, xgone), then the base past "xc": xdescribed asked, the limit of one reached.
    assert.deepEqual(asked.map((entry) => entry.owner), ['xbait', 'xclean', 'xgone', 'xdescribed'])
    assert.equal(collections.dig_meta_v4[0].after, 'dailymotion:xdescribed')
    await run(ctx, { ...deps, backupDir, base: true })
    // Past xdescribed: xgone asked already, xknown and xold — xknown's verdict holds, xold never asked.
    assert.deepEqual(asked.map((entry) => entry.owner).slice(4), ['xold'])
    assert.equal(collections.dig_meta_v4[0].after, 'dailymotion:', 'the end of the base: the next night starts again')
    assert.equal(collections.dig_meta_v4[0].cycle, 1)
  } finally {
    await rm(backupDir, { recursive: true, force: true })
  }
})

test('Dailymotion saying "enough" (429) ends the night\'s questions; what was judged is kept, the rest waits', async () => {
  resetBaitAccountsCache()
  const backupDir = await mkdtemp(join(tmpdir(), 'dm-bait-'))
  try {
    const { ctx, deps, collections } = night(false)
    collections[BAIT_ACCOUNTS] = [{ _id: 'dailymotion:x1cfbdd' }, { _id: 'dailymotion:x1awub0' }]
    const asked: string[] = []
    const request = (async (input: string | URL) => {
      const owner = new URL(String(input)).pathname.split('/')[2]
      asked.push(owner)
      if (owner === 'xclean') return new Response('', { status: 429 })
      return deps.request(input)
    }) as typeof fetch
    const result = await run(ctx, { ...deps, request, backupDir, base: true })
    assert.deepEqual(asked, ['xbait', 'xclean'], 'no question after the refusal, not even the base\'s')
    assert.deepEqual(collections[BAIT_CHECKS].map((row) => row._id).sort(), ['dailymotion:xbait', 'dailymotion:xknown'])
    assert.match(result.errors.join(' | '), /Dailymotion refuse les questions \(HTTP 429\)/)
    assert.equal(collections.dig_meta_v4, undefined, 'the walk did not start: its place is unchanged')
  } finally {
    await rm(backupDir, { recursive: true, force: true })
  }
})
