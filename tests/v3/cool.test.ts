import test from 'node:test'
import assert from 'node:assert/strict'

import { chooseSeed, doseNeighbours, wantedAround, LIKE_SHARE, type CoolSeed } from '@/lib/v3/cool/thread'
import type { WaveAnchor, WaveCandidate } from '@/lib/v3/wave/select'
import type { Angle, ItemType, Popularity } from '@/lib/v3/types'

function seed(id: string, kind: 'like' | 'editorial'): CoolSeed {
  return { id, kind, type: 'video', popularity: 'mid' }
}

function anchor(type: ItemType = 'video', channelKey = 'youtube:graine'): WaveAnchor {
  return {
    id: 'graine',
    type,
    title: 'Santana Europa live 1977',
    v3: {
      subjects: [{ id: 'entity:santana', role: 'primary', evidence: 'alias' }],
      universe: 'animation',
      angle: 'live-concert',
      channelKey,
    },
  }
}

let counter = 0
function candidate(
  type: ItemType,
  popularity: Popularity,
  options: { angle?: Angle; channelKey?: string; level?: 1 | 2 | 3 | 4 | 5; id?: string } = {},
): WaveCandidate {
  counter += 1
  return {
    id: options.id ?? `c${counter}`,
    type,
    title: `contenu ${counter}`,
    level: options.level ?? 1,
    v3: {
      subjects: [{ id: 'entity:santana', role: 'primary', evidence: 'alias' }],
      universe: 'animation',
      angle: options.angle ?? 'other',
      popularity,
      era: 'unknown',
      channelKey: options.channelKey ?? `auteur:${counter}`,
    },
  }
}

test('la dose : un contenu prouvé et deux découvertes sur les trois', () => {
  assert.deepEqual(wantedAround('mainstream'), ['discovery', 'discovery'])
  assert.deepEqual(wantedAround('known'), ['discovery', 'discovery'])
  assert.deepEqual(wantedAround('niche'), ['proven', 'discovery'])
  assert.deepEqual(wantedAround('unknown'), ['proven', 'discovery'])
})

test('graine prouvée : deux découvertes, même quand un contenu prouvé arrive avant dans la Wave', () => {
  const proven = candidate('video', 'mainstream')
  const image = candidate('image', 'unknown')
  const mid = candidate('video', 'mid')
  const { neighbours, dosed } = doseNeighbours(anchor(), 'known', [proven, image, mid], [])
  assert.deepEqual(neighbours.map((item) => item.id), [image.id, mid.id])
  assert.equal(dosed, true)
})

test('graine niche : un contenu prouvé d_abord, puis une découverte', () => {
  const image = candidate('image', 'unknown')
  const mid = candidate('video', 'mid')
  const known = candidate('video', 'known')
  const { neighbours, dosed } = doseNeighbours(anchor(), 'niche', [image, mid, known], [])
  assert.deepEqual(neighbours.map((item) => item.id), [known.id, image.id])
  assert.equal(dosed, true)
})

test('sans contenu prouvé dans la Wave, le fil existe quand même', () => {
  const image = candidate('image', 'unknown')
  const mid = candidate('video', 'mid')
  const { neighbours, dosed } = doseNeighbours(anchor(), 'niche', [image, mid], [])
  assert.equal(neighbours.length, 2)
  assert.equal(dosed, false)
})

test('les règles de la Wave tiennent : jamais l_auteur de la graine, jamais deux fois le même', () => {
  const sameAuthor = candidate('video', 'known', { channelKey: 'youtube:graine' })
  const first = candidate('image', 'unknown', { channelKey: 'giphy:archive' })
  const twin = candidate('video', 'mid', { channelKey: 'giphy:archive' })
  const other = candidate('video', 'niche')
  const { neighbours } = doseNeighbours(anchor(), 'niche', [sameAuthor, first, twin, other], [])
  assert.deepEqual(neighbours.map((item) => item.id), [first.id, other.id])
})

test('le fil est visuel : un texte de la Wave n_y entre pas', () => {
  const quote = candidate('quote', 'mid', { level: 1 })
  const video = candidate('video', 'niche')
  const image = candidate('image', 'unknown')
  const { neighbours } = doseNeighbours(anchor(), 'known', [quote, video, image], [])
  assert.deepEqual(neighbours.map((item) => item.id), [video.id, image.id])
})

test('ce que le visiteur a déjà vu ne revient pas', () => {
  const seen = candidate('video', 'niche', { id: 'deja-vu' })
  const fresh = candidate('video', 'niche')
  const image = candidate('image', 'unknown')
  const { neighbours } = doseNeighbours(anchor(), 'known', [seen, fresh, image], ['deja-vu'])
  assert.deepEqual(neighbours.map((item) => item.id), [fresh.id, image.id])
})

test('pas trois vidéos quand une image peut prendre la place', () => {
  const video1 = candidate('video', 'niche')
  const video2 = candidate('video', 'mid')
  const image = candidate('image', 'unknown')
  const { neighbours } = doseNeighbours(anchor('video'), 'known', [video1, video2, image], [])
  assert.deepEqual(neighbours.map((item) => item.id), [video1.id, image.id])

  // Faute d_image, trois vidéos valent mieux qu_un fil court.
  const onlyVideos = doseNeighbours(anchor('video'), 'known', [video1, video2], [])
  assert.equal(onlyVideos.neighbours.length, 2)
})

test('la graine : un like une fois sur trois, jamais une graine déjà vue', () => {
  const seeds = [seed('l1', 'like'), seed('l2', 'like'), seed('e1', 'editorial'), seed('e2', 'editorial')]
  const rolls = (values: number[]) => { let index = 0; return () => values[index++ % values.length] }

  assert.equal(chooseSeed(seeds, new Set(), rolls([LIKE_SHARE - 0.01, 0.99]))?.id, 'l2')
  assert.equal(chooseSeed(seeds, new Set(), rolls([LIKE_SHARE, 0]))?.id, 'e1')
  assert.equal(chooseSeed(seeds, new Set(['e1', 'e2']), rolls([0]))?.id, 'l1', 'sans éditorial, un like')
  assert.equal(chooseSeed(seeds, new Set(['l1', 'l2', 'e1', 'e2']), rolls([0])), null)
  assert.equal(chooseSeed(seeds, new Set(['l1']), rolls([0, 0]))?.id, 'l2', 'la graine vue est passée')

  // Le visiteur connaît les contenus par leur clé de session, pas par leur id.
  const keyed = [{ ...seed('l1', 'like'), contentKey: 'youtube:abc' }, seed('l2', 'like')]
  assert.equal(chooseSeed(keyed, new Set(['youtube:abc']), rolls([0, 0]))?.id, 'l2', 'la graine vue par sa clé est passée')
})
