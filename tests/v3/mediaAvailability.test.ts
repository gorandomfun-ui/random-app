import test from 'node:test'
import assert from 'node:assert/strict'

import {
  checkImageAvailability, dailymotionVerdict, dailymotionVideoId, fileVerdict, giphyImageId, giphyVerdict, tenorImageId, tenorVerdict,
} from '@/lib/v3/mediaAvailability'

test('Dailymotion : l_identifiant se lit dans ce que la base garde', () => {
  assert.equal(dailymotionVideoId({ videoId: 'dailymotion:x8abc12' }), 'x8abc12')
  assert.equal(dailymotionVideoId({ url: 'https://www.dailymotion.com/video/x8abc12_un-titre' }), 'x8abc12')
  assert.equal(dailymotionVideoId({ url: 'https://dai.ly/x8abc12' }), 'x8abc12')
  assert.equal(dailymotionVideoId({ url: 'https://www.dailymotion.com/embed/video/x8abc12?autoplay=1' }), 'x8abc12')
  assert.equal(dailymotionVideoId({ url: 'https://youtu.be/dQw4w9WgXcQ' }), null)
})

test('Dailymotion : réponses enregistrées → verdict', () => {
  const live = { id: 'x8abc12', status: 'published', private: false, published: true, allow_embed: true }
  assert.deepEqual(dailymotionVerdict(200, live), { checked: true, available: true })
  assert.deepEqual(dailymotionVerdict(404, null), { checked: true, available: false, reason: 'not-found' })
  assert.deepEqual(dailymotionVerdict(200, { ...live, private: true }), { checked: true, available: false, reason: 'not-public' })
  assert.deepEqual(dailymotionVerdict(200, { ...live, status: 'deleted' }), { checked: true, available: false, reason: 'not-public' })
  assert.deepEqual(dailymotionVerdict(200, { ...live, published: false }), { checked: true, available: false, reason: 'not-public' })
  assert.deepEqual(dailymotionVerdict(200, { ...live, allow_embed: false }), { checked: true, available: false, reason: 'not-embeddable' })
  assert.deepEqual(dailymotionVerdict(500, null), { checked: false, reason: 'request-failed' }, 'une panne du fournisseur ne condamne rien')
  assert.deepEqual(dailymotionVerdict(429, null), { checked: false, reason: 'request-failed' })
})

test('Giphy : l_identifiant vient de l_adresse du média ou de la page, et un 404 tranche même quand le fichier charge', () => {
  assert.equal(giphyImageId({ url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif' }), 'l0MYt5jPR6QX5pnqM')
  assert.equal(giphyImageId({ url: 'https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExOTg/3o7TKtnuHOHHUjR38Y/giphy.gif' }), '3o7TKtnuHOHHUjR38Y')
  assert.equal(giphyImageId({ url: 'https://i.example.com/x.gif', source: { url: 'https://giphy.com/gifs/dance-happy-abc123XYZ' } }), 'abc123XYZ')
  assert.equal(giphyImageId({ url: 'https://i.example.com/x.gif' }), null)
  const alive = { meta: { status: 200 }, data: { id: 'abc123XYZ', type: 'gif' } }
  assert.deepEqual(giphyVerdict(200, alive), { checked: true, available: true })
  assert.deepEqual(giphyVerdict(404, { meta: { status: 404, msg: 'Not Found' }, data: {} }), { checked: true, available: false, reason: 'gone' })
  assert.deepEqual(giphyVerdict(200, { meta: { status: 200 }, data: {} }), { checked: true, available: false, reason: 'gone' }, 'une réponse vide est un GIF disparu')
  assert.deepEqual(giphyVerdict(429, { meta: { status: 429 } }), { checked: false, reason: 'request-failed' }, 'la limite du fournisseur ne condamne rien')
})

test('Tenor : l_identifiant de la page, une liste vide = disparu', () => {
  assert.equal(tenorImageId({ url: 'https://media.tenor.com/abc/tenor.gif', pageUrl: 'https://tenor.com/view/cat-dance-gif-12345678' }), '12345678')
  assert.equal(tenorImageId({ url: 'https://media.tenor.com/abc/tenor.gif' }), null)
  assert.deepEqual(tenorVerdict(200, { results: [{ id: '12345678' }] }), { checked: true, available: true })
  assert.deepEqual(tenorVerdict(200, { results: [] }), { checked: true, available: false, reason: 'gone' })
  assert.deepEqual(tenorVerdict(503, null), { checked: false, reason: 'request-failed' })
})

test('un fichier : 404 ou 410 = disparu, une erreur serveur = pas de verdict', () => {
  assert.deepEqual(fileVerdict(200), { checked: true, available: true })
  assert.deepEqual(fileVerdict(301), { checked: true, available: true })
  assert.deepEqual(fileVerdict(404), { checked: true, available: false, reason: 'gone' })
  assert.deepEqual(fileVerdict(410), { checked: true, available: false, reason: 'gone' })
  assert.deepEqual(fileVerdict(500), { checked: false, reason: 'request-failed' })
})

test('la vérification d_une image suit son fournisseur, sans clé elle ne tranche pas', async () => {
  const calls: string[] = []
  const request = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    if (url.includes('api.giphy.com')) return { ok: false, status: 404, json: async () => ({ meta: { status: 404 }, data: {} }) } as unknown as Response
    if (url.includes('tenor.googleapis.com')) return { ok: true, status: 200, json: async () => ({ results: [] }) } as unknown as Response
    return { ok: false, status: 404, json: async () => null } as unknown as Response
  }) as typeof fetch
  const previousGiphy = process.env.GIPHY_API_KEY
  const previousTenor = process.env.TENOR_API_KEY
  process.env.GIPHY_API_KEY = 'test'
  process.env.TENOR_API_KEY = 'test'
  try {
    assert.deepEqual(await checkImageAvailability({ provider: 'giphy', url: 'https://media.giphy.com/media/abc123XYZ/giphy.gif' }, request), { checked: true, available: false, reason: 'gone' })
    assert.deepEqual(await checkImageAvailability({ provider: 'tenor', url: 'https://media.tenor.com/x/y.gif', pageUrl: 'https://tenor.com/view/a-gif-123456' }, request), { checked: true, available: false, reason: 'gone' })
    assert.deepEqual(await checkImageAvailability({ provider: 'pexels', url: 'https://images.pexels.com/photos/1/x.jpeg' }, request), { checked: true, available: false, reason: 'gone' })
    assert.ok(calls.some((call) => call.startsWith('HEAD https://images.pexels.com')), 'un fichier se vérifie en HEAD')
    assert.deepEqual(await checkImageAvailability({ provider: 'unsplash', url: 'https://images.unsplash.com/x' }, request), { checked: false, reason: 'no-id' })
    delete process.env.GIPHY_API_KEY
    assert.deepEqual(await checkImageAvailability({ provider: 'giphy', url: 'https://media.giphy.com/media/abc123XYZ/giphy.gif' }, request), { checked: false, reason: 'no-api-key' })
  } finally {
    if (previousGiphy === undefined) delete process.env.GIPHY_API_KEY; else process.env.GIPHY_API_KEY = previousGiphy
    if (previousTenor === undefined) delete process.env.TENOR_API_KEY; else process.env.TENOR_API_KEY = previousTenor
  }
})
