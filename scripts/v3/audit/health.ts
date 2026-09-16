/** Audit sections describing the state of the stored items. */

import type { Db } from 'mongodb'

import { count, percent, table } from '../reportFormat'
import { addSection } from './section'
import { ITEMS, groupCount } from './queries'




export async function auditVideoHealth(db: Db): Promise<void> {
  const videoTotal = await db.collection(ITEMS).countDocuments({ type: 'video' })
  const byStatus = await db
    .collection(ITEMS)
    .aggregate(
      [
        { $match: { type: 'video' } },
        { $group: { _id: '$obsoleteVideoStatus', n: { $sum: 1 } } },
        { $sort: { n: -1 } },
      ],
      { allowDiskUse: true },
    )
    .toArray()

  const byReason = await db
    .collection(ITEMS)
    .aggregate(
      [
        { $match: { type: 'video', obsoleteVideoStatus: 'obsolete' } },
        { $group: { _id: '$obsoleteVideoReason', n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 20 },
      ],
      { allowDiskUse: true },
    )
    .toArray()

  const runtimeSuspect = await db.collection(ITEMS).countDocuments({ type: 'video', obsoleteVideoRuntimeSuspect: true })
  const blockedNow = await db
    .collection(ITEMS)
    .countDocuments({ type: 'video', obsoleteVideoRuntimeBlockedUntil: { $gt: new Date() } })
  const suppressed = await db.collection(ITEMS).countDocuments({ isSuppressed: true })

  // Videos retired by the single-report bug fixed in phase 1.
  const retiredByOneReport = await db
    .collection(ITEMS)
    .countDocuments({ type: 'video', obsoleteVideoReason: { $regex: /^runtime-player-/ } })

  const body = [
    table(
      ['État', 'Vidéos', 'Part des vidéos'],
      byStatus.map((row) => [String(row._id ?? '(actif, jamais vérifié)'), count(row.n as number), percent(row.n as number, videoTotal)]),
    ),
    '',
    table(
      ['Autre mesure', 'Nombre'],
      [
        ['Vidéos signalées cassées au moins une fois',count(runtimeSuspect)],
        ['Vidéos bloquées à cet instant',count(blockedNow)],
        ['Contenus suspendus (`isSuppressed`)',count(suppressed)],
        ['⚠️ **Retirées par un signalement unique** (`runtime-player-*`)', `**${count(retiredByOneReport)}**`],
      ],
    ),
    '',
    '### Motifs de mise en obsolète',
    table(['Motif', 'Nombre'], byReason.map((row) => [String(row._id ?? '(sans motif)'), count(row.n as number)])),
  ].join('\n')

  addSection('Santé des vidéos', body)
}
export async function auditFieldPresence(db: Db): Promise<void> {
  const videoTotal = await db.collection(ITEMS).countDocuments({ type: 'video' })
  const fields = ['viewCount', 'publishedAt', 'channelId', 'channelTitle', 'duration', 'trendObservedAt', 'lang', 'description']

  const rows: Array<Array<string | number>> = []
  for (const field of fields) {
    const present = await db.collection(ITEMS).countDocuments({ type: 'video', [field]: { $exists: true, $ne: null } })
    rows.push([`\`${field}\``,count(present), percent(present, videoTotal), percent(videoTotal - present, videoTotal)])
  }

  const body = [
    `Sur les **${count(videoTotal)} vidéos** du catalogue :`,
    '',
    table(['Champ', 'Présent', 'Part présente', 'Part manquante'], rows),
    '',
    '`viewCount` et `publishedAt` commandent la popularité et l\'époque (phase 4.2).',
    'Ce qui manque devra être récupéré par `videos.list`, 1 unité de quota pour 50 vidéos (phase 5.E).',
  ].join('\n')

  addSection('Présence des champs', body)
}
export async function auditFamilies(db: Db, total: number): Promise<void> {
  const families = await groupCount(db, 'discoveryFamily', 30)
  const patterns = await db
    .collection(ITEMS)
    .aggregate(
      [
        { $group: { _id: '$discoveryProfile.pattern', n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 15 },
      ],
      { allowDiskUse: true },
    )
    .toArray()

  const body = [
    '### Par famille de découverte',
    table(['Famille', 'Nombre', 'Part'], families.map(([k, n]: [string, number]) => [k,count(n), percent(n, total)])),
    '',
    '### Par motif détecté (`discoveryProfile.pattern`)',
    table(['Motif', 'Nombre', 'Part'], patterns.map((row) => [String(row._id ?? '(aucun)'), count(row.n as number), percent(row.n as number, total)])),
    '',
    'Le motif `ai-narrative` repère les « histoires illustrées par IA », cible principale des',
    'plafonds anti-saturation de la phase 7.8.',
  ].join('\n')

  addSection('Familles et motifs', body)
}
