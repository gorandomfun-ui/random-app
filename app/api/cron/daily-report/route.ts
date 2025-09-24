export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { logCronRun } from '@/lib/metrics/cron'
import { buildDailyReport } from '@/lib/reports/dailyReport'
import { sendMail } from '@/lib/email/mailer'

function formatDate(date: Date, timeZone: string, opts: Intl.DateTimeFormatOptions = {}) {
  const formatter = new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    dateStyle: 'long',
    timeStyle: 'short',
    ...opts,
  })
  return formatter.format(date)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value)
}

function renderCountMap(map: Record<string, number> | undefined): string {
  if (!map) return '<em>Aucune donnée</em>'
  const entries = Object.entries(map).filter(([, count]) => count > 0)
  if (!entries.length) return '<em>Aucune donnée</em>'
  const items = entries
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => `<li><strong>${key}</strong> : ${formatNumber(count)}</li>`)
  return `<ul>${items.join('')}</ul>`
}

function renderUsageSection(usage: any): { html: string; text: string } {
  if (!usage) {
    return {
      html: '<p>Aucune donnée de fréquentation pour cette journée (instrumentation encore en cours de collecte).</p>',
      text: 'Aucune donnée de fréquentation enregistrée pour cette journée.',
    }
  }
  const counts = usage.counts || {}
  const total = formatNumber(counts.total || 0)
  const htmlParts = [
    `<p>Total des interactions enregistrées : <strong>${total}</strong></p>`,
    `<h4>Par type</h4>${renderCountMap(counts.byType)}`,
    `<h4>Par langue</h4>${renderCountMap(counts.byLang)}`,
    `<h4>Par source</h4>${renderCountMap(counts.byProvider)}`,
  ]
  const textParts = [
    `Total interactions : ${total}`,
  ]
  if (counts.byType) textParts.push('Par type : ' + Object.entries(counts.byType).map(([k, v]) => `${k}=${v}`).join(', '))
  if (counts.byLang) textParts.push('Par langue : ' + Object.entries(counts.byLang).map(([k, v]) => `${k}=${v}`).join(', '))
  if (counts.byProvider) textParts.push('Par source : ' + Object.entries(counts.byProvider).map(([k, v]) => `${k}=${v}`).join(', '))

  return { html: htmlParts.join(''), text: textParts.join('\n') }
}

function extractCronDetails(details: Record<string, any> | undefined): string {
  if (!details) return ''
  const stats = details.stats as Record<string, number> | undefined
  if (!stats) return ''
  const summary = Object.entries(stats)
    .filter(([, value]) => typeof value === 'number')
    .map(([key, value]) => `${key}: ${formatNumber(value as number)}`)
  return summary.length ? ` (${summary.join(', ')})` : ''
}

type DailyReport = Awaited<ReturnType<typeof buildDailyReport>>

function renderCronSummary(cron: DailyReport['cron'], timeZone: string) {
  if (!cron.summary.length) {
    return {
      html: '<p>Aucune exécution de cron enregistrée pour cette journée.</p>',
      text: 'Aucune exécution de cron enregistrée.',
    }
  }

  const htmlItems: string[] = []
  const textItems: string[] = []

  for (const entry of cron.summary) {
    const lastRun = entry.lastRun
    const stats = lastRun ? extractCronDetails(lastRun.details as Record<string, any> | undefined) : ''
    const finishedAt = lastRun ? formatDate(new Date(lastRun.finishedAt), timeZone) : '—'
    const duration = lastRun?.durationMs != null ? `${Math.round(lastRun.durationMs / 1000)}s` : '—'
    const ratio = `${entry.success}/${entry.total}`

    htmlItems.push(`<li><strong>${entry.name}</strong> : ${ratio} succès · dernière exécution ${finishedAt} (${duration})${stats}</li>`)
    textItems.push(`${entry.name} : ${ratio} succès, dernière exécution ${finishedAt} (${duration})${stats}`)
  }

  return {
    html: `<ul>${htmlItems.join('')}</ul>`,
    text: textItems.join('\n'),
  }
}


function buildEmail(report: DailyReport) {
  const { dayKey, timeZone, ingestion, usage, inventory } = report
  const runCompletedAt = new Date()

  const usageSections = renderUsageSection(usage)
  const cronSections = renderCronSummary(report.cron, timeZone)

  const subject = `Rapport quotidien RandomApp · ${dayKey}`
  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #111;">
      <h1 style="margin-bottom: 0.5rem;">Rapport quotidien — ${dayKey}</h1>
      <p style="margin-top: 0; color: #555;">Fuseau horaire : ${timeZone} · Généré le ${formatDate(runCompletedAt, timeZone)}</p>

      <h2 style="margin-top: 1.5rem;">Ingestions</h2>
      <h3>Créations (${formatNumber(ingestion.created.total)})</h3>
      ${renderCountMap(ingestion.created.map)}
      <h3>Mises à jour (${formatNumber(ingestion.updated.total)})</h3>
      ${renderCountMap(ingestion.updated.map)}

      <h2 style="margin-top: 1.5rem;">Crons nocturnes</h2>
      ${cronSections.html}

      <h2 style="margin-top: 1.5rem;">Utilisation du site</h2>
      ${usageSections.html}

      <h2 style="margin-top: 1.5rem;">Inventaire total</h2>
      <p>Total en base : <strong>${formatNumber(inventory.total)}</strong></p>
      ${renderCountMap(inventory.map)}

      <p style="margin-top: 2rem; font-size: 0.9rem; color: #777;">Rapport généré automatiquement. Merci et bonne journée !</p>
    </div>
  `

  const text = [
    `Rapport quotidien — ${dayKey} (${timeZone})`,
    '',
    `Ingestions :`,
    `  Créations (${ingestion.created.total}) : ${Object.entries(ingestion.created.map).map(([k, v]) => `${k}=${v}`).join(', ') || 'aucune'}`,
    `  Mises à jour (${ingestion.updated.total}) : ${Object.entries(ingestion.updated.map).map(([k, v]) => `${k}=${v}`).join(', ') || 'aucune'}`,
    '',
    'Crons nocturnes :',
    cronSections.text || '  aucune exécution',
    '',
    'Utilisation du site :',
    usageSections.text,
    '',
    `Inventaire total (${inventory.total}) : ${Object.entries(inventory.map).map(([k, v]) => `${k}=${v}`).join(', ') || 'n/a'}`,
    '',
    `Généré le ${formatDate(runCompletedAt, timeZone)}`,
  ].join('\n')

  return { subject, html, text }
}

export async function GET(req: Request) {
  const startedAt = new Date()
  const triggeredBy = req.headers.get('x-vercel-cron') ? 'cron' : 'manual'
  const url = new URL(req.url)
  const providedKey = (url.searchParams.get('key') || req.headers.get('x-admin-report-key') || req.headers.get('x-admin-ingest-key') || '').trim()
  const expectedKey = (process.env.REPORT_CRON_KEY || process.env.ADMIN_REPORT_KEY || process.env.ADMIN_INGEST_KEY || '').trim()

  if (!triggeredBy && expectedKey && providedKey !== expectedKey) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const report = await buildDailyReport()
    const mail = buildEmail(report)
    await sendMail(mail)

    const finishedAt = new Date()
    await logCronRun({
      name: 'cron:daily-report',
      status: 'success',
      startedAt,
      finishedAt,
      triggeredBy,
      details: { dayKey: report.dayKey, subject: mail.subject },
    })

    return NextResponse.json({ ok: true, dayKey: report.dayKey, subject: mail.subject, triggeredAt: finishedAt.toISOString() })
  } catch (error: any) {
    const finishedAt = new Date()
    await logCronRun({
      name: 'cron:daily-report',
      status: 'failure',
      startedAt,
      finishedAt,
      triggeredBy,
      error: error?.message || 'daily report failed',
    })
    return NextResponse.json({ error: error?.message || 'daily report failed' }, { status: 500 })
  }
}
