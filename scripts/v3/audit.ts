/**
 * Phase 3 — read-only audit of the production catalogue.
 *
 * Writes nothing to the database. Run with:
 *   node --env-file=.env.local --import tsx scripts/v3/audit.ts
 *
 * Every figure lands in docs/reports/phase-3-audit.md.
 */

import { writeFileSync } from 'node:fs'

import { MongoClient } from 'mongodb'

import { auditChannelConcentration, auditChannelQuality, auditTitles, auditVolumes } from './audit/catalogue'
import { auditFamilies, auditFieldPresence, auditVideoHealth } from './audit/health'
import { auditAiCost, auditCuration, auditIngestion } from './audit/pipeline'
import { sections } from './audit/section'

const ITEMS = 'items'

function buildMarkdown(dbName: string): string {
  return [
    '# Phase 3 — Audit de la base (lecture seule)',
    '',
    `Généré le ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} · base \`${dbName}\``,
    '',
    'Ce rapport est produit par `scripts/v3/audit.ts`, qui **n\'écrit rien** en base.',
    '',
    '---',
    '',
    ...sections().flatMap((section) => [`## ${section.title}`, '', section.body, '', '---', '']),
  ].join('\n')
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) throw new Error('MONGODB_URI manquant')
  const dbName = process.env.MONGODB_DB || process.env.MONGO_DB || 'randomdb'

  console.log(`Audit en lecture seule de « ${dbName} »…`)
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 })
  await client.connect()

  try {
    const db = client.db(dbName)
    const total = await db.collection(ITEMS).estimatedDocumentCount()

    await auditVolumes(db, total)
    await auditChannelConcentration(db)
    await auditChannelQuality(db)
    await auditTitles(db, total)
    await auditVideoHealth(db)
    await auditFieldPresence(db)
    await auditFamilies(db, total)
    await auditCuration(db)
    await auditIngestion(db)
    await auditAiCost(db, total)

    writeFileSync('docs/reports/phase-3-audit.md', buildMarkdown(dbName))
    console.log('\nRapport écrit : docs/reports/phase-3-audit.md')
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
