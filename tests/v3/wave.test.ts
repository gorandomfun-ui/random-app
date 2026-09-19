import test from 'node:test'
import assert from 'node:assert/strict'

import { buildWave, accepts, type WaveAnchor, type WaveCandidate } from '@/lib/v3/wave/select'
import type { Angle, ItemType, Popularity, Universe } from '@/lib/v3/types'

function anchor(overrides: Partial<WaveAnchor['v3']> = {}): WaveAnchor {
  return {
    id: 'ancre',
    type: 'image',
    title: 'Cartman crie GIF',
    v3: {
      subjects: [{ id: 'entity:south-park', role: 'primary', evidence: 'alias' }],
      universe: 'animation',
      angle: 'meme-gif',
      channelKey: 'giphy:southpark',
      ...overrides,
    },
  }
}

let counter = 0
function candidate(
  type: ItemType,
  angle: Angle,
  options: {
    level?: 1 | 2 | 3
    channelKey?: string
    popularity?: Popularity
    title?: string
    nearFamily?: string
    universe?: Universe
  } = {},
): WaveCandidate {
  counter += 1
  return {
    id: `c${counter}`,
    type,
    title: options.title ?? `contenu ${counter}`,
    level: options.level ?? 1,
    v3: {
      subjects: [{ id: 'entity:south-park', role: 'primary', evidence: 'alias' }],
      universe: options.universe ?? 'animation',
      angle,
      popularity: options.popularity ?? 'mid',
      era: 'recent',
      channelKey: options.channelKey,
      nearFamily: options.nearFamily,
    },
  }
}

test('la Wave mélange les formats plutôt que d_empiler des vidéos', () => {
  const { items } = buildWave(anchor(), [
    candidate('video', 'episode-extract'),
    candidate('video', 'parody-sketch'),
    candidate('video', 'compilation'),
    candidate('image', 'photo-image'),
    candidate('quiz' as ItemType, 'quiz'),
  ])
  assert.equal(items.length, 3)
  assert.ok(items.filter((item) => item.type === 'video').length <= 2, 'jamais plus de 2 vidéos')
  assert.ok(new Set(items.map((item) => item.type)).size >= 2, 'au moins deux formats')
})

test('jamais deux fois le même angle, ni celui du contenu de départ', () => {
  const { items } = buildWave(anchor(), [
    candidate('image', 'meme-gif'), // même angle que l_ancre → refusé
    candidate('video', 'episode-extract'),
    candidate('video', 'episode-extract'), // doublon d_angle → refusé
    candidate('image', 'photo-image'),
  ])
  const angles = items.map((item) => item.v3.angle)
  assert.equal(new Set(angles).size, angles.length, 'tous les angles sont différents')
  assert.ok(!angles.includes('meme-gif'), 'l_angle de départ est exclu')
})

test('jamais deux contenus du même auteur, ni celui du départ', () => {
  const { items } = buildWave(anchor(), [
    candidate('video', 'episode-extract', { channelKey: 'giphy:southpark' }), // auteur de l_ancre
    candidate('video', 'parody-sketch', { channelKey: 'youtube:UCaaa' }),
    candidate('image', 'photo-image', { channelKey: 'youtube:UCaaa' }), // même auteur
    candidate('image', 'fan-art', { channelKey: 'youtube:UCbbb' }),
  ])
  const authors = items.map((item) => item.v3.channelKey).filter(Boolean)
  assert.equal(new Set(authors).size, authors.length)
  assert.ok(!authors.includes('giphy:southpark'))
})

test('les textes n_apparaissent pas au niveau 3', () => {
  const large = buildWave(anchor(), [candidate('quote', 'text-quote', { level: 3 })])
  assert.equal(large.items.length, 0, 'une citation sans lien de sujet est refusée')

  const proche = buildWave(anchor(), [candidate('quote', 'text-quote', { level: 1 })])
  assert.equal(proche.items.length, 1, 'la même citation passe quand le sujet correspond')
})

test('les quasi-doublons ne se répètent pas dans une même Wave', () => {
  const { items } = buildWave(anchor(), [
    candidate('video', 'episode-extract', { nearFamily: 'aaaa' }),
    candidate('video', 'parody-sketch', { nearFamily: 'aaaa' }),
    candidate('image', 'photo-image', { nearFamily: 'bbbb' }),
  ])
  const familles = items.map((item) => item.v3.nearFamily)
  assert.equal(new Set(familles).size, familles.length)
})

test('un titre identique n_apparaît pas deux fois', () => {
  const { items } = buildWave(anchor(), [
    candidate('video', 'episode-extract', { title: 'South Park épisode culte' }),
    candidate('image', 'photo-image', { title: 'South Park, épisode culte !' }),
    candidate('image', 'fan-art', { title: 'autre chose' }),
  ])
  assert.equal(items.length, 2, 'le titre en double est écarté malgré la ponctuation différente')
})

test('les niveaux sont descendus dans l_ordre, et le niveau rendu est le plus lâche utilisé', () => {
  const { items, level } = buildWave(anchor(), [
    candidate('video', 'episode-extract', { level: 1 }),
    candidate('image', 'photo-image', { level: 2 }),
    candidate('web' as ItemType, 'website', { level: 3, universe: 'animation' }),
  ])
  assert.equal(items.length, 3)
  assert.equal(items[0]?.level, 1, 'le lien le plus proche est servi en premier')
  assert.equal(level, 3, 'le niveau annoncé est celui du lien le plus lointain retenu')
})

test('aucun candidat valide donne une Wave vide, jamais un contenu sans lien', () => {
  const { items } = buildWave(anchor(), [candidate('image', 'meme-gif')])
  assert.equal(items.length, 0)
})

test('accepts refuse le contenu de départ et ceux déjà vus', () => {
  const a = anchor()
  const vu = candidate('video', 'episode-extract')
  assert.equal(accepts(a, [], { ...vu, id: 'ancre' }, new Set()), false)
  assert.equal(accepts(a, [], vu, new Set([vu.id])), false)
  assert.equal(accepts(a, [], vu, new Set()), true)
})
