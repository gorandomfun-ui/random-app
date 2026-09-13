/** Read-only check against a preview or deployment; never invokes ingestion or writes likes. */
import { composeWave, relation, type WavePlan } from '../../lib/discovery/waves'
import type { Candidate } from '../../lib/discovery/types'
import { SUBJECT_VERSION } from '../../lib/discovery/subjects'

async function main() {
  const args = process.argv.slice(2), value = (key: string) => args[args.indexOf(key) + 1]
  const base = args.includes('--url') ? value('--url') : ''
  const ids = args.includes('--ids') ? [...new Set(value('--ids').split(','))] : []
  if (!/^https?:\/\//.test(base) || ids.length < 1 || ids.length > 10 || ids.some(id => !/^[a-f\d]{24}$/i.test(id))) {
    throw new Error('Usage: node --import tsx scripts/discovery/check-subjects.ts --url https://PREVIEW --ids ID1,ID2 (1–10 existing IDs)')
  }
  let ready = 0, empty = 0, failures = 0
  // Sequential and at most ten requests; no production load simulation.
  for (const anchorId of ids) {
    const started = performance.now()
    try {
      const response = await fetch(new URL('/api/discovery/wave', base), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(25000),
        body: JSON.stringify({ anchorId, lang: 'fr', types: ['video', 'image', 'fact', 'quote', 'joke', 'web'] }),
      })
      const body = await response.json() as WavePlan<unknown> & { anchor?: Candidate; diagnostics?: unknown }
      const ms = Math.round(performance.now() - started)
      if (!response.ok) { failures++; console.log(JSON.stringify({ anchorId, status: response.status, ms })); continue }
      if (!body.ready) { empty++; console.log(JSON.stringify({ anchorId, ready: false, ms, diagnostics: body.diagnostics })); continue }
      const anchor = body.anchor
      const valid = anchor?.profile.subject?.version === SUBJECT_VERSION && Boolean(anchor.profile.subject.primary) &&
        body.trio.length === 3 && composeWave(anchor, body.trio).ready &&
        body.trio.every(item => relation(anchor.profile, item.profile)?.reasons.some(reason => reason.startsWith('subject:')))
      if (valid) ready++; else failures++
      console.log(JSON.stringify({ anchorId, ms, verifiedSubjectRules: valid, subject: anchor?.profile.subject?.primary?.key,
        trio: body.trio.map(item => ({ key: item.key, type: item.type, quiz: item.quiz,
          title: item.profile.subject?.title, treatments: item.profile.subject?.treatments })), diagnostics: body.diagnostics }))
    } catch (error) { failures++; console.log(JSON.stringify({ anchorId, error: error instanceof Error ? error.name : 'request-error' })) }
  }
  console.log(JSON.stringify({ ready, empty, failures, humanReviewRequired: true,
    note: 'No HTTP error does not prove Wave availability or semantic quality. Review the displayed content.' }))
  if (failures || ready === 0) process.exitCode = 1
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Check failed'); process.exitCode = 1 })
