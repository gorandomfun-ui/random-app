import test from 'node:test'
import assert from 'node:assert/strict'

import { computeRegisters, type LabelableRow } from '@/lib/v3/cool/registers'
import type { Angle, Era, Popularity, Universe } from '@/lib/v3/types'

function video(title: string, options: { universe?: Universe; angle?: Angle; era?: Era; popularity?: Popularity; provider?: string } = {}): LabelableRow {
  return {
    type: 'video', title, provider: options.provider ?? 'youtube',
    v3: { universe: options.universe ?? 'other', angle: options.angle ?? 'other', era: options.era ?? 'recent', popularity: options.popularity ?? 'known', usable: true },
  }
}
function image(title: string, universe: Universe = 'other', provider = 'giphy'): LabelableRow {
  return { type: 'image', title, provider, v3: { universe, angle: 'meme-gif', era: 'unknown', popularity: 'unknown', usable: true } }
}

test('gaming : tout l_univers gaming, quelle que soit l_audience ; jamais un stream', () => {
  assert.deepEqual(computeRegisters(video('Rygar - Arcade (1986)', { universe: 'gaming', popularity: 'mid' })), ['gaming'])
  assert.deepEqual(computeRegisters(video('Rygar - Arcade (1986)', { universe: 'music', popularity: 'mid' })), ['music'], 'pas gaming sans l_univers')
  assert.deepEqual(computeRegisters(video('Rygar gameplay', { universe: 'gaming', popularity: 'niche' })), ['gaming'], 'un grand étang : pas de mot du registre, pas de plancher d_audience')
  assert.deepEqual(computeRegisters(video('Minecraft arcade mod', { universe: 'gaming', popularity: 'known' })), ['gaming'], 'les gros jeux grand public en font partie')
  assert.deepEqual(computeRegisters(video('Fortnite stream tonight', { universe: 'gaming', popularity: 'known' })), [], 'un stream n_est pas un contenu')
})

test('archives : toute vidéo ancienne ; un GIF doit se dire vintage', () => {
  assert.deepEqual(computeRegisters(video('1970 New York, 35mm Archive Footage', { angle: 'tv-archive', era: 'retro', popularity: 'mid' })), ['archive'])
  assert.deepEqual(computeRegisters(video('Sunday afternoon at the lake', { era: 'retro', popularity: 'niche' })), ['archive'], 'ancien suffit')
  assert.deepEqual(computeRegisters(video('1970 New York, 35mm Archive Footage', { angle: 'tv-archive', era: 'recent', popularity: 'mid' })), [], 'pas ancien')
  assert.deepEqual(computeRegisters(video('Warner Home Video (2000-Present)', { angle: 'tv-archive', era: 'retro', popularity: 'mid' })), [], 'les logos de distributeurs sont exclus')
  assert.deepEqual(computeRegisters(video('Sonic 2 longplay', { universe: 'gaming', era: 'retro', popularity: 'mid' })), ['gaming'], 'le vieux gaming est du gaming')
})

test('musical : tout l_univers musique, un live comme un clip, sans lyrics ni podcast ni heure de', () => {
  assert.deepEqual(computeRegisters(video('David Bowie - Space Oddity, Live, 1969', { universe: 'music', angle: 'live-concert', popularity: 'known', era: 'retro' })), ['archive', 'music'])
  assert.deepEqual(computeRegisters(video('Unknown band, small bar, 2023', { universe: 'music', angle: 'other', popularity: 'niche' })), ['music'], 'connu ou non, angle ou pas')
  assert.deepEqual(computeRegisters(video('Abraham Mateo - Loco Enamorado (Letra)', { universe: 'music', angle: 'official-clip' })), [], 'lyric video')
  assert.deepEqual(computeRegisters(video('The Joe Budden Podcast Episode 923', { universe: 'music', angle: 'interview' })), [], 'podcast')
  assert.deepEqual(computeRegisters(video('Deep house mix 1 hour', { universe: 'music', angle: 'other' })), [], 'une heure de')
})

test('ailleurs : une autre écriture ou un mot de pays, jamais un épisode doublé', () => {
  assert.deepEqual(computeRegisters(video('チョコレートプラネット / THE FIRST TAKE', { universe: 'music', angle: 'official-clip', popularity: 'mainstream' })), ['music', 'elsewhere'])
  assert.deepEqual(computeRegisters(video('NCT WISH Surf MV', { universe: 'music', angle: 'official-clip', popularity: 'mainstream' })), ['music'], 'un titre latin sans mot de pays n_est pas ailleurs')
  assert.deepEqual(computeRegisters(video('Bollywood 90s love songs', { universe: 'music', angle: 'compilation', popularity: 'known' })), ['music', 'elsewhere'])
  assert.deepEqual(computeRegisters(video('Любит Не Любит 71 Серия (Русский Дубляж)', { universe: 'other', popularity: 'niche' })), [], 'une série doublée n_est pas ailleurs')
  assert.deepEqual(computeRegisters(video('पेडू में दर्द: pregnancy tips', { universe: 'people-everyday', popularity: 'known' })), [], 'la santé est exclue')
})

test('un GIF musical doit dire quelque chose de musical', () => {
  assert.deepEqual(computeRegisters(image('Katy Perry Dancing GIF by Stefanie Shank', 'music')), [], 'l_univers musique ne suffit pas à un GIF')
  assert.deepEqual(computeRegisters(image('Heavy Metal 80S GIF', 'music')), ['music'])
  assert.deepEqual(computeRegisters(image('Reggae Music GIF by Cidade Verde Sounds', 'music')), ['music'])
})

test('les GIFs cool : un des quarante mots dans le titre, jamais un mot bloqué', () => {
  assert.deepEqual(computeRegisters(image('Vintage Bubbling GIF')), ['archive', 'cool-words'], 'un GIF vintage est aussi une archive')
  assert.deepEqual(computeRegisters(image('Arcade Frogger GIF by NakNick', 'gaming')), ['gaming'])
  assert.deepEqual(computeRegisters(image('sexy nude vintage GIF')), [], 'mot bloqué')
  assert.deepEqual(computeRegisters(image('vintage pin-up photo', 'other', 'pexels')), [], 'jamais une image de stock')
})

test('ce qui sort tout le monde : non étiqueté, supprimé, spam de hashtags, univers news', () => {
  assert.deepEqual(computeRegisters({ type: 'video', title: 'Arcade classics', provider: 'youtube', v3: null }), [])
  assert.deepEqual(computeRegisters({ ...video('Rygar - Arcade (1986)', { universe: 'gaming', popularity: 'mid' }), isSuppressed: true }), [])
  assert.deepEqual(computeRegisters(video('#retro #arcade #games #shorts', { universe: 'gaming', popularity: 'mid' })), [])
  assert.deepEqual(computeRegisters(video('Arcade news archive footage', { universe: 'news-society', angle: 'tv-archive', era: 'retro', popularity: 'mid' })), [])
})
