/** Audit sections describing what the catalogue holds. */

import type { Db } from 'mongodb'

import { count, percent, table } from '../reportFormat'
import { addSection } from './section'
import { ITEMS, REAL_DAILYMOTION_CHANNEL, groupCount } from './queries'

const FILENAME_TITLE = /^(vid|img|mov|dsc|dscn|pxl|wa|whatsapp|screenshot|capture|photo|video)[-_\s]*\d/i
const HASHTAGS_ONLY = /^(\s*#[^\s#]+\s*)+$/



export async function auditVolumes(db: Db, total: number): Promise<void> {
  const byType = await groupCount(db, 'type')
  const byProvider = await groupCount(db, 'provider')
  const byLang = await groupCount(db, 'lang', 20)

  const body = [
    `**${count(total)} contenus au total.**`,
    '',
    '### Par type',
    table(['Type', 'Nombre', 'Part'], byType.map(([k, n]) => [k,count(n), percent(n, total)])),
    '',
    '### Par fournisseur',
    table(['Fournisseur', 'Nombre', 'Part'], byProvider.map(([k, n]) => [k,count(n), percent(n, total)])),
    '',
    '### Par langue',
    table(['Langue', 'Nombre', 'Part'], byLang.map(([k, n]) => [k,count(n), percent(n, total)])),
  ].join('\n')

  addSection('Volumes', body)
}
export async function auditChannelConcentration(db: Db): Promise<void> {
  const grouped = await db
    .collection(ITEMS)
    .aggregate(
      [
        { $match: { type: 'video' } },
        { $group: { _id: { channelId: '$channelId', title: '$channelTitle' }, n: { $sum: 1 } } },
        {
          $facet: {
            top: [{ $sort: { n: -1 } }, { $limit: 50 }],
            spread: [
              {
                $group: {
                  _id: null,
                  channels: { $sum: 1 },
                  over40: { $sum: { $cond: [{ $gt: ['$n', 40] }, 1, 0] } },
                  itemsOver40: { $sum: { $cond: [{ $gt: ['$n', 40] }, '$n', 0] } },
                  over200: { $sum: { $cond: [{ $gt: ['$n', 200] }, 1, 0] } },
                },
              },
            ],
          },
        },
      ],
      { allowDiskUse: true },
    )
    .toArray()

  const top = (grouped[0]?.top ?? []) as Array<{ _id: { channelId?: string; title?: string }; n: number }>
  const spread = (grouped[0]?.spread ?? [])[0] as
    | { channels: number; over40: number; itemsOver40: number; over200: number }
    | undefined

  const videoTotal = await db.collection(ITEMS).countDocuments({ type: 'video' })
  const biggest = top[0]

  const body = [
    table(
      ['Mesure', 'Valeur'],
      [
        ['Chaînes distinctes', count(spread?.channels ?? 0)],
        ['Chaînes de plus de 40 contenus', count(spread?.over40 ?? 0)],
        ['Contenus détenus par ces chaînes', `${count(spread?.itemsOver40 ?? 0)} (${percent(spread?.itemsOver40 ?? 0, videoTotal)} des vidéos)`],
        ['Chaînes de plus de 200 contenus', count(spread?.over200 ?? 0)],
        ['Chaîne la plus présente', biggest ? `${biggest._id.title ?? biggest._id.channelId ?? '(inconnue)'} — ${count(biggest.n)} (${percent(biggest.n, videoTotal)})` : '—'],
      ],
    ),
    '',
    '### Les 50 chaînes les plus présentes',
    table(
      ['#', 'Chaîne', 'Vidéos', 'Part des vidéos'],
      top.map((row, index) => [
        index + 1,
        row._id.title ?? row._id.channelId ?? '(inconnue)',
count(row.n),
        percent(row.n, videoTotal),
      ]),
    ),
    '',
    `Objectif du tableau de bord : la chaîne la plus présente doit rester **sous 0,5 %** du catalogue actif.`,
  ].join('\n')

  addSection('Concentration par chaîne', body)
}
export async function auditChannelQuality(db: Db): Promise<void> {
  const videoTotal = await db.collection(ITEMS).countDocuments({ type: 'video' })
  const dailymotion = await db.collection(ITEMS).countDocuments({ type: 'video', provider: 'dailymotion' })
  const category = await db
    .collection(ITEMS)
    .countDocuments({ type: 'video', provider: 'dailymotion', channelId: { $not: REAL_DAILYMOTION_CHANNEL } })

  const slugs = await db
    .collection(ITEMS)
    .aggregate(
      [
        { $match: { type: 'video', provider: 'dailymotion', channelId: { $not: REAL_DAILYMOTION_CHANNEL } } },
        { $group: { _id: '$channelId', n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 12 },
      ],
      { allowDiskUse: true },
    )
    .toArray()

  const body = [
    '> ⚠️ **Le champ `channelId` n\'est pas fiable pour Dailymotion.**',
    '',
    table(
      ['Mesure', 'Valeur'],
      [
        ['Vidéos Dailymotion', `${count(dailymotion)} (${percent(dailymotion, videoTotal)} des vidéos)`],
        ['dont `channelId` = **catégorie**, pas une chaîne', `**${count(category)}** (${percent(category, dailymotion)})`],
        ['dont `channelId` = vraie chaîne', `${count(dailymotion - category)} (${percent(dailymotion - category, dailymotion)})`],
        ['**Part du catalogue vidéo sans chaîne réelle**', `**${percent(category, videoTotal)}**`],
      ],
    ),
    '',
    '### Valeurs trouvées à la place d\'une chaîne',
    table(['`channelId`', 'Vidéos'], slugs.map((row) => [`\`${row._id}\``, count(row.n as number)])),
    '',
    'Conséquence : le plafond « 40 contenus par chaîne » (5.G, 7.1), la règle « jamais deux fois',
    'la même chaîne dans une Wave » (6.3) et « jamais la même chaîne dans les 100 derniers tirages »',
    '(8.1) s\'appliqueraient à une vingtaine de catégories au lieu des vraies chaînes.',
    'Le vrai nom d\'auteur doit être récupéré avant que ces règles aient un sens.',
  ].join('\n')

  addSection('Fiabilité du champ « chaîne »', body)
}
export async function auditTitles(db: Db, total: number): Promise<void> {
  const [missing, filenameLike, hashtagsOnly, veryShort] = await Promise.all([
    db.collection(ITEMS).countDocuments({ $or: [{ title: { $exists: false } }, { title: '' }, { title: null }] }),
    db.collection(ITEMS).countDocuments({ title: { $regex: FILENAME_TITLE } }),
    db.collection(ITEMS).countDocuments({ title: { $regex: HASHTAGS_ONLY } }),
    db.collection(ITEMS).countDocuments({ $expr: { $lt: [{ $strLenCP: { $ifNull: ['$title', ''] } }, 3] } }),
  ])

  const unusable = missing + filenameLike + hashtagsOnly
  const body = [
    table(
      ['Problème', 'Nombre', 'Part du catalogue'],
      [
        ['Titre absent ou vide',count(missing), percent(missing, total)],
        ['Titre de type nom de fichier (VID_2019…)',count(filenameLike), percent(filenameLike, total)],
        ['Titre composé uniquement de hashtags',count(hashtagsOnly), percent(hashtagsOnly, total)],
        ['Titre de moins de 3 caractères',count(veryShort), percent(veryShort, total)],
        ['**Total inexploitable (approx.)**', `**${count(unusable)}**`, `**${percent(unusable, total)}**`],
      ],
    ),
    '',
    'Ces contenus sont les candidats à la suspension de la phase 5.F : sans titre exploitable,',
    'aucun étiquetage par alias ne peut fonctionner.',
  ].join('\n')

  addSection('Titres inexploitables', body)
}
