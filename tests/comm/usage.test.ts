import test from 'node:test'
import assert from 'node:assert/strict'

import { egressAllowed, egressCap, egressFullMessage, monthKey, nextMonthStart, storageAllowed, storageCap, storageFullMessage } from '@/lib/comm/usage'

test('the month is counted by the calendar, UTC, and starts again on the first', () => {
  assert.equal(monthKey(new Date(Date.UTC(2026, 9, 24, 23, 30))), '2026-10')
  assert.equal(monthKey(new Date(Date.UTC(2026, 11, 31, 23, 59))), '2026-12')
  assert.equal(nextMonthStart(new Date(Date.UTC(2026, 9, 24))).toISOString(), '2026-11-01T00:00:00.000Z')
  assert.equal(nextMonthStart(new Date(Date.UTC(2026, 11, 5))).toISOString(), '2027-01-01T00:00:00.000Z')
})

test('the caps sit under Google’s free band: 90 of 100 GB handed out a month, 4.5 of 5 GB stored', () => {
  assert.equal(egressCap(), 90e9)
  assert.equal(storageCap(), 4.5e9)
  assert.ok(egressAllowed(89e9, 1e9))
  assert.ok(!egressAllowed(89e9, 1e9 + 1))
  assert.ok(egressAllowed(0, -5), 'nothing to hand out is always allowed')
  assert.ok(storageAllowed(4e9, 0.5e9))
  assert.ok(!storageAllowed(4e9, 0.5e9 + 1))
  process.env.COMM_EGRESS_CAP_GB = '2'
  assert.equal(egressCap(), 2e9)
  delete process.env.COMM_EGRESS_CAP_GB
})

test('the messages say when it opens again, in French', () => {
  assert.equal(egressFullMessage(new Date(Date.UTC(2026, 9, 24))), 'Plafond du mois atteint (90 Go téléchargés) : les clips se rouvrent le 1er novembre.')
  assert.equal(storageFullMessage(), 'Stockage plein (4,5 Go) : supprime des éléments de la file pour faire de la place.')
})
