import { runDiscoveryBatch } from '../../lib/discovery/worker'

async function main() {
  if (process.env.RANDOM_DISCOVERY_WORKER_ENABLED !== '1') throw new Error('Worker disabled')
  const { getDb, default: clientPromise } = await import('../../lib/db')
  try { console.log(JSON.stringify(await runDiscoveryBatch(await getDb()))) }
  finally { await (await clientPromise).close() }
}
main().catch(() => { console.error('Exploration stopped; check configuration and provider availability.'); process.exitCode = 1 })
