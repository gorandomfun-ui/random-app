import test from 'node:test'
import assert from 'node:assert/strict'

import { authorMissing, buildCaption, cleanTitle, creditLineOf, normalizeHashtag, seedPhrases, shortUrl, sourceLineOf, suggestHashtags, xLength } from '@/lib/comm/caption'
import { DESTINATION_SPECS, destinationSpec, formatSpec } from '@/lib/comm/destinations'
import { validPhrase } from '@/lib/comm/phraseStore'
import type { QueueSnapshot } from '@/lib/comm/model'

const youtube: QueueSnapshot = { title: '#unitedbydance #vielfalt Un busker RÉTRO | Chaîne', url: 'https://youtu.be/abc', sourceUrl: 'https://youtu.be/abc', thumb: null, author: 'Retro Busker', provider: 'youtube', providerLabel: 'YouTube', durationSec: 20, authorRequired: true, gifMp4: null, text: null }
const pexels: QueueSnapshot = { ...youtube, title: '', author: '', provider: 'pexels', providerLabel: 'Pexels', sourceUrl: 'https://www.pexels.com/photo/a-man-under-a-sheet-5851779/', authorRequired: false }

test('le crédit : l_auteur, ou celui tapé à la main, ou le provider quand sa licence s_en contente', () => {
  assert.equal(creditLineOf(youtube), 'Retro Busker')
  assert.equal(creditLineOf({ ...youtube, author: '' }), '', 'YouTube sans chaîne : rien, et c’est bloquant')
  assert.equal(creditLineOf({ ...youtube, author: '' }, 'Quelqu’un'), 'Quelqu’un')
  assert.equal(creditLineOf(pexels), 'Pexels')
  assert.equal(authorMissing({ ...youtube, author: '' }), true); assert.equal(authorMissing({ ...youtube, author: '' }, 'X'), false); assert.equal(authorMissing(pexels), false)
})

test('la source sur l_image : le provider et l_adresse courte', () => {
  assert.equal(sourceLineOf(youtube), 'YouTube · youtu.be/abc')
  assert.equal(sourceLineOf(pexels), 'Pexels · pexels.com/photo/a-man-under-a-sheet-5851779')
  assert.equal(shortUrl('https://www.example.com/a/very/long/path/that/keeps/going/and/going/forever/and/ever'), 'example.com/a/very/long/path/that/keeps/going…')
  assert.equal(shortUrl('nope'), 'nope')
})

test('le titre nettoyé perd ses hashtags et ses cris', () => {
  assert.equal(cleanTitle(youtube.title), 'Un busker RÉTRO')
  assert.equal(cleanTitle('UN TITRE QUI CRIE'), 'Un titre qui crie')
  assert.equal(cleanTitle('x'.repeat(200)).length, 118)
})

test('les hashtags viennent des sujets, normalisés, sans doublon, avec la marque', () => {
  assert.equal(normalizeHashtag('Retro Busker'), '#RetroBusker'); assert.equal(normalizeHashtag('moto'), '#Moto'); assert.equal(normalizeHashtag('été à Paris'), '#EteAParis')
  assert.equal(normalizeHashtag('12'), null); assert.equal(normalizeHashtag('!!'), null)
  assert.deepEqual(suggestHashtags([{ id: 'a', label: 'moto', role: 'primary' }, { id: 'b', label: 'Moto', role: 'secondary' }, { id: 'c', label: 'Retro Busker', role: 'secondary' }]), ['#Moto', '#RetroBusker', '#Random', '#GoRandom'])
})

test('la légende : titre et phrase, puis crédit, lien source, lien dans la bio avec le numéro, jamais une page Random', () => {
  const caption = buildCaption({ destination: 'instagram', format: 'post', title: youtube.title, phrase: 'Trouvé sur Random', snapshot: youtube, number: 12, hashtags: ['#Moto', '#Random'] })
  assert.deepEqual(caption.mandatory, ['Retro Busker · YouTube', 'https://youtu.be/abc', 'Lien dans la bio · n° 12'])
  assert.equal(caption.text, 'Un busker RÉTRO\nTrouvé sur Random\n\nRetro Busker · YouTube\nhttps://youtu.be/abc\nLien dans la bio · n° 12\n\n#Moto #Random')
  assert.ok(!caption.text.includes('gorandom.fun')); assert.equal(caption.limit, 2200); assert.equal(caption.overLimit, false)
  const home = buildCaption({ destination: 'instagram', format: 'post', title: '', phrase: '', snapshot: youtube, number: null, hashtags: [], homeUrl: 'https://gorandom.fun/' })
  assert.ok(home.text.includes('Découvert sur Random · gorandom.fun')); assert.ok(home.text.includes('Lien dans la bio\n'))
})

test('sur X, le lien est cliquable, pas de bio ; la longueur compte un lien pour 23', () => {
  const caption = buildCaption({ destination: 'x', format: 'post', title: 'Titre', phrase: '', snapshot: youtube, number: 3, hashtags: [] })
  assert.deepEqual(caption.mandatory, ['Retro Busker · YouTube', 'https://youtu.be/abc'])
  assert.equal(caption.limit, 280); assert.equal(xLength('a https://youtu.be/abc b'), 27)
  const long = buildCaption({ destination: 'x', format: 'post', title: 'x'.repeat(120), phrase: 'y'.repeat(120), snapshot: youtube, number: 3, hashtags: ['#A', '#B', '#C', '#D'] })
  assert.equal(long.overLimit, true); assert.equal(long.tooManyHashtags, true)
})

test('trois destinations, Instagram seule en direct ; chaque format porte ses contraintes', () => {
  assert.deepEqual(DESTINATION_SPECS.map((d) => `${d.key}:${d.direct}`), ['instagram:true', 'tiktok:false', 'x:false'])
  assert.equal(formatSpec('instagram', 'story')?.slides.max, 10); assert.equal(formatSpec('instagram', 'reel')?.media, 'video'); assert.equal(formatSpec('tiktok', 'video')?.maxSeconds, 60)
  assert.equal(formatSpec('reddit', 'link'), null); assert.equal(destinationSpec('x')?.linkInBio, false)
})

test('les phrases de départ : 20 à 30, français et anglais, cinq familles ; une phrase vide n_est admise que dans la famille vide', () => {
  const seeds = seedPhrases()
  assert.ok(seeds.length >= 20 && seeds.length <= 30, String(seeds.length))
  assert.deepEqual([...new Set(seeds.map((p) => p.family))].sort(), ['decouverte', 'invitation', 'reaction', 'serie', 'vide'])
  assert.ok(seeds.some((p) => p.lang === 'fr') && seeds.some((p) => p.lang === 'en'))
  assert.ok(validPhrase({ family: 'reaction', lang: 'fr', text: 'Oh.' })); assert.equal(validPhrase({ family: 'reaction', lang: 'fr', text: '  ' }), null); assert.ok(validPhrase({ family: 'vide', lang: 'fr', text: '' })); assert.equal(validPhrase({ family: 'x', lang: 'fr', text: 'a' }), null)
})
