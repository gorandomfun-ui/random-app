import test from 'node:test'
import assert from 'node:assert/strict'

import { idsOf, lookupAuthor } from '@/lib/comm/authorLookup'

const env = { YOUTUBE_API_KEY: 'yt', PEXELS_API_KEY: 'px', PIXABAY_API_KEY: 'pb', GIPHY_API_KEY: 'gf' } as unknown as NodeJS.ProcessEnv

function fakeFetch(answer: (url: string) => unknown): typeof fetch {
  return (async (url: string | URL | Request) => new Response(JSON.stringify(answer(String(url))), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch
}

test('les identifiants se lisent dans les adresses de chaque provider', () => {
  assert.deepEqual(idsOf({ provider: 'youtube', url: 'https://youtu.be/aFniMntPUbc', sourceUrl: '' }), { youtube: 'aFniMntPUbc' })
  assert.deepEqual(idsOf({ provider: 'youtube', url: 'x', sourceUrl: '', videoId: 'JsG29hIWuOQ' }), { youtube: 'JsG29hIWuOQ' })
  assert.deepEqual(idsOf({ provider: 'dailymotion', url: 'https://www.dailymotion.com/video/xe41mj', sourceUrl: '', videoId: 'dailymotion:xe41mj' }), { dailymotion: 'xe41mj' })
  assert.deepEqual(idsOf({ provider: 'pexels', url: 'https://images.pexels.com/photos/5851779/pexels-photo-5851779.jpeg?auto=compress', sourceUrl: 'https://www.pexels.com/photo/a-man-5851779/' }), { pexels: '5851779' })
  assert.deepEqual(idsOf({ provider: 'pixabay', url: 'https://cdn.pixabay.com/photo/2017/10/16/02/54/clouds-2855991_1280.jpg', sourceUrl: 'https://pixabay.com/photos/clouds-2855991/' }), { pixabay: '2855991' })
  assert.deepEqual(idsOf({ provider: 'giphy', url: 'https://media3.giphy.com/media/3kzJvEciJa94SMW3hN/giphy.gif', sourceUrl: '' }), { giphy: '3kzJvEciJa94SMW3hN' })
  assert.deepEqual(idsOf({ provider: 'tenor', url: 'https://media.tenor.com/x/y.gif', sourceUrl: '' }), {})
})

test('la chaîne YouTube, le photographe Pexels, l_utilisateur Pixabay, le compte Giphy ; rien sans clé ni réponse', async () => {
  const yt = fakeFetch(() => ({ items: [{ id: 'aFniMntPUbc', snippet: { title: 'T', channelTitle: 'Retro Busker', publishedAt: '2020-01-01T00:00:00Z' } }] }))
  assert.equal(await lookupAuthor({ provider: 'youtube', url: 'https://youtu.be/aFniMntPUbc', sourceUrl: '' }, yt, env), 'Retro Busker')
  const px = fakeFetch(() => ({ photographer: 'Jane Doe' }))
  assert.equal(await lookupAuthor({ provider: 'pexels', url: 'https://images.pexels.com/photos/1/pexels-photo-1.jpeg', sourceUrl: '' }, px, env), 'Jane Doe')
  const pb = fakeFetch(() => ({ hits: [{ user: 'cloudlover' }] }))
  assert.equal(await lookupAuthor({ provider: 'pixabay', url: 'https://cdn.pixabay.com/photo/2017/10/16/02/54/clouds-2855991_1280.jpg', sourceUrl: '' }, pb, env), 'cloudlover')
  const gf = fakeFetch(() => ({ data: { username: 'shagarita', user: { display_name: 'Shagarita' } } }))
  assert.equal(await lookupAuthor({ provider: 'giphy', url: 'https://media3.giphy.com/media/QmQ6LT0tuuxOE1afE5/giphy.gif', sourceUrl: '' }, gf, env), 'Shagarita')
  assert.equal(await lookupAuthor({ provider: 'youtube', url: 'https://youtu.be/aFniMntPUbc', sourceUrl: '' }, yt, {} as NodeJS.ProcessEnv), null, 'sans clé, rien')
  const broken = (async () => { throw new Error('down') }) as unknown as typeof fetch
  assert.equal(await lookupAuthor({ provider: 'youtube', url: 'https://youtu.be/aFniMntPUbc', sourceUrl: '' }, broken, env), null, 'une panne ne casse rien')
})
