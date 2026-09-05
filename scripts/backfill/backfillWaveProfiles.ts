import fs from 'fs'
import path from 'path'

function ensureEnvLoaded() {
  if (process.env.MONGO_URI || process.env.MONGODB_URI) return
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  const content = fs.readFileSync(envPath, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const [key, ...rest] = trimmed.split('=')
    const value = rest.join('=').trim()
    if (key && value && !process.env[key]) process.env[key] = value
  }
}

ensureEnvLoaded()

import { getDb } from '../../lib/db'
import { backfillWaveProfiles, ensureWaveProfileIndexes } from '../../lib/random/waveBackfill'

function parseLimit() {
  const argument = process.argv.find((value) => value.startsWith('--limit='))
  if (!argument) return 50000
  const value = Number(argument.slice('--limit='.length))
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 50000
}

async function main() {
  const db = await getDb()
  const collection = db.collection('items')
  await ensureWaveProfileIndexes(collection)
  const limit = parseLimit()
  let scanned = 0
  let updated = 0
  let skipped = 0
  let remaining = 1
  while (remaining && scanned < limit) {
    const result = await backfillWaveProfiles(collection, {
      limit: Math.min(5000, limit - scanned),
      batchSize: 150,
    })
    scanned += result.scanned
    updated += result.updated
    skipped += result.skipped
    remaining = result.remaining
    if (!result.scanned) break
  }
  console.log(`[wave-profile-backfill] scanned=${scanned} updated=${updated} skipped=${skipped} remaining=${remaining}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[wave-profile-backfill] failed', error)
    process.exit(1)
  })
