/** Read-only check of the six audited anchors. Never calls ingestion, migration or feedback. */
import type { Candidate } from '../../lib/discovery/types'
import type { Relation } from '../../lib/discovery/waves'
import { SIGNAL_VERSION } from '../../lib/discovery/profile'

async function main() {
const input = process.argv[process.argv.indexOf('--url') + 1]
if (!process.argv.includes('--url') || !input) {
  console.error('Usage: node --import tsx scripts/discovery/check-wave-quality.ts --url http://localhost:3000')
  process.exit(2)
}
const base = new URL(input)
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
  throw new Error('Use an HTTP(S) origin without credentials, query or fragment')
}
const ids = ['6957e45b2ebce76c01f7afaa', '691a4902e701c06afd023c1b', '6a996408baa89d5f881c5b9a',
  '693fdb932ebce76c01f62ca6', '6a98a8cc7c3336743ebd6fba', '68d93ddd583050b3a2a15e07']
type Payload = { title?: string; text?: string }
type Reply = { ready?: boolean; anchor?: Candidate<Payload>; trio?: Candidate<Payload>[]; relations?: Record<string, Relation> }
let errors = 0, ready = 0, empty = 0
for (const anchorId of ids) {
  const started = Date.now()
  try {
    const response = await fetch(new URL('/api/discovery/wave', base.origin), { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ anchorId, lang: 'fr', types: ['video', 'image', 'quote', 'joke', 'fact', 'web'] }) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = await response.json() as Reply
    if (!body.ready) { empty++; console.log(JSON.stringify({ anchorId, ready: false, ms: Date.now() - started })); continue }
    const trio = body.trio ?? []
    const verified = body.anchor?.profile.signalVersion === SIGNAL_VERSION && trio.length === 3 &&
      trio.every(item => item.profile.signalVersion === SIGNAL_VERSION) && trio.filter(x => x.type === 'image').length <= 2 &&
      (body.anchor?.type !== 'video' || trio.some(x => x.type === 'video'))
    if (!verified) errors++
    ready++
    console.log(JSON.stringify({ anchorId, verified, ms: Date.now() - started,
      anchor: body.anchor?.payload.title ?? body.anchor?.payload.text,
      trio: trio.map(item => ({ key: item.key, type: item.type, title: item.payload.title ?? item.payload.text,
        relation: body.relations?.[item.key] })) }))
  } catch (error) {
    errors++; console.log(JSON.stringify({ anchorId, error: error instanceof Error ? error.message : 'request-failed' }))
  }
}
console.log(JSON.stringify({ ready, empty, errors, semanticReviewRequired: true,
  note: 'Inspecter aussi les liens positifs perdus. Un résultat vide ne prouve pas que cette version est déployée.' }))
if (errors) process.exitCode = 1
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'wave-quality-check-failed')
  process.exitCode = 1
})
