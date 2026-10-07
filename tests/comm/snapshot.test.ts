import test from 'node:test'
import assert from 'node:assert/strict'

import { authorOf, giphyMp4Of, isoDurationSeconds, licenseHintOf, providerLabel, snapshotFromRow, subjectRefsOf, withLabels } from '@/lib/comm/snapshot'
import { clipMaxSeconds, queueMax } from '@/lib/comm/model'

test('une durée ISO devient des secondes ; un nombre est déjà des secondes', () => {
  assert.equal(isoDurationSeconds('PT20S'), 20)
  assert.equal(isoDurationSeconds('PT1H2M3S'), 3723)
  assert.equal(isoDurationSeconds('PT87S'), 87)
  assert.equal(isoDurationSeconds(42), 42)
  assert.equal(isoDurationSeconds('n/a'), null)
  assert.equal(isoDurationSeconds(undefined), null)
})

test('la pastille de licence suit le provider : permissif, partage, prudence', () => {
  assert.equal(licenseHintOf('pexels', 'image'), 'permissif')
  assert.equal(licenseHintOf('giphy', 'image'), 'partage')
  assert.equal(licenseHintOf('youtube', 'video'), 'prudence')
  assert.equal(licenseHintOf('commoncrawl', 'web'), 'prudence')
  assert.equal(licenseHintOf('wikiquote', 'quote'), 'partage')
})

test('le crédit : la chaîne YouTube, la chaîne Dailymotion seulement réparée, le site par son hôte, rien pour une banque d_images', () => {
  assert.equal(authorOf({ channelTitle: 'Retro Busker' }, 'video', 'youtube'), 'Retro Busker')
  assert.equal(authorOf({ channelTitle: 'school' }, 'video', 'dailymotion'), '')
  assert.equal(authorOf({ channelTitle: 'aphexcmc', authorRepairedAt: new Date() }, 'video', 'dailymotion'), 'aphexcmc')
  assert.equal(authorOf({ url: 'https://www.00h01.fr/' }, 'web', 'commoncrawl'), '00h01.fr')
  assert.equal(authorOf({ source: { name: 'Pexels', url: 'https://www.pexels.com/photo/1/' } }, 'image', 'pexels'), '')
})

test('le snapshot d_une vidéo YouTube : titre, lien, chaîne, durée, auteur exigé', () => {
  const built = snapshotFromRow({ type: 'video', provider: 'youtube', title: 'Un titre', url: 'https://youtu.be/abc', thumb: 'https://i.ytimg.com/vi/abc/hqdefault.jpg', channelTitle: 'Retro Busker', duration: 'PT20S', source: { name: 'YouTube', url: 'https://youtu.be/abc' } })
  assert.ok(built)
  assert.equal(built.contentType, 'video')
  assert.equal(built.licenseHint, 'prudence')
  assert.equal(built.snapshot.author, 'Retro Busker')
  assert.equal(built.snapshot.durationSec, 20)
  assert.equal(built.snapshot.sourceUrl, 'https://youtu.be/abc')
  assert.equal(built.snapshot.providerLabel, 'YouTube')
  assert.equal(built.snapshot.authorRequired, true)
  assert.equal(built.snapshot.text, null)
})

test('le snapshot d_une image Pexels : la page d_origine est la source, l_auteur reste facultatif', () => {
  const built = snapshotFromRow({ type: 'image', provider: 'pexels', url: 'https://images.pexels.com/photos/1/pexels-photo-1.jpeg', thumb: 'https://images.pexels.com/photos/1/pexels-photo-1.jpeg?h=350', source: { name: 'Pexels', url: 'https://www.pexels.com/photo/a-man-1/' } })
  assert.ok(built)
  assert.equal(built.snapshot.sourceUrl, 'https://www.pexels.com/photo/a-man-1/')
  assert.equal(built.snapshot.author, '')
  assert.equal(built.snapshot.authorRequired, false)
  assert.equal(built.snapshot.title, 'Sans titre')
})

test('un GIF Giphy connaît son mp4 ; un GIF Tenor non', () => {
  assert.equal(giphyMp4Of('https://media3.giphy.com/media/3kzJvEciJa94SMW3hN/giphy.gif?cid=abc'), 'https://media3.giphy.com/media/3kzJvEciJa94SMW3hN/giphy.mp4')
  assert.equal(giphyMp4Of('https://media.tenor.com/A_fnl8sv-mIAAAAC/retro-suriya.gif'), null)
  const built = snapshotFromRow({ type: 'image', provider: 'giphy', url: 'https://media3.giphy.com/media/x/giphy.gif', source: { name: 'Giphy', url: 'https://giphy.com/gifs/x' } })
  assert.equal(built?.snapshot.gifMp4, 'https://media3.giphy.com/media/x/giphy.mp4')
  assert.equal(built?.licenseHint, 'partage')
})

test('une citation ou un site gardent leur texte ; un type inconnu est refusé', () => {
  const quote = snapshotFromRow({ type: 'quote', provider: 'wikiquote', text: 'Simplicity is the soul of efficiency.', author: 'Austin Freeman', source: { name: 'Wikiquote', url: 'https://wikiquote.org/x' } })
  assert.equal(quote?.snapshot.text, 'Simplicity is the soul of efficiency.')
  assert.equal(quote?.snapshot.author, 'Austin Freeman')
  assert.equal(quote?.snapshot.title, 'Simplicity is the soul of efficiency.')
  const web = snapshotFromRow({ type: 'web', provider: 'commoncrawl', url: 'http://00h01.fr/', host: '00h01.fr', title: '00h01.fr', text: 'Un site', ogImage: 'https://storage.googleapis.com/x/preview.png' })
  assert.equal(web?.snapshot.thumb, 'https://storage.googleapis.com/x/preview.png')
  assert.equal(web?.snapshot.author, '00h01.fr')
  assert.equal(snapshotFromRow({ type: 'minigame' }), null)
})

test('les sujets v3 sont copiés avec leur libellé', () => {
  const refs = subjectRefsOf({ v3: { subjects: [{ id: 'topic:moto', role: 'primary' }, { id: 'entity:x' }, { nope: 1 }] } })
  assert.deepEqual(refs, [{ id: 'topic:moto', role: 'primary' }, { id: 'entity:x', role: 'secondary' }])
  const labelled = withLabels(refs, new Map([['topic:moto', 'moto']]))
  assert.deepEqual(labelled.map((s) => s.label), ['moto', 'x'])
  assert.equal(providerLabel('dailymotion'), 'Dailymotion')
  assert.equal(providerLabel('google-cse', 'Google'), 'Google')
})

test('les plafonds viennent de l_environnement, avec des défauts sûrs', () => {
  const saved = { q: process.env.NEXT_PUBLIC_COMM_QUEUE_MAX, c: process.env.NEXT_PUBLIC_COMM_CLIP_MAX_SECONDS }
  delete process.env.NEXT_PUBLIC_COMM_QUEUE_MAX; delete process.env.NEXT_PUBLIC_COMM_CLIP_MAX_SECONDS
  assert.equal(queueMax(), 30); assert.equal(clipMaxSeconds(), 60)
  process.env.NEXT_PUBLIC_COMM_QUEUE_MAX = '12'; process.env.NEXT_PUBLIC_COMM_CLIP_MAX_SECONDS = '0'
  assert.equal(queueMax(), 12); assert.equal(clipMaxSeconds(), 60)
  if (saved.q != null) process.env.NEXT_PUBLIC_COMM_QUEUE_MAX = saved.q; else delete process.env.NEXT_PUBLIC_COMM_QUEUE_MAX
  if (saved.c != null) process.env.NEXT_PUBLIC_COMM_CLIP_MAX_SECONDS = saved.c; else delete process.env.NEXT_PUBLIC_COMM_CLIP_MAX_SECONDS
})
