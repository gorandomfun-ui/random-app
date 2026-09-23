import test from 'node:test'
import assert from 'node:assert/strict'

import { nicheFallback, pickZone, registerFor } from '@/lib/v3/cool/start'
import type { LikeZone } from '@/lib/v3/cool/likes'

const rolls = (values: number[]) => { let index = 0; return () => values[index++ % values.length] }

test('ce qu_une source du sac veut dire pour un format', () => {
  assert.equal(registerFor('gaming', 'video', rolls([0])), 'gaming')
  assert.equal(registerFor('music', 'image', rolls([0])), 'music')
  assert.equal(registerFor('oldschool', 'video', rolls([0.9])), 'archive', 'une vidéo old school est une archive')
  assert.equal(registerFor('oldschool', 'image', rolls([0.2])), 'archive')
  assert.equal(registerFor('oldschool', 'image', rolls([0.8])), 'cool-words', 'une image old school peut être un GIF vintage')
})

test('quand une source n_a rien, le repli n_est jamais gaming', () => {
  for (const roll of [0, 0.3, 0.6, 0.99]) {
    assert.notEqual(nicheFallback('video', rolls([roll])), 'gaming')
    assert.notEqual(nicheFallback('image', rolls([roll])), 'gaming')
  }
  assert.equal(nicheFallback('image', rolls([0.99])), 'cool-words')
  assert.equal(nicheFallback('video', rolls([0.99])), 'elsewhere')
})

test('la zone d_un like : son sujet nommé, son auteur ou son genre, selon ce qu_il a', () => {
  const full: LikeZone = { id: 'l', type: 'video', subjectIds: ['entity:santana'], channelKey: 'youtube:UC1', universe: 'music', angle: 'live-concert', era: 'retro' }
  assert.equal(pickZone(full, rolls([0])), 'like-subject')
  assert.equal(pickZone(full, rolls([0.5])), 'like-channel')
  assert.equal(pickZone(full, rolls([0.99])), 'like-genre')
  const bare: LikeZone = { ...full, subjectIds: [], channelKey: undefined }
  assert.equal(pickZone(bare, rolls([0])), 'like-genre', 'sans sujet ni auteur, le genre')
  const vague: LikeZone = { ...bare, angle: 'other' }
  assert.equal(pickZone(vague, rolls([0])), null, 'un genre qui ne dit rien n_est pas une zone')
  const news: LikeZone = { ...bare, universe: 'news-society', angle: 'mainstream-report' }
  assert.equal(pickZone(news, rolls([0])), null, 'jamais les news')
})

test('la tendance retombe en niche quand la ligne est mince ; une niche ne retombe jamais en tendance ni en likes', async () => {
  const { drawStart } = await import('@/lib/v3/cool/start')
  const { fakeDb, fakeVideo } = await import('../support/fakeDb')
  const registers = [fakeVideo('gaming'), fakeVideo('archive'), fakeVideo('music'), fakeVideo('elsewhere')]
  const trend = await drawStart(fakeDb(registers), { type: 'video', source: 'trend', random: rolls([0.1, 0.2, 0.3]) })
  assert.ok(trend)
  assert.equal(trend.asked, 'trend')
  assert.equal(trend.fallback, true, 'sans vidéo tendance, le tirage le dit')
  assert.ok(['archive', 'music', 'elsewhere'].includes(trend.source), `le repli est une niche qui n_est pas gaming : ${trend.source}`)

  const like = await drawStart(fakeDb(registers), { type: 'video', source: 'like', random: rolls([0.1]) })
  assert.ok(like)
  assert.equal(like.fallback, true, 'sans zone de like, le tirage retombe en niche')
  assert.notEqual(like.source, 'gaming')

  const trending = fakeVideo('archive', { v3: { registers: ['archive'], line: 'trend', popularity: 'mid', usable: true } })
  const niche = await drawStart(fakeDb([...registers, trending]), { type: 'video', source: 'niche', niche: 'music', random: rolls([0.1]) })
  assert.ok(niche)
  assert.equal(niche.source, 'music')
  assert.equal(niche.niche, 'music')
  assert.equal(niche.fallback, false)

  const gaming = await drawStart(fakeDb([...registers, trending]), { type: 'video', source: 'niche', niche: 'gaming', random: rolls([0.1]) })
  assert.equal(gaming?.source, 'gaming', 'une niche gaming demandée par le sac est servie')
})

test('la zone genre d_un like lit un lot borné de l_univers et n_en garde que l_angle et l_époque du like', async () => {
  const { drawStart } = await import('@/lib/v3/cool/start')
  const { fakeDb, fakeVideo } = await import('../support/fakeDb')
  const { __setLikeZonesForTests } = await import('@/lib/v3/cool/likes')
  __setLikeZonesForTests([{ id: 'like-1', type: 'video', subjectIds: [], universe: 'music', angle: 'live-concert', era: 'retro' }])
  try {
    const rows = [
      fakeVideo('music', { v3: { registers: ['music'], universe: 'music', angle: 'official-clip', era: 'recent', usable: true } }),
      fakeVideo('music', { v3: { registers: ['music'], universe: 'music', angle: 'live-concert', era: 'retro', usable: true } }),
      fakeVideo('music', { v3: { registers: ['music'], universe: 'music', angle: 'live-concert', era: 'recent', usable: true } }),
      fakeVideo('archive'),
    ]
    const drawn = await drawStart(fakeDb(rows), { type: 'video', source: 'like', random: rolls([0, 0.99, 0]) })
    assert.ok(drawn)
    assert.equal(drawn.source, 'like-genre')
    assert.equal(drawn.fallback, false)
    for (const row of drawn.rows) {
      const v3 = row.v3 as { angle: string; era: string }
      assert.equal(v3.angle, 'live-concert')
      assert.equal(v3.era, 'retro')
    }
  } finally {
    __setLikeZonesForTests(null)
  }
})

test('la tendance retombe d_abord sur le récent, puis sur une niche ; le récent ne retombe jamais en tendance', async () => {
  const { drawStart } = await import('@/lib/v3/cool/start')
  const { fakeDb, fakeVideo } = await import('../support/fakeDb')
  const NOW = Date.UTC(2026, 8, 23)
  const modern = (register: string, extra: Record<string, unknown> = {}) => fakeVideo(register, { publishedAt: new Date(NOW - 90 * 86_400_000), v3: { registers: [register], era: 'recent', popularity: 'known', usable: true }, ...extra })
  const rows = [
    modern('music'),
    modern('elsewhere', { title: 'Vieille vidéo', publishedAt: new Date(NOW - 5 * 365 * 86_400_000) }),
    modern('music', { title: 'ASMR feet licking' }),
    modern('music', { title: 'ミュージックビデオ' }),
    modern('music', { v3: { registers: ['music'], era: 'recent', popularity: 'niche', usable: true } }),
    fakeVideo('archive'),
  ]
  const trend = await drawStart(fakeDb(rows), { type: 'video', source: 'trend', random: rolls([0.1, 0.2]), now: NOW })
  assert.ok(trend)
  assert.equal(trend.source, 'recent', 'pas de tendance : le récent avant les archives')
  assert.equal(trend.fallback, true)
  assert.equal(trend.rows.length, 1, 'seul le contenu de cette année, connu, au titre propre et latin, passe')
  assert.equal(trend.rows[0].title, rows[0].title)

  const recent = await drawStart(fakeDb(rows), { type: 'video', source: 'recent', random: rolls([0.1]), now: NOW })
  assert.equal(recent?.source, 'recent')
  assert.equal(recent?.fallback, false)

  const nothingModern = await drawStart(fakeDb([fakeVideo('archive')]), { type: 'video', source: 'recent', random: rolls([0.1, 0.1]), now: NOW })
  assert.equal(nothingModern?.source, 'archive', 'sans récent, une niche')
  assert.equal(nothingModern?.fallback, true)

  // Une image n'a pas de date : récente si elle est entrée dans l'année, jamais des registres du vieux.
  const gif = (title: string, extra: Record<string, unknown> = {}) => ({ ...fakeVideo('music'), type: 'image', provider: 'giphy', url: `https://media.giphy.com/media/${title.replace(/\W/g, '')}/giphy.gif`, title, createdAt: new Date(NOW - 60 * 86_400_000), v3: { registers: [], era: 'unknown', popularity: 'unknown', usable: true }, ...extra })
  const images = [gif('Serena Williams Sport GIF by Team USA'), gif('vintage tv GIF', { v3: { registers: ['cool-words'], era: 'unknown', popularity: 'unknown', usable: true } }), gif('old GIF', { createdAt: new Date(NOW - 3 * 365 * 86_400_000) }), gif('sexy ted GIF')]
  // A point of zero: the fake rows carry small rand values, and a seek past them would read nothing before wrapping.
  const image = await drawStart(fakeDb(images), { type: 'image', source: 'trend', random: rolls([0, 0]), now: NOW })
  assert.equal(image?.source, 'recent', 'un ticket tendance en image retombe sur le récent, pas sur les archives')
  assert.equal(image?.rows.length, 1)
  assert.equal(image?.rows[0].title, 'Serena Williams Sport GIF by Team USA')
})

test('la zone auteur d_un like part d_un point aléatoire, pas toujours des trente mêmes vidéos', async () => {
  const { drawStart } = await import('@/lib/v3/cool/start')
  const { fakeDb, fakeVideo } = await import('../support/fakeDb')
  const { __setLikeZonesForTests } = await import('@/lib/v3/cool/likes')
  __setLikeZonesForTests([{ id: 'like-2', type: 'video', subjectIds: [], channelKey: 'youtube:UCauteur', universe: 'other', angle: 'other', era: 'recent' }])
  try {
    const rows = Array.from({ length: 80 }, (_, index) => fakeVideo('music', { title: `Vidéo ${index} de l_auteur`, v3: { registers: ['music'], channelKey: 'youtube:UCauteur', usable: true } }))
    const early = await drawStart(fakeDb(rows), { type: 'video', source: 'like', random: rolls([0, 0.5, 0]) })
    const late = await drawStart(fakeDb(rows), { type: 'video', source: 'like', random: rolls([0, 0.5, 0.99]) })
    assert.equal(early?.source, 'like-channel')
    assert.equal(late?.source, 'like-channel')
    const index = (row: Record<string, unknown>) => Number(/Vidéo (\d+)/.exec(String(row.title))?.[1])
    assert.ok(early!.rows.every((row) => index(row) < 30), 'un point bas lit le début')
    assert.ok(late!.rows.every((row) => index(row) >= 50), 'un point haut lit la fin')
  } finally {
    __setLikeZonesForTests(null)
  }
})
