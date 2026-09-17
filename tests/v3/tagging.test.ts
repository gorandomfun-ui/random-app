import test from 'node:test'
import assert from 'node:assert/strict'

import { detectAngle } from '@/lib/v3/tagging/angle'
import {
  channelKey,
  classifyEra,
  classifyPopularity,
  isCategoryMasqueradingAsChannel,
  isUsableItem,
  yearFromTitle,
} from '@/lib/v3/tagging/classify'
import { containsAlias, comboId, needsSecondClue, normalize, subjectId } from '@/lib/v3/tagging/normalize'
import { ANGLES, MOODS, UNIVERSES, isAngle, isUniverse } from '@/lib/v3/types'

test('normalisation: minuscules, accents retirés, ponctuation en espaces', () => {
  assert.equal(normalize('Johnny HALLYDAY'), 'johnny hallyday')
  assert.equal(normalize('Björk — Live!'), 'bjork live')
  assert.equal(normalize("L'été  indien"), 'l ete indien')
  assert.equal(normalize('AC/DC'), 'ac dc')
})

test('la normalisation ne casse pas le japonais', () => {
  // Stripping marks from kana would turn ハ into a different sound.
  assert.equal(normalize('サウスパーク'), 'サウスパーク')
})

test('un alias latin ne correspond qu_a des mots entiers', () => {
  assert.equal(containsAlias('Cars 2 le film', 'Cars'), true)
  assert.equal(containsAlias('Carson City tour', 'Cars'), false, '"Cars" ne doit pas matcher "Carson"')
  assert.equal(containsAlias('concert de Johnny Hallyday', 'johnny hallyday'), true)
})

test('un alias japonais correspond en sous-chaîne, sans espaces', () => {
  assert.equal(containsAlias('今日のサウスパークの話', 'サウスパーク'), true)
})

test('les mots courts et courants exigent un second indice', () => {
  assert.equal(needsSecondClue('Cars'), true)
  assert.equal(needsSecondClue('Paris'), true)
  assert.equal(needsSecondClue('Johnny Hallyday'), false)
  assert.equal(needsSecondClue('road trip'), false)
})

test('identifiants de sujets et de combos', () => {
  assert.equal(subjectId('entity', 'Johnny Hallyday'), 'entity:johnny-hallyday')
  assert.equal(subjectId('topic', 'road trip'), 'topic:road-trip')
  // A combo is stable whichever order its topics arrive in.
  assert.equal(comboId('topic:road-trip', 'topic:desert'), 'combo:desert+road-trip')
  assert.equal(comboId('topic:desert', 'topic:road-trip'), 'combo:desert+road-trip')
})

test('popularité: les trois seuils du plan', () => {
  assert.equal(classifyPopularity(0), 'niche')
  assert.equal(classifyPopularity(999), 'niche')
  assert.equal(classifyPopularity(1_000), 'mid')
  assert.equal(classifyPopularity(1_000_000), 'mid')
  assert.equal(classifyPopularity(1_000_001), 'mainstream')
  assert.equal(classifyPopularity(null), 'unknown')
  assert.equal(classifyPopularity(undefined), 'unknown')
})

test('époque: tendance, récent, rétro, inconnu', () => {
  const now = new Date('2026-09-17T00:00:00Z')
  assert.equal(classifyEra({ trendObservedAt: new Date('2026-09-10T00:00:00Z') }, now), 'trend')
  assert.equal(
    classifyEra({ trendObservedAt: new Date('2026-08-01T00:00:00Z'), publishedAt: new Date('2026-08-01T00:00:00Z') }, now),
    'recent',
    'une tendance de plus de 14 jours n_est plus une tendance',
  )
  assert.equal(classifyEra({ publishedAt: new Date('2019-01-01T00:00:00Z') }, now), 'retro')
  assert.equal(classifyEra({ publishedAt: new Date('2025-01-01T00:00:00Z') }, now), 'recent')
  assert.equal(classifyEra({ title: 'Concert 1987 VHS' }, now), 'retro', 'une année ancienne dans le titre suffit')
  assert.equal(classifyEra({ title: 'Une vidéo' }, now), 'unknown')
})

test('année du titre: la plus ancienne plausible gagne', () => {
  const now = new Date('2026-09-17T00:00:00Z')
  assert.equal(yearFromTitle('Best of 1987 (2024 remaster)', now), 1987)
  assert.equal(yearFromTitle('Top 100 chansons', now), undefined)
  assert.equal(yearFromTitle('Prévisions 2099', now), undefined, 'une année future est ignorée')
})

test('clé d_auteur: refuse une catégorie Dailymotion', () => {
  assert.equal(channelKey({ provider: 'dailymotion', channelId: 'x1795cr' }), 'dailymotion:x1795cr')
  assert.equal(
    channelKey({ provider: 'dailymotion', channelId: 'news' }),
    undefined,
    'une catégorie ne doit jamais devenir une clé d_auteur',
  )
  assert.equal(channelKey({ provider: 'youtube', channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw' }), 'youtube:UCuAXFkgsw1L7xaCfnd5JJOw')
  assert.equal(channelKey({ provider: 'youtube', channelId: 'news' }), undefined)
  assert.equal(channelKey({ provider: 'dailymotion', channelId: null }), undefined)
})

test('détection des catégories déguisées en chaînes', () => {
  for (const slug of ['news', 'music', 'shortfilms', 'sport', 'fun']) {
    assert.equal(isCategoryMasqueradingAsChannel({ provider: 'dailymotion', channelId: slug }), true, slug)
  }
  assert.equal(isCategoryMasqueradingAsChannel({ provider: 'dailymotion', channelId: 'x1795cr' }), false)
  assert.equal(isCategoryMasqueradingAsChannel({ provider: 'youtube', channelId: 'news' }), false)
})

test('titres inexploitables', () => {
  assert.equal(isUsableItem({ type: 'video', title: 'Un vrai titre' }), true)
  assert.equal(isUsableItem({ type: 'video', title: 'VID_20190812' }), false)
  assert.equal(isUsableItem({ type: 'video', title: '#fyp #viral #pourtoi' }), false)
  assert.equal(isUsableItem({ type: 'video', title: 'a' }), false)
  assert.equal(isUsableItem({ type: 'video', title: '' }), false)
  // A quote carries its content in `text`, so no title is expected.
  assert.equal(isUsableItem({ type: 'quote', title: '', text: 'La vie est belle' }), true)
  assert.equal(isUsableItem({ type: 'quote', title: '', text: '' }), false)
})

test('angle déduit du type pour les contenus non-vidéo', () => {
  assert.equal(detectAngle({ type: 'quote' }), 'text-quote')
  assert.equal(detectAngle({ type: 'joke' }), 'text-joke')
  assert.equal(detectAngle({ type: 'fact' }), 'text-fact')
  assert.equal(detectAngle({ type: 'web' }), 'website')
  assert.equal(detectAngle({ type: 'image', isAnimated: true }), 'meme-gif')
  assert.equal(detectAngle({ type: 'image' }), 'photo-image')
})

test('angle des vidéos: les règles du plan', () => {
  assert.equal(
    detectAngle({ type: 'video', title: 'Johnny Hallyday - Allumer le feu (Official Video)', channelTitle: 'JohnnyHallydayVEVO' }),
    'official-clip',
  )
  assert.equal(
    detectAngle({ type: 'video', title: 'Allumer le feu - reprise dans ma chambre', viewCount: 120 }),
    'amateur-cover',
  )
  assert.equal(detectAngle({ type: 'video', title: 'Concert filmé en cachette, fancam' }), 'fan-footage')
  assert.equal(detectAngle({ type: 'video', title: 'La fête du village de Saint-Marc' }), 'local-event')
  assert.equal(detectAngle({ type: 'video', title: 'Reportage INA 1987 archive' }), 'tv-archive')
  assert.equal(detectAngle({ type: 'video', title: 'Speedrun Super Mario Bros gameplay' }), 'gameplay')
  assert.equal(detectAngle({ type: 'video', title: 'Interview exclusive de l_artiste' }), 'interview')
  assert.equal(detectAngle({ type: 'video', title: 'Documentaire sur les volcans' }), 'documentary')
  assert.equal(detectAngle({ type: 'video', title: 'Tuto: comment faire du pain' }), 'tutorial')
})

test('angle: aucune règle ne tranche → other, jamais une invention', () => {
  assert.equal(detectAngle({ type: 'video', title: 'zzzz' }), 'other')
  assert.equal(detectAngle({ type: 'video', title: '' }), 'other')
})

test('les listes fermées le sont vraiment', () => {
  assert.equal(new Set(UNIVERSES).size, UNIVERSES.length, 'aucun doublon dans les univers')
  assert.equal(new Set(ANGLES).size, ANGLES.length, 'aucun doublon dans les angles')
  assert.equal(new Set(MOODS).size, MOODS.length, 'aucun doublon dans les ambiances')
  assert.equal(UNIVERSES.length, 20)
  assert.equal(MOODS.length, 8)
  assert.ok(isUniverse('music'))
  assert.ok(!isUniverse('musique'))
  assert.ok(isAngle('official-clip'))
  assert.ok(!isAngle('clip'))
})

test('tout angle produit par les règles appartient à la liste fermée', () => {
  const samples = [
    { type: 'video' as const, title: 'concert live au Zénith' },
    { type: 'video' as const, title: 'parodie sketch' },
    { type: 'video' as const, title: 'road trip aux USA' },
    { type: 'video' as const, title: 'compilation best of' },
    { type: 'image' as const },
    { type: 'web' as const },
  ]
  for (const sample of samples) {
    assert.ok(isAngle(detectAngle(sample)), `${JSON.stringify(sample)} a produit un angle hors liste`)
  }
})
