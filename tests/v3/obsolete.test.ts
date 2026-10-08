import assert from 'node:assert/strict'
import test from 'node:test'

import { ObjectId } from 'mongodb'

import type { LineContext } from '../../lib/v3/ingest/context'
import { run } from '../../lib/v3/ingest/lines/obsolete'
import { checkDailymotionVideos, checkYouTubeVideos, isExplicitDailymotionUnavailableMessage } from '../../lib/v3/obsolete/check'
import { after, dueFilter, lanes, RECENT_DAILYMOTION_EVERY_DAYS } from '../../lib/v3/obsolete/due'

const video = (provider: string, videoId: string) => ({ _id: new ObjectId(), provider, videoId, url: '' })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

test("only Dailymotion's own words condemn a video: deleted, removed, private; never a password or a country", () => {
  assert.ok(isExplicitDailymotionUnavailableMessage('Deze video is verwijderd vanwege inbreuk op de Gebruiksvoorwaarden.'))
  assert.ok(isExplicitDailymotionUnavailableMessage('Deze video is niet meer beschikbaar omdat hij is verwijderd.'))
  assert.ok(isExplicitDailymotionUnavailableMessage('This video has been removed due to a copyright claim'))
  assert.ok(!isExplicitDailymotionUnavailableMessage('This user does not have access to the video. He must provide a password.'))
  assert.ok(!isExplicitDailymotionUnavailableMessage('This video is not available in your country'))
  assert.ok(!isExplicitDailymotionUnavailableMessage(''))
})

test('Dailymotion a hundred per call: the list keeps the living, the player is asked only about the missing, and alone condemns', async () => {
  const alive = video('dailymotion', 'dailymotion:xalive')
  const dead = video('dailymotion', 'dailymotion:xdead')
  const locked = video('dailymotion', 'dailymotion:xlocked')
  const calls: string[] = []
  const request = (async (input: string | URL) => {
    const url = new URL(String(input))
    calls.push(url.hostname + url.pathname)
    if (url.pathname === '/videos') {
      assert.equal(url.searchParams.get('ids'), 'xalive,xdead,xlocked')
      assert.equal(url.searchParams.get('fields'), 'id', 'never the field Dailymotion stopped knowing')
      return json({ list: [{ id: 'xalive' }] })
    }
    if (url.pathname.endsWith('/xdead')) return json({ error: { message: 'Deze video is verwijderd vanwege inbreuk op de Gebruiksvoorwaarden.' } })
    if (url.pathname.endsWith('/xlocked')) return json({ error: { message: 'This user does not have access to the video. He must provide a password.' } })
    throw new Error(`unexpected ${url}`)
  }) as typeof fetch
  const outcomes = await checkDailymotionVideos([alive, dead, locked], { request })
  assert.equal(outcomes.get(alive._id.toHexString())?.obsolete, false)
  assert.equal(outcomes.get(dead._id.toHexString())?.obsolete, true)
  assert.match(String(outcomes.get(dead._id.toHexString())?.reason), /dailymotion-metadata-deze-video-is-verwijderd/)
  assert.equal(outcomes.get(locked._id.toHexString())?.kind, 'ambiguous', 'a password is not a death')
  assert.equal(calls.filter((call) => call === 'api.dailymotion.com/videos').length, 1, 'one list call for three')
  assert.equal(calls.filter((call) => call.startsWith('www.dailymotion.com/player')).length, 2, 'the player only for the two missing')
  assert.ok(!calls.some((call) => call.startsWith('api.dailymotion.com/video/')), 'no single-video API question any more')
})

test('a Dailymotion list call that fails sends its videos to the player, one by one, as before', async () => {
  const one = video('dailymotion', 'x1')
  const request = (async (input: string | URL) => {
    const url = new URL(String(input))
    if (url.pathname === '/videos') return json({ error: 'busy' }, 503)
    return json({ qualities: {} })
  }) as typeof fetch
  const outcomes = await checkDailymotionVideos([one], { request })
  assert.equal(outcomes.get(one._id.toHexString())?.obsolete, false)
  assert.equal(outcomes.get(one._id.toHexString())?.kind, undefined)
})

test('YouTube fifty per unit, each unit booked first; not returned, private or unembeddable is gone; a refusal condemns nothing', async () => {
  const docs = [video('youtube', 'yt-alive'), video('youtube', 'yt-gone'), video('youtube', 'yt-private')]
  const request = (async () => json({ items: [{ id: 'yt-alive', status: { privacyStatus: 'public', uploadStatus: 'processed', embeddable: true } }, { id: 'yt-private', status: { privacyStatus: 'private' } }] })) as typeof fetch
  const booked: number[] = []
  const result = await checkYouTubeVideos(docs, { key: 'k', request, reserve: async (units) => { booked.push(units); return true } })
  assert.deepEqual(booked, [1])
  assert.equal(result.outcomes.get(docs[0]._id.toHexString())?.obsolete, false)
  assert.equal(result.outcomes.get(docs[1]._id.toHexString())?.reason, 'youtube-api-not-returned')
  assert.equal(result.outcomes.get(docs[2]._id.toHexString())?.reason, 'youtube-privacy-private')
  const refused = await checkYouTubeVideos(docs, { key: 'k', request: (async () => json({ error: { code: 403 } }, 403)) as typeof fetch })
  assert.ok([...refused.outcomes.values()].every((outcome) => !outcome.obsolete && outcome.kind === 'ambiguous'))
  const noUnits = await checkYouTubeVideos(docs, { key: 'k', request, reserve: async () => false })
  assert.equal(noUnits.stopped, true)
  assert.equal(noUnits.outcomes.size, 0, 'no units: the videos wait for another night')
})

test("the night's lanes: the reported and the doubtful first, the never-checked, recent Dailymotion every two days, the rest less often", () => {
  const now = Date.parse('2026-10-09T03:50:00Z')
  const all = lanes(now)
  assert.deepEqual(all.map((lane) => lane.name), ['suspect', 'doubtful', 'never', 'recent-dailymotion', 'recent-youtube', 'old'])
  const recent = all.find((lane) => lane.name === 'recent-dailymotion')!
  assert.equal(recent.filter.provider, 'dailymotion')
  assert.equal((recent.filter.obsoleteVideoCheckedAt as { $lt: Date }).$lt.getTime(), now - RECENT_DAILYMOTION_EVERY_DAYS * 86_400_000)
  assert.deepEqual(recent.filter.obsoleteVideoStatus, { $ne: 'obsolete' }, 'a dead video waits for the deletion, it is not read again')
  const due = dueFilter(now)
  assert.equal(due.type, 'video')
  assert.equal((due.$or as unknown[]).length, all.length)
  assert.ok((due.$or as Array<Record<string, unknown>>).every((clause) => !('type' in clause)))
  const resume = after(recent, { _id: new ObjectId(), obsoleteVideoCheckedAt: new Date(now - 5 * 86_400_000) })
  assert.ok(Array.isArray(resume.$and) && (resume.$and as unknown[]).length === 2, 'a page resumes past the last (date, id) read')
})

test('a night: the never-checked judged in one pass, the living written in one update, the dead with their reason, YouTube kept for later when the units run out', async () => {
  const alive = video('dailymotion', 'dailymotion:xalive')
  const dead = video('dailymotion', 'dailymotion:xdead')
  const tube = video('youtube', 'yt1')
  const reads: Array<Record<string, unknown>> = []
  const updates: Array<{ filter: Record<string, unknown>; update: Record<string, Record<string, unknown>> }> = []
  const bulk: unknown[] = []
  const items = {
    find: (filter: Record<string, unknown>) => ({
      toArray: async () => {
        reads.push(filter)
        // The never-checked lane's first page holds the three; every resumed page and every other lane is empty.
        return filter.obsoleteVideoCheckedAt === null && !('$and' in filter) ? [alive, dead, tube] : []
      },
    }),
    updateMany: async (filter: Record<string, unknown>, update: Record<string, Record<string, unknown>>) => { updates.push({ filter, update }); return {} },
    bulkWrite: async (operations: unknown[]) => { bulk.push(...operations); return {} },
  }
  const request = (async (input: string | URL) => {
    const url = new URL(String(input))
    if (url.pathname === '/videos') return json({ list: [{ id: 'xalive' }] })
    if (url.pathname.endsWith('/xdead')) return json({ error: { message: 'Deze video is niet meer beschikbaar omdat hij is verwijderd.' } })
    throw new Error(`unexpected ${url}`)
  }) as typeof fetch
  const ctx = {
    db: { collection: () => items } as unknown as LineContext['db'],
    line: 'obsolete', deadline: Date.now() + 600_000, timeLeft: () => 600_000, dryRun: false, cursor: null,
    quota: { reserve: async () => false } as unknown as LineContext['quota'],
    admit: async () => { throw new Error('the check admits nothing') },
    search: async () => undefined, log: () => undefined, http: request,
  } as unknown as LineContext
  const result = await run(ctx, { youtubeKey: 'k', now: Date.parse('2026-10-09T03:50:00Z') })
  assert.equal(updates.length, 1)
  assert.deepEqual((updates[0].filter._id as { $in: ObjectId[] }).$in.map(String), [String(alive._id)])
  assert.equal(updates[0].update.$set.obsoleteVideoStatus, 'ok')
  assert.equal(updates[0].update.$set.obsoleteVideoScanId, 'nightly-2026-10-09')
  const deadWrite = bulk[0] as { updateOne: { filter: { _id: ObjectId }; update: { $set: Record<string, unknown> } } }
  assert.equal(String(deadWrite.updateOne.filter._id), String(dead._id))
  assert.equal(deadWrite.updateOne.update.$set.obsoleteVideoStatus, 'obsolete')
  assert.equal(bulk.length, 1, 'the YouTube video, without units, is written nowhere: it stays due')
  assert.equal(result.counters.scanned, 2)
  assert.equal(result.counters.rejected['morte (dailymotion)'], 1)
  assert.match(String((result.cursor as { note: string }).note), /1 YouTube remises à demain/)
  assert.ok(reads.length >= 6, 'every lane was read')
})
