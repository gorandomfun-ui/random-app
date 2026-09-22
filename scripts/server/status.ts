/**
 * The ingestion server's health, written to the database every ten minutes
 * by the `random-status` timer: disk, memory, load, the last pass judged in
 * the journal. Read by /admin/ingest-reports. When two passes failed in a row
 * or nothing succeeded for 26 hours, an e-mail goes to the owner — if the
 * mail settings exist — at most once every twelve hours.
 *
 *   node --import tsx scripts/server/status.ts
 */

import { statfs } from 'node:fs/promises'
import os from 'node:os'

import { RUNS, type StoredRun } from '@/lib/v3/ingest/journal'
import { STALE_HOURS } from '@/lib/v3/ingest/report'

export const STATUS_COLLECTION = 'ingest_server_status'
const STATUS_ID = 'random-ingest'
const ALERT_EVERY_MS = 12 * 60 * 60 * 1000

async function main(): Promise<void> {
  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  const now = new Date()
  const disk = await statfs('/opt/random-app').catch(() => statfs('/'))
  const runs = db.collection<StoredRun>(RUNS)
  const recent = await runs.find({}, { sort: { startedAt: -1 }, limit: 12, projection: { line: 1, status: 1, startedAt: 1, finishedAt: 1, counters: 1, errors: 1 }, maxTimeMS: 5000 }).toArray()
  const finished = recent.filter((run) => run.status !== 'running')
  const lastSuccess = finished.find((run) => run.status === 'ok' || run.status === 'partial')
  let failuresInARow = 0
  for (const run of finished) { if (run.status === 'failed') failuresInARow += 1; else break }
  const hoursSinceSuccess = lastSuccess?.finishedAt ? (now.getTime() - lastSuccess.finishedAt.getTime()) / 3_600_000 : null

  const status = {
    host: os.hostname(),
    at: now,
    uptimeHours: Math.round(os.uptime() / 360) / 10,
    load1: Math.round(os.loadavg()[0] * 100) / 100,
    memory: { totalMB: Math.round(os.totalmem() / 1e6), freeMB: Math.round(os.freemem() / 1e6) },
    disk: { totalGB: Math.round((disk.blocks * disk.bsize) / 1e8) / 10, freeGB: Math.round((disk.bavail * disk.bsize) / 1e8) / 10 },
    lastRun: recent[0] ? { line: recent[0].line, status: recent[0].status, startedAt: recent[0].startedAt, finishedAt: recent[0].finishedAt ?? null, inserted: recent[0].counters?.inserted ?? 0, error: recent[0].errors?.[0] ?? null } : null,
    lastSuccessAt: lastSuccess?.finishedAt ?? null,
    hoursSinceSuccess: hoursSinceSuccess === null ? null : Math.round(hoursSinceSuccess * 10) / 10,
    failuresInARow,
  }

  const previous = await db.collection(STATUS_COLLECTION).findOne({ _id: STATUS_ID } as never, { maxTimeMS: 3000 }) as { lastAlertAt?: Date } | null
  const trouble = failuresInARow >= 2 ? `${failuresInARow} passages en échec d'affilée` : hoursSinceSuccess !== null && hoursSinceSuccess > STALE_HOURS ? `aucun passage réussi depuis ${Math.round(hoursSinceSuccess)} h` : recent.length === 0 ? null : null
  const alertDue = trouble && (!previous?.lastAlertAt || now.getTime() - previous.lastAlertAt.getTime() > ALERT_EVERY_MS)
  let alerted = false
  if (alertDue && process.env.REPORT_EMAIL_TO && (process.env.SMTP_URL || process.env.SMTP_HOST)) {
    try {
      const { sendMail } = await import('@/lib/email/mailer')
      const text = `Serveur ${status.host}, ${now.toISOString()}\n${trouble}.\nDernier passage : ${status.lastRun ? `${status.lastRun.line} ${status.lastRun.status}` : 'aucun'}.\nDisque libre ${status.disk.freeGB} Go, mémoire libre ${status.memory.freeMB} Mo.`
      await sendMail({ subject: `RANDOM ingestion : ${trouble}`, text, html: `<pre>${text}</pre>` })
      alerted = true
    } catch (error) {
      console.warn('alerte non envoyée :', error instanceof Error ? error.message : error)
    }
  }

  await db.collection(STATUS_COLLECTION).updateOne(
    { _id: STATUS_ID } as never,
    { $set: { ...status, trouble: trouble ?? null, ...(alerted ? { lastAlertAt: now } : {}) } },
    { upsert: true },
  )
  console.log(JSON.stringify({ serverStatus: 'written', trouble: trouble ?? null, alerted, disk: status.disk, memory: status.memory, lastRun: status.lastRun?.line ?? null }))
  process.exit(0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'status failed')
  process.exit(1)
})
