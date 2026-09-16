/** Audit sections describing curation and the ingestion pipeline. */

import type { Db } from 'mongodb'

import { count, day, table } from '../reportFormat'
import { addSection } from './section'
import { ITEMS } from './queries'
import { writeFileSync } from 'node:fs'

const CURATION_LIKES = 'discovery_owner_references_v2'
const CRON_RUNS = 'cron_runs'
const JAPANESE = /[\u3040-\u30ff\u4e00-\u9faf]/


export async function auditCuration(db: Db): Promise<void> {
  const likes = await db.collection(CURATION_LIKES).countDocuments({})
  const recent = await db.collection(CURATION_LIKES).find({}).sort({ createdAt: -1 }).limit(5).toArray()

  const body = [
    `**${likes} likes de curation** dans \`${CURATION_LIKES}\`.`,
    '',
    likes < 100
      ? `> ⚠️ C'est peu. La ligne L5 « fouille des likes » vise ~1 800 vidéos par jour en phase 7 et s'appuie\n> sur ces likes. Il faudra en ajouter via la page prévue en 7.6, sans quoi cette ligne restera à sec.`
      : 'Volume suffisant pour alimenter la ligne L5.',
    '',
    recent.length ? `Dernier like enregistré : ${recent[0]?.createdAt ?? '(date inconnue)'}` : '',
  ].join('\n')

  addSection('Likes de curation', body)
}
export async function auditIngestion(db: Db): Promise<void> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const runs = await db
    .collection(CRON_RUNS)
    .aggregate(
      [
        { $match: { startedAt: { $gte: since } } },
        {
          $group: {
            _id: '$name',
            runs: { $sum: 1 },
            ok: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
            failed: { $sum: { $cond: [{ $eq: ['$status', 'failure'] }, 1, 0] } },
            inserted: { $sum: { $ifNull: ['$details.result.inserted', 0] } },
            scanned: { $sum: { $ifNull: ['$details.result.scanned', 0] } },
            existingSkipped: { $sum: { $ifNull: ['$details.result.existingSkipped', 0] } },
            last: { $max: '$startedAt' },
          },
        },
        { $sort: { inserted: -1 } },
      ],
      { allowDiskUse: true },
    )
    .toArray()

  const rows = runs.map((row) => [
    String(row._id),
    row.runs as number,
    row.ok as number,
    row.failed as number,
count(row.scanned as number),
count(row.inserted as number),
count(row.existingSkipped as number),
    day(row.last as Date),
  ])

  const warnings = await db
    .collection(CRON_RUNS)
    .aggregate(
      [
        { $match: { startedAt: { $gte: since }, 'details.result.warnings': { $exists: true } } },
        { $unwind: '$details.result.warnings' },
        { $group: { _id: '$details.result.warnings.label', n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 15 },
      ],
      { allowDiskUse: true },
    )
    .toArray()

  const body = [
    'Sur les **30 derniers jours**, d\'après les rapports en base (`cron_runs`) :',
    '',
    table(['Job', 'Passages', 'OK', 'Échecs', 'Examinés', 'Insérés', 'Déjà connus', 'Dernier'], rows),
    '',
    '### Avertissements les plus fréquents',
    table(['Avertissement', 'Occurrences'], warnings.map((row) => [`\`${row._id}\``, row.n as number])),
    '',
    'La colonne « Insérés » comparée à « Examinés » dit le rendement réel de chaque ligne.',
  ].join('\n')

  addSection('Diagnostic de l\'ingestion (30 jours)', body)
}
export async function auditAiCost(db: Db, total: number): Promise<void> {
  const sample = await db
    .collection(ITEMS)
    .aggregate(
      [
        { $sample: { size: 20000 } },
        {
          $project: {
            titleLength: { $strLenCP: { $ifNull: ['$title', ''] } },
            descriptionLength: { $min: [{ $strLenCP: { $ifNull: ['$description', ''] } }, 300] },
            japanese: { $regexMatch: { input: { $ifNull: ['$title', ''] }, regex: JAPANESE } },
          },
        },
        {
          $group: {
            _id: null,
            n: { $sum: 1 },
            title: { $avg: '$titleLength' },
            description: { $avg: '$descriptionLength' },
            japanese: { $sum: { $cond: ['$japanese', 1, 0] } },
          },
        },
      ],
      { allowDiskUse: true },
    )
    .toArray()

  const row = sample[0] as { n: number; title: number; description: number; japanese: number } | undefined
  if (!row) return

  const japaneseShare = row.japanese / row.n
  const charsPerItem = row.title + row.description + 40
  const latinTokens = (charsPerItem * (1 - japaneseShare)) / 4
  const japaneseTokens = (charsPerItem * japaneseShare) / 1.5
  const tokensPerItem = latinTokens + japaneseTokens
  const inputTokens = tokensPerItem * total
  const outputTokens = 60 * total

  const body = [
    `Mesuré sur un échantillon aléatoire de **${count(row.n)} contenus** :`,
    '',
    table(
      ['Mesure', 'Valeur'],
      [
        ['Longueur moyenne du titre', `${Math.round(row.title)} caractères`],
        ['Longueur moyenne de la description (tronquée à 300)', `${Math.round(row.description)} caractères`],
        ['Part de contenus en écriture japonaise', `${(japaneseShare * 100).toFixed(1)} %`],
        ['Jetons d\'entrée estimés par contenu', Math.round(tokensPerItem)],
        ['**Jetons d\'entrée pour tout le catalogue**', `**${(inputTokens / 1e6).toFixed(1)} M**`],
        ['**Jetons de sortie estimés**', `**${(outputTokens / 1e6).toFixed(1)} M**`],
      ],
    ),
    '',
    '_Le chiffrage en euros est calculé à part, à partir des tarifs officiels en vigueur (voir le rapport)._',
    '',
    '> Rappel : l\'IA est **désactivée** (`V3_AI_ENABLED=0`, `V3_AI_BUDGET_USD=0`).',
    '> Ce calcul sert uniquement à décider en connaissance de cause.',
  ].join('\n')

  addSection('Estimation du coût de l\'étiquetage IA (phase 5.C)', body)

  writeFileSync('/tmp/ai-estimate.json', JSON.stringify({ total, tokensPerItem, inputTokens, outputTokens }, null, 2))
}
