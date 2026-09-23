/**
 * The like pool, counted: one zone per liked author and per subject a like
 * names, with how many contents each holds. Run every hour on the ingestion
 * server and after each ingestion pass; the journal line `like-pool` keeps
 * the pool's size and how much it grew since the previous pass.
 *
 *   node --import tsx scripts/v3/like-pool.ts
 *   node --import tsx scripts/v3/like-pool.ts --dry
 */

import { loadLikeZones } from '@/lib/v3/cool/likes'
import { countZones, readPoolZones, readSummary, summarise, writeLikePool, zonesOfLikes, ZONE_CAP } from '@/lib/v3/cool/likePool'
import { closeRun, journalHost, openRun } from '@/lib/v3/ingest/journal'

const fr = (value: number) => value.toLocaleString('fr-FR')

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry')
  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  const startedAt = new Date()
  const runId = dryRun ? null : await openRun(db, { line: 'like-pool', startedAt, host: journalHost() })
  try {
    const likes = await loadLikeZones(db, startedAt.getTime())
    const previous = new Map((await readPoolZones(db).catch(() => [])).map((zone) => [zone.id, zone]))
    const { zones, uncounted } = await countZones(db, zonesOfLikes(likes), likes.map((like) => like.id), previous)
    const summary = summarise(zones, likes.length, new Date())
    const before = await readSummary(db)
    // A first count has nothing to compare with: its growth is nothing, not the whole pool (which read as an ingestion of thirty thousand).
    const growth = before ? Math.max(0, summary.connected - before.connected) : 0
    const note = `${fr(summary.connected)} contenus reliés aux likes, ${fr(summary.effective)} vus par le tirage (plafond ${ZONE_CAP} par zone), ${summary.zones} zones pour ${summary.likes} likes` +
      (before ? ` ; ${growth ? '+' + fr(growth) : 'rien de plus'} depuis le passage précédent` : ' ; premier comptage') +
      (uncounted.length ? ` ; ${uncounted.length} zone${uncounted.length > 1 ? 's' : ''} trop grande${uncounted.length > 1 ? 's' : ''} pour être comptée${uncounted.length > 1 ? 's' : ''} (${uncounted.join(', ')})` : '')
    if (!dryRun) {
      await writeLikePool(db, zones, summary)
      await closeRun(db, runId!, { finishedAt: new Date(), status: 'ok', counters: { scanned: summary.connected, inserted: growth, duplicates: 0, rejected: {} }, note })
    }
    const biggest = [...zones].sort((left, right) => right.video + right.image - left.video - left.image).slice(0, 5).map((zone) => `${zone.id} ${fr(zone.video + zone.image)}`)
    console.log(JSON.stringify({ likePool: dryRun ? 'dry' : 'ok', ...summary, growth, uncounted, biggest, note, durationMs: Date.now() - startedAt.getTime() }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'like-pool failed'
    if (runId) await closeRun(db, runId, { finishedAt: new Date(), status: 'failed', counters: { scanned: 0, inserted: 0, duplicates: 0, rejected: {} }, errors: [message] }).catch(() => undefined)
    throw error
  }
  process.exit(0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'like-pool failed')
  process.exit(1)
})
