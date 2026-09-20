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

test('trois fois le même format : seulement en dernier recours', () => {
  // Il y a de quoi mélanger : la Wave doit mélanger.
  const melange = buildWave(anchor({ angle: 'official-clip' }), [
    candidate('image', 'meme-gif'),
    candidate('image', 'fan-art'),
    candidate('video', 'live-concert'),
  ])
  assert.equal(melange.items.length, 3)
  assert.equal(melange.items.filter((item) => item.type === 'image').length, 2, 'deux images et une vidéo')

  // Un sujet qui n_a que des vidéos vaut mieux qu_une Wave courte.
  const queDesVideos = buildWave(anchor({ angle: 'meme-gif' }), [
    candidate('video', 'live-concert'),
    candidate('video', 'interview'),
    candidate('video', 'documentary'),
  ])
  assert.equal(queDesVideos.items.length, 3, 'faute de mieux, trois vidéos valent mieux que deux')
})

test('jamais trois images ni trois textes, même faute de mieux', () => {
  const troisImages = buildWave(anchor({ angle: 'official-clip' }), [
    candidate('image', 'meme-gif'),
    candidate('image', 'fan-art'),
    candidate('image', 'photo-image'),
  ])
  assert.equal(troisImages.items.length, 2, 'une Wave courte vaut mieux que trois images')

  const troisTextes = buildWave(anchor({ angle: 'official-clip' }), [
    candidate('joke', 'text-joke'),
    candidate('quote', 'text-quote'),
    candidate('fact', 'text-fact'),
  ])
  assert.ok(troisTextes.items.length <= 2, 'idem pour les textes')
})

test('deux images et un texte reste possible', () => {
  const { items } = buildWave(anchor({ angle: 'official-clip' }), [
    candidate('image', 'meme-gif'),
    candidate('image', 'fan-art'),
    candidate('joke', 'text-joke'),
  ])
  assert.equal(items.length, 3)
  assert.equal(items.filter((item) => item.type === 'image').length, 2)
  assert.equal(items.filter((item) => item.type === 'joke').length, 1)
})

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

test('jamais deux fois le même traitement, ni celui du contenu de départ', () => {
  const { items } = buildWave(anchor({ angle: 'live-concert' }), [
    candidate('video', 'live-concert'), // même traitement que l_ancre → refusé
    candidate('video', 'episode-extract'),
    candidate('video', 'episode-extract'), // doublon de traitement → refusé
    candidate('image', 'fan-art'),
    candidate('fact' as ItemType, 'text-fact'),
  ])
  const angles = items.map((item) => item.v3.angle)
  assert.equal(new Set(angles).size, angles.length, 'tous les traitements sont différents')
  assert.ok(!angles.includes('live-concert'), 'le traitement de départ est exclu')
})

test('un angle qui ne nomme qu_un format ne compte pas comme une répétition', () => {
  // Un GIF South Park mène à d_autres GIF South Park : c_est la logique d_une
  // banque d_images. Le plafond de deux par format garde la variété.
  const { items } = buildWave(anchor(), [
    candidate('image', 'meme-gif', { channelKey: 'giphy:a' }),
    candidate('image', 'meme-gif', { channelKey: 'giphy:b' }),
    candidate('image', 'meme-gif', { channelKey: 'giphy:c' }),
    candidate('video', 'episode-extract'),
  ])
  assert.equal(items.filter((item) => item.type === 'image').length, 2, 'deux images, pas trois')
  assert.ok(items.some((item) => item.type === 'video'), 'le troisième est une vidéo')
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
  // Le seul candidat est du même auteur que le contenu de départ.
  const { items } = buildWave(anchor(), [candidate('image', 'meme-gif', { channelKey: 'giphy:southpark' })])
  assert.equal(items.length, 0)
})

test('accepts refuse le contenu de départ et ceux déjà vus', () => {
  const a = anchor()
  const vu = candidate('video', 'episode-extract')
  assert.equal(accepts(a, [], { ...vu, id: 'ancre' }, new Set()), false)
  assert.equal(accepts(a, [], vu, new Set([vu.id])), false)
  assert.equal(accepts(a, [], vu, new Set()), true)
})

// ---------------------------------------------------------------------------
// Disponibilité de la Wave, sans requête au clic
// ---------------------------------------------------------------------------

function fakeDb(rows: Array<{ _id: string; counts: Record<string, number> }>) {
  return {
    collection: () => ({ find: () => ({ toArray: async () => rows }) }),
  } as unknown as import('mongodb').Db
}

test('le bouton Wave s_affiche selon les compteurs, sans interroger le catalogue', async () => {
  const { hasWave, resetWaveAvailability } = await import('@/lib/v3/wave/available')
  resetWaveAvailability()

  const db = fakeDb([
    { _id: 'entity:south-park', counts: { video: 40, image: 12 } },
    { _id: 'topic:poterie', counts: { video: 2 } },
    { _id: 'entity:trop-rare', counts: { video: 1 } },
  ])

  assert.equal(await hasWave(db, [{ id: 'entity:south-park', role: 'primary', evidence: 'alias' }]), true)
  assert.equal(await hasWave(db, [{ id: 'topic:poterie', role: 'primary', evidence: 'alias' }]), true)
  assert.equal(
    await hasWave(db, [{ id: 'entity:trop-rare', role: 'primary', evidence: 'alias' }]),
    false,
    'un seul contenu ne fait pas une Wave',
  )
  assert.equal(await hasWave(db, []), false)
  assert.equal(await hasWave(db, undefined), false)
})

test('un sujet secondaire suffit à proposer la Wave', async () => {
  const { hasWave, resetWaveAvailability } = await import('@/lib/v3/wave/available')
  resetWaveAvailability()
  const db = fakeDb([{ _id: 'topic:moto', counts: { video: 30 } }])

  assert.equal(
    await hasWave(db, [
      { id: 'entity:inconnu', role: 'primary', evidence: 'alias' },
      { id: 'topic:moto', role: 'secondary', evidence: 'alias' },
    ]),
    true,
  )
})

test('des compteurs illisibles cachent le bouton plutôt que de promettre une Wave vide', async () => {
  const { hasWave, resetWaveAvailability } = await import('@/lib/v3/wave/available')
  resetWaveAvailability()
  const broken = {
    collection: () => ({ find: () => ({ toArray: async () => { throw new Error('indisponible') } }) }),
  } as unknown as import('mongodb').Db

  assert.equal(await hasWave(broken, [{ id: 'entity:south-park', role: 'primary', evidence: 'alias' }]), false)
})
