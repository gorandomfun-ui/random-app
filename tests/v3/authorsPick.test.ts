import test from 'node:test'
import assert from 'node:assert/strict'

import {
  AUTHORS_PER_PASS, BIG_RECHECK_DAYS, HOLD_CAP, SAME_SHAPE_CAP, SMALL_AUTHOR_MAX, TAKE_PER_PASS,
  keepFromAuthor, pickAuthors, smallAuthor, splitAuthorKey, titleShape, type AuthorMemory,
} from '@/lib/v3/authors/pick'
import { dailymotionAuthorVideos, youtubeAuthorVideos } from '@/lib/v3/authors/fetch'

/**
 * The restraint on following an author. The owner's fear, in his words: not
 * ingesting fifty thousand pieces of junk because one channel publishes that
 * many. These are the rules that make that impossible.
 */

const zone = (key: string, video: number, liked = 1) => ({ key, video, likeIds: Array.from({ length: liked }, (_, i) => `l${i}`) })

test('on ne suit qu_un auteur que quelqu_un a aimé', () => {
  const picked = pickAuthors([zone('youtube:UC' + 'a'.repeat(22), 0, 0), zone('youtube:UC' + 'b'.repeat(22), 0, 1)])
  assert.equal(picked.length, 1)
  assert.ok(picked[0].key.includes('b'))
})

test('un auteur dont on a déjà le plafond n_est plus visité', () => {
  assert.deepEqual(pickAuthors([zone('youtube:UC' + 'c'.repeat(22), HOLD_CAP)]), [])
  assert.deepEqual(pickAuthors([zone('youtube:UC' + 'c'.repeat(22), HOLD_CAP + 12)]), [])
})

test('la place restante ne dépasse jamais ce qu_on prend en un passage', () => {
  const [visit] = pickAuthors([zone('dailymotion:xabc', 0)])
  assert.equal(visit.room, TAKE_PER_PASS, 'un auteur inconnu ne vide pas le plafond d_un coup')
  const [almost] = pickAuthors([zone('dailymotion:xabc', HOLD_CAP - 3)])
  assert.equal(almost.room, 3, 'et près du plafond on ne prend que ce qui reste')
})

test('les auteurs les moins connus passent devant, et le passage est borné', () => {
  const zones = Array.from({ length: AUTHORS_PER_PASS + 10 }, (_, i) => zone(`dailymotion:x${i}`, i))
  const picked = pickAuthors(zones)
  assert.equal(picked.length, AUTHORS_PER_PASS)
  assert.ok(picked[0].room >= picked[picked.length - 1].room)
})

test('une clé d_auteur qu_on ne sait pas lire est ignorée', () => {
  assert.equal(splitAuthorKey('vimeo:123'), null)
  assert.equal(splitAuthorKey('sansdeuxpoints'), null)
  assert.equal(splitAuthorKey('youtube:'), null)
  assert.deepEqual(splitAuthorKey('youtube:UCabc'), { provider: 'youtube', id: 'UCabc' })
})

test('une chaîne qui publie cinquante fois la même vidéo n_en donne que deux', () => {
  const videos = Array.from({ length: 50 }, (_, i) => ({ title: `Tuto Excel épisode ${i + 1} : la formule magique` }))
  const kept = keepFromAuthor(videos, TAKE_PER_PASS)
  assert.equal(kept.length, SAME_SHAPE_CAP, `${kept.length} gardées`)
})

test('une chaîne variée donne bien ce que la place permet', () => {
  const videos = [
    { title: 'Un volcan vu de très près' },
    { title: 'La fabrication du verre soufflé' },
    { title: 'Concert au sommet d_une montagne' },
    { title: 'Restauration d_une montre de 1910' },
  ]
  assert.equal(keepFromAuthor(videos, TAKE_PER_PASS).length, 4)
  assert.equal(keepFromAuthor(videos, 2).length, 2, 'la place restante fait foi')
})

test('la forme d_un titre ignore les numéros et les mots vides', () => {
  assert.equal(titleShape('Tuto Excel épisode 12'), titleShape('Tuto Excel épisode 47'))
  assert.notEqual(titleShape('Un volcan en éruption'), titleShape('Une montre restaurée'))
  assert.equal(titleShape(''), '', 'un titre vide ne forme pas une série')
})

test('des titres vides ne se font pas passer pour une série', () => {
  const videos = Array.from({ length: 6 }, () => ({ title: '' }))
  assert.equal(keepFromAuthor(videos, 5).length, 5, 'ils sont jugés par les filtres habituels, pas par la forme')
})

const DAY = 24 * 60 * 60 * 1000

test('seuls les petits auteurs sont suivis (22 octobre) : deux cents vidéos au plus sur la chaîne', () => {
  assert.equal(SMALL_AUTHOR_MAX, 200)
  assert.equal(smallAuthor(94), true, 'la petite chaîne du zoo de Saïgon')
  assert.equal(smallAuthor(200), true)
  assert.equal(smallAuthor(201), false)
  assert.equal(smallAuthor(3000), false, 'une usine de trois mille vidéos')
  assert.equal(smallAuthor(null), false, 'une taille inconnue ne passe pas')
})

test('une grande chaîne vue récemment est laissée, puis revue au bout du délai', () => {
  const now = Date.UTC(2026, 9, 22)
  const zones = [zone('youtube:UC' + 'd'.repeat(22), 0), zone('dailymotion:xsmall1', 0)]
  const lately = new Map<string, AuthorMemory>([['youtube:UC' + 'd'.repeat(22), { visitedAt: now - 3 * DAY, big: true }]])
  assert.deepEqual(pickAuthors(zones, AUTHORS_PER_PASS, lately, now).map((visit) => visit.key), ['dailymotion:xsmall1'])
  const longAgo = new Map<string, AuthorMemory>([['youtube:UC' + 'd'.repeat(22), { visitedAt: now - (BIG_RECHECK_DAYS + 1) * DAY, big: true }]])
  assert.equal(pickAuthors(zones, AUTHORS_PER_PASS, longAgo, now).length, 2)
})

test('à place égale, l_auteur jamais visité puis le plus anciennement visité passent devant', () => {
  const now = Date.UTC(2026, 9, 22)
  const zones = [zone('dailymotion:xa1', 0), zone('dailymotion:xb2', 0), zone('dailymotion:xc3', 0)]
  const memory = new Map<string, AuthorMemory>([
    ['dailymotion:xa1', { visitedAt: now - DAY, big: false }],
    ['dailymotion:xb2', { visitedAt: now - 5 * DAY, big: false }],
  ])
  assert.deepEqual(pickAuthors(zones, AUTHORS_PER_PASS, memory, now).map((visit) => visit.key), ['dailymotion:xc3', 'dailymotion:xb2', 'dailymotion:xa1'])
})

test('la taille de la chaîne vient avec ses vidéos, et une grande chaîne YouTube ne coûte qu_une unité', async () => {
  const asked: string[] = []
  const answer = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  const big = async (url: string | URL | Request) => {
    asked.push(String(url))
    return answer({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'UU' + 'e'.repeat(22) } }, statistics: { videoCount: '3000' } }] })
  }
  const youtube = await youtubeAuthorVideos('key', 'UC' + 'e'.repeat(22), 8, big as typeof fetch, undefined, smallAuthor)
  assert.deepEqual(youtube, { videos: [], total: 3000 })
  assert.equal(asked.length, 1, 'la liste de ses vidéos n_est pas lue')
  // Dailymotion's size comes from the account, its list sometimes leaving `total` out (22 October).
  const account = async (url: string | URL | Request) => (String(url).includes('/videos?') ? answer({ has_more: true, list: [{ id: 'x87tt66', title: 'Saigon Zoo' }] }) : answer({ videos_total: 94 }))
  const dailymotion = await dailymotionAuthorVideos('x2b1rhk', 8, account as typeof fetch, undefined, smallAuthor)
  assert.equal(dailymotion.total, 94)
  assert.equal(dailymotion.videos.length, 1)
  const factoryAsked: string[] = []
  const factory = async (url: string | URL | Request) => { factoryAsked.push(String(url)); return answer({ videos_total: 854 }) }
  assert.deepEqual(await dailymotionAuthorVideos('x16zhas', 8, factory as typeof fetch, undefined, smallAuthor), { videos: [], total: 854 })
  assert.equal(factoryAsked.length, 1, 'sa liste n_est pas lue')
})
