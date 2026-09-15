// A child process gives the GitHub trends phase a real process deadline, including Mongo cleanup.
import { runTrendingBatches } from '../lib/ingest/trendingDirect.ts'
import { ingestTrendingVideos, pickTrendingRegions } from '../lib/ingest/videos.ts'
import connection from '../lib/db.ts'
import fs from 'node:fs'
const output = process.argv[2]
const deadline = setTimeout(() => process.exit(1), 170000)
let result
const regions = pickTrendingRegions()
const save = (result, ok = false) => {
  fs.writeFileSync(`${output}.tmp`, JSON.stringify({ phase: 'trending', ok, regions,
    providers: ['youtube', 'dailymotion'], result }))
  fs.renameSync(`${output}.tmp`, output)
}
try {
  result = await runTrendingBatches(regions, ({ provider, region }) =>
    ingestTrendingVideos([region], { providers: [provider], limitPerProvider: 50,
      skipDetails: true, insertOnly: true, conservativeRoutineInitialization: true }),
    (batch, snapshot) => { save(snapshot); console.log(JSON.stringify({ trends: batch })) })
  save(result, result.batches.every(x => x.status === 'completed'))
} finally {
  try { await (await connection).close() } finally { clearTimeout(deadline) }
}
