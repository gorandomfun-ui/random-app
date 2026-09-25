import test from 'node:test'
import assert from 'node:assert/strict'

import {
  AUTHORS_PER_PASS, HOLD_CAP, SAME_SHAPE_CAP, TAKE_PER_PASS,
  keepFromAuthor, pickAuthors, splitAuthorKey, titleShape,
} from '@/lib/v3/authors/pick'

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
