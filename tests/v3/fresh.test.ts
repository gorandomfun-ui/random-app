import assert from 'node:assert/strict'
import test from 'node:test'

import { FRESH_PLAN, FRESH_SPACING, FRESH_UNIVERSE_MAX, interleave, pickBucket, type FreshBucket, type FreshEntry } from '../../lib/v3/fresh/plan'

const entry = (videoId: string, bucket: FreshBucket, region: string, rank: number, views = 0, channel?: string): FreshEntry =>
  ({ id: videoId.padStart(24, '0'), videoId, bucket, region, rank, views, channel })

test('the day asks for a thousand videos, two hundred of them the world\'s', () => {
  assert.equal(FRESH_PLAN.reduce((sum, plan) => sum + plan.quota, 0), 1000)
  assert.equal(FRESH_PLAN.find((plan) => plan.bucket === 'world')?.quota, 200)
  assert.equal(FRESH_PLAN.find((plan) => plan.bucket === 'music')?.category, '10')
})

test('a zone by rank lets every country bring its own; the world takes the biggest', () => {
  const europe = FRESH_PLAN.find((plan) => plan.bucket === 'europe')!
  const picked = pickBucket([entry('fr1', 'europe', 'FR', 1), entry('fr0', 'europe', 'FR', 0), entry('de0', 'europe', 'DE', 0), entry('de1', 'europe', 'DE', 1)], { ...europe, quota: 3 }, new Set())
  assert.deepEqual(picked.map((pick) => pick.videoId), ['fr0', 'de0', 'fr1'])
  const world = FRESH_PLAN.find((plan) => plan.bucket === 'world')!
  const taken = new Set<string>(['big'])
  const top = pickBucket([entry('small', 'world', 'US', 0, 10), entry('big', 'world', 'IN', 1, 1_000_000), entry('mid', 'world', 'BR', 2, 5000)], world, taken)
  assert.deepEqual(top.map((pick) => pick.videoId), ['mid', 'small'], 'the biggest first, and nothing taken twice')
})

test('the day\'s order: zones take turns by quota, never the same channel within ten', () => {
  const buckets = new Map<FreshBucket, FreshEntry[]>()
  for (const plan of FRESH_PLAN) {
    buckets.set(plan.bucket, Array.from({ length: plan.quota / 10 }, (_, index) => entry(`${plan.bucket}-${index}`, plan.bucket, 'XX', index, 0, index === 0 ? 'same-channel' : `${plan.bucket}-c${index}`)))
  }
  const order = interleave(buckets)
  assert.equal(order.length, 100)
  for (let index = 0; index < order.length; index += 1) {
    const window = order.slice(Math.max(0, index - FRESH_SPACING + 1), index + 1).filter((pick) => pick.channel === 'same-channel')
    assert.ok(window.length <= 1, `channel repeated at ${index}`)
  }
  const firstFifty = order.slice(0, 50)
  const world = firstFifty.filter((pick) => pick.bucket === 'world').length
  const usa = firstFifty.filter((pick) => pick.bucket === 'usa').length
  assert.ok(world >= usa * 1.5, `world ${world}, usa ${usa}`)
  assert.equal(new Set(order.slice(0, 9).map((pick) => pick.bucket)).size, 9, 'the first nine come from nine zones')
})

test('no more than four of one universe within ten: the charts are mostly music, the list should not be', () => {
  const buckets = new Map<FreshBucket, FreshEntry[]>()
  for (const plan of FRESH_PLAN) {
    buckets.set(plan.bucket, Array.from({ length: plan.quota / 10 }, (_, index) => ({ ...entry(`${plan.bucket}-${index}`, plan.bucket, 'XX', index, 0, `${plan.bucket}-c${index}`), universe: index % 3 === 2 ? 'sport' : index % 3 === 1 ? 'gaming' : 'music' })))
  }
  const order = interleave(buckets)
  for (let index = 0; index + 10 <= 60; index += 1) {
    const music = order.slice(index, index + 10).filter((pick) => pick.universe === 'music').length
    assert.ok(music <= FRESH_UNIVERSE_MAX, `${music} music in ten at ${index}`)
  }
})
