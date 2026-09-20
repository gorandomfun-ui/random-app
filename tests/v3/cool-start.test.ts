import test from 'node:test'
import assert from 'node:assert/strict'

import { pickSource, pickZone } from '@/lib/v3/cool/start'
import type { LikeZone } from '@/lib/v3/cool/likes'

const rolls = (values: number[]) => { let index = 0; return () => values[index++ % values.length] }

test('une source au hasard : les registres et les likes pèsent pareil', () => {
  assert.equal(pickSource('video', true, rolls([0])), 'gaming')
  assert.equal(pickSource('video', true, rolls([0.99])), 'like', 'un like : la cinquième source d_une vidéo')
  assert.equal(pickSource('video', false, rolls([0.99])), 'elsewhere', 'sans like, les quatre registres')
  assert.equal(pickSource('image', true, rolls([0.99])), 'like', 'la sixième source d_une image')
  assert.equal(pickSource('image', false, rolls([0.99])), 'cool-words', 'les GIFs cool sont un registre d_image')
  assert.equal(pickSource('video', false, rolls([0.5])), 'music')
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
