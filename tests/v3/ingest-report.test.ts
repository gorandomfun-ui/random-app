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

test('une ligne qui mesure (pool des likes) : la taille du dernier passage, la croissance sommée, hors du total du jour', async () => {
  const { summariseDays } = await import('@/lib/v3/ingest/report')
  const at = (hour: number) => new Date(Date.UTC(2026, 8, 23, hour))
  const run = (line: string, hour: number, scanned: number, inserted: number, note?: string) =>
    ({ line, startedAt: at(hour), finishedAt: at(hour), status: 'ok' as const, counters: { scanned, inserted, duplicates: 0, rejected: {} }, ...(note ? { note } : {}) })
  const days = summariseDays([
    run('combo', 7, 500, 120),
    run('like-pool', 8, 36_779, 0, 'premier comptage'),
    run('like-pool', 9, 40_779, 4_000, '+4 000'),
  ], [], at(10).getTime())
  const pool = days[0].lines.find((line) => line.line === 'like-pool')
  assert.equal(pool?.scanned, 40_779, 'la taille du dernier passage, pas la somme')
  assert.equal(pool?.inserted, 4_000, 'la croissance du jour')
  assert.equal(pool?.note, '+4 000', 'la note du dernier passage')
  assert.equal(days[0].total, 120, 'le pool ne compte pas dans le total inséré du jour')
})

test('la part par fournisseur : des passages quand ils la comptent, sinon des recherches de la ligne', async () => {
  const { summariseDays } = await import('@/lib/v3/ingest/report')
  const at = (hour: number) => new Date(Date.UTC(2026, 8, 23, hour))
  const days = summariseDays([
    { line: 'combo', startedAt: at(7), finishedAt: at(7), status: 'ok', counters: { scanned: 500, inserted: 120, duplicates: 0, rejected: {}, byProvider: { youtube: 100, dailymotion: 20 } } },
    { line: 'combo', startedAt: at(9), finishedAt: at(9), status: 'ok', counters: { scanned: 500, inserted: 30, duplicates: 0, rejected: {}, byProvider: { dailymotion: 30 } } },
    { line: 'like-dig', startedAt: at(8), finishedAt: at(8), status: 'ok', counters: { scanned: 40, inserted: 25, duplicates: 0, rejected: {} } },
  ], [
    { line: 'like-dig', query: 'santana', at: at(8), provider: 'youtube', inserted: 5 },
    { line: 'like-dig', query: 'playlist UU1', at: at(8), provider: 'dailymotion', inserted: 20 },
    { line: 'like-dig', query: 'rien', at: at(8), provider: 'youtube', inserted: 0 },
    // A search of a line whose runs count by provider is not added on top.
    { line: 'combo', query: 'x', at: at(7), provider: 'youtube', inserted: 99 },
  ], at(10).getTime())
  const combo = days[0].lines.find((line) => line.line === 'combo')
  const likeDig = days[0].lines.find((line) => line.line === 'like-dig')
  assert.deepEqual(combo?.providers, { youtube: 100, dailymotion: 50 }, 'sommé sur les passages, les recherches ignorées')
  assert.equal(combo?.providersFrom, 'runs')
  assert.deepEqual(likeDig?.providers, { youtube: 5, dailymotion: 20 }, 'compté depuis les recherches')
  assert.equal(likeDig?.providersFrom, 'searches')
})
