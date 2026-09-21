import test from 'node:test'
import assert from 'node:assert/strict'

import { assessHealth, shownStatus, summariseDays, type JournalRun } from '@/lib/v3/ingest/report'
import { INTERRUPTED_AFTER_MS } from '@/lib/v3/ingest/journal'

const NOW = Date.UTC(2026, 8, 22, 9, 0, 0)
const hoursAgo = (hours: number) => new Date(NOW - hours * 3_600_000)

function run(line: string, hours: number, inserted: number, extra: Partial<JournalRun> = {}): JournalRun {
  return { line, startedAt: hoursAgo(hours), finishedAt: hoursAgo(hours - 0.1), status: inserted ? 'ok' : 'skipped', counters: { scanned: 100, inserted, duplicates: 0, rejected: {} }, ...extra }
}

test('une ligne qui tourne sans rien insérer depuis un jour est muette ; une ligne qui ne tourne plus est arrêtée', () => {
  const health = assessHealth([
    run('trend', 3, 0), run('trend', 15, 0), run('trend', 30, 40),
    run('retro-trend', 40, 12),
    run('combo', 2, 25),
    run('web', 5, 0, { status: 'running', finishedAt: undefined }),
  ], NOW)
  const byLine = Object.fromEntries(health.map((row) => [row.line, row]))
  assert.equal(byLine.trend.state, 'muette', 'elle a tourné il y a 3 h mais sa dernière insertion date de 30 h')
  assert.equal(byLine['retro-trend'].state, 'arrêtée', 'plus rien depuis 40 h')
  assert.equal(byLine.combo.state, 'active')
  assert.equal(byLine.web.state, 'muette', 'un passage laissé « en cours » depuis 5 h a été tué')
  assert.deepEqual(health.map((row) => row.state).slice(0, 2), ['arrêtée', 'muette'], 'le pire d_abord')
})

test('un passage encore ouvert est « en cours » un quart d_heure, puis « interrompu »', () => {
  assert.equal(shownStatus({ status: 'running', startedAt: new Date(NOW - 60_000) }, NOW), 'en cours')
  assert.equal(shownStatus({ status: 'running', startedAt: new Date(NOW - INTERRUPTED_AFTER_MS - 1) }, NOW), 'interrompu')
  assert.equal(shownStatus({ status: 'partial', startedAt: new Date(NOW) }, NOW), 'partial')
})

test('les jours ne se mélangent pas, les statuts se comptent, les répétitions ne comptent pas', () => {
  const days = summariseDays([
    run('trend', 2, 40), run('trend', 5, 0),
    run('trend', 26, 10, { status: 'partial' }),
    run('combo', 3, 0, { dryRun: true }),
    run('web', 4, 0, { status: 'running', finishedAt: undefined }),
  ], [
    { line: 'trend', query: 'pays FR', at: hoursAgo(2) }, { line: 'trend', query: 'pays FR', at: hoursAgo(5) },
  ], NOW)
  assert.equal(days.length, 2)
  const today = days[0]
  const trend = today.lines.find((line) => line.line === 'trend')!
  assert.equal(trend.runs, 2)
  assert.equal(trend.inserted, 40)
  assert.deepEqual(trend.statuses, { ok: 1, skipped: 1 })
  assert.deepEqual(trend.searches, ['pays FR'])
  assert.equal(today.lines.some((line) => line.line === 'combo'), false, 'une répétition ne compte pas')
  assert.deepEqual(today.lines.find((line) => line.line === 'web')!.statuses, { interrompu: 1 })
  assert.equal(days[1].lines[0].statuses.partial, 1)
})
