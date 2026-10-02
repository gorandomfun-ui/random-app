import assert from 'node:assert/strict'
import test from 'node:test'

import type { Db, Document } from 'mongodb'

import { CHANNELS_PER_RUN, queueMetChannels, SMALL_CHANNEL } from '../../lib/v3/dig/channels'
import { DEFAULT_TICKETS, ticketOrder } from '../../lib/v3/dig/queue'

test('the snowball has its tickets, in turn with the bases', () => {
  assert.equal(DEFAULT_TICKETS.filter((base) => base === 'snowball').length, 2)
  const order = ticketOrder(DEFAULT_TICKETS)
  assert.equal(order[4], 'snowball')
})

test('the small channels of the day\'s finds are queued as channel subjects; the big ones and the known ones are not', async () => {
  const met = [
    { _id: 'UCsmall000000000000000001', title: 'A person', n: 3 },
    { _id: 'UChouse000000000000000002', title: 'A house', n: 5 },
    { _id: 'UCknown000000000000000003', title: 'Already queued', n: 2 },
    { _id: 'notachannelid', title: 'Odd', n: 1 },
  ]
  const queued: Document[] = []
  const db = {
    collection: (name: string) => name === 'items'
      ? { aggregate: () => ({ toArray: async () => met }) }
      : { find: () => ({ toArray: async () => [{ _id: 'channel:youtube:UCknown000000000000000003' }] }), bulkWrite: async (ops: Document[]) => { queued.push(...ops); return { upsertedCount: ops.length, modifiedCount: 0 } } },
  } as unknown as Db
  const request: typeof fetch = async () => new Response(JSON.stringify({ items: [{ id: 'UCsmall000000000000000001', statistics: { videoCount: '120' } }, { id: 'UChouse000000000000000002', statistics: { videoCount: String(SMALL_CHANNEL + 1) } }] }))
  const logs: string[] = []
  assert.equal(await queueMetChannels(db, 'key', request, (text) => logs.push(text)), 1)
  assert.equal(queued.length, 1)
  assert.equal(queued[0].updateOne.filter._id, 'channel:youtube:UCsmall000000000000000001')
  assert.match(logs[0] ?? '', /A person/)
  assert.ok(CHANNELS_PER_RUN >= 10)
  assert.equal(await queueMetChannels(db, '', request), 0)
})
