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
