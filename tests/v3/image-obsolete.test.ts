import assert from 'node:assert/strict'
import test from 'node:test'

import { ObjectId } from 'mongodb'

import type { LineContext } from '../../lib/v3/ingest/context'
import { run, WALK } from '../../lib/v3/ingest/lines/image-obsolete'
import { classifyProbe, imageOutcomeUpdate, probeImage } from '../../lib/v3/obsolete/images'

test('a picture is dead only when its source says so: 404, 410, another 4xx, or a page that is not a picture', () => {
  assert.equal(classifyProbe(404, 'image/gif').obsolete, true, 'a removed Giphy GIF answers 404 at its address')
  assert.equal(classifyProbe(200, 'image/gif').obsolete, false)
  assert.equal(classifyProbe(200, 'text/html').obsolete, true)
  for (const doubt of [429, 403, 401, 503, null]) assert.equal(classifyProbe(doubt, null).obsolete, false, String(doubt))
  assert.equal(classifyProbe(429, null).kind, 'rate-limited')
  const living = imageOutcomeUpdate({ obsolete: false, status: 200 }, new Date())
  assert.equal((living.$set as Record<string, unknown>).obsoleteImageStatus, 'ok')
  assert.ok('obsoleteImageSuspect' in (living.$unset as Record<string, unknown>), 'a living picture forgets it was reported')
})

test('a host that refuses a HEAD is asked for the first two kilobytes', async () => {
  const methods: string[] = []
  const request = (async (_url: string | URL, init?: RequestInit) => { methods.push(String(init?.method)); return new Response(null, { status: init?.method === 'HEAD' ? 405 : 206, headers: { 'content-type': 'image/jpeg' } }) }) as typeof fetch
  assert.equal((await probeImage('https://images.example.com/a.jpg', { request })).obsolete, false)
  assert.deepEqual(methods, ['HEAD', 'GET'])
})

test('a night: the reported first, then the stock from where the last night stopped; the dead marked, the walk kept', async () => {
  const reported = { _id: new ObjectId(), url: 'https://media.tenor.com/dead.gif', provider: 'tenor', obsoleteImageSuspect: true }
  const stock = Array.from({ length: 3 }, (_, index) => ({ _id: new ObjectId(), url: `https://media.giphy.com/media/g${index}/giphy.gif`, provider: 'giphy' }))
  const reads: Array<Record<string, unknown>> = []
  const writes: unknown[] = []
  const checkedIds = new Set<string>()
  let walked: unknown = null
  const collection = (name: string) => ({
    find: (filter: Record<string, unknown>) => ({
      toArray: async () => {
        reads.push(filter)
        if (filter.obsoleteImageSuspect === true) return [reported]
        if (name !== 'items') return []
        // The stock by id, past the walk's last id, without what this night already checked (its date is now: not due).
        const after = (filter._id as { $gt?: ObjectId } | undefined)?.$gt
        return stock.filter((row) => (!after || String(row._id) > String(after)) && !checkedIds.has(String(row._id)))
      },
    }),
    findOne: async () => null,
    bulkWrite: async (operations: Array<{ updateOne: { filter: { _id: ObjectId } } }>) => { writes.push(...operations); for (const operation of operations) checkedIds.add(String(operation.updateOne.filter._id)); return {} },
    updateOne: async (_filter: unknown, update: { $set: Record<string, unknown> }) => { if (name === WALK) walked = update.$set.lastId; return {} },
    createIndex: async () => 'x',
  })
  const ctx = {
    db: { collection } as unknown as LineContext['db'],
    line: 'image-obsolete', deadline: Date.now() + 600_000, timeLeft: () => 600_000, dryRun: false, cursor: null,
    quota: { reserve: async () => false } as unknown as LineContext['quota'],
    admit: async () => { throw new Error('the check admits nothing') }, search: async () => undefined, log: () => undefined,
  } as unknown as LineContext
  const request = (async (input: string | URL) => new Response(null, { status: String(input).includes('dead') || String(input).includes('g1') ? 404 : 200, headers: { 'content-type': 'image/gif' } })) as typeof fetch
  const result = await run(ctx, { request })
  assert.equal(result.counters.scanned, 4)
  assert.equal(result.counters.rejected['morte (tenor)'], 1)
  assert.equal(result.counters.rejected['morte (giphy)'], 1)
  const statuses = (writes as Array<{ updateOne: { update: { $set: { obsoleteImageStatus: string } } } }>).map((write) => write.updateOne.update.$set.obsoleteImageStatus)
  assert.deepEqual(statuses.sort(), ['obsolete', 'obsolete', 'ok', 'ok'])
  assert.equal(String(walked), String(stock[2]._id), 'the walk goes on from the last picture read')
  assert.ok(reads.some((filter) => filter.obsoleteImageSuspect === true), 'the reported ones were read first')
  assert.match(String((result.cursor as { note: string }).note), /4 images vérifiées · 2 mortes/)
})
