import test from 'node:test'
import assert from 'node:assert/strict'

import { buildWave, accepts, textFits, type WaveAnchor, type WaveCandidate } from '@/lib/v3/wave/select'
import { durationSeconds } from '@/lib/v3/wave/find'
import type { Angle, Era, ItemType, Popularity, Universe } from '@/lib/v3/types'

function anchor(overrides: Partial<WaveAnchor['v3']> = {}, extra: Partial<Pick<WaveAnchor, 'title' | 'type' | 'duration'>> = {}): WaveAnchor {
  return {
    id: 'ancre',
    type: 'image',
    title: 'Cartman crie GIF',
    ...extra,
    v3: {
      subjects: [{ id: 'entity:south-park', role: 'primary', evidence: 'alias' }],
      universe: 'animation',
      angle: 'meme-gif',
      channelKey: 'giphy:southpark',
      ...overrides,
    },
  }
}

let counter = 0
function candidate(
  type: ItemType,
  angle: Angle,
  options: {
    level?: 1 | 2 | 3
    channelKey?: string
    popularity?: Popularity
    title?: string
    nearFamily?: string
    universe?: Universe
    era?: Era
    lang?: string
    languageScope?: string
    duration?: number
  } = {},
): WaveCandidate {
  counter += 1
  return {
    id: `c${counter}`,
    type,
    title: options.title ?? `contenu ${counter}`,
    level: options.level ?? 1,
    ...(options.lang ? { lang: options.lang } : {}),
    ...(options.languageScope ? { languageScope: options.languageScope } : {}),
    ...(options.duration !== undefined ? { duration: options.duration } : {}),
    v3: {
      subjects: [{ id: 'entity:south-park', role: 'primary', evidence: 'alias' }],
      universe: options.universe ?? 'animation',
      angle,
      popularity: options.popularity ?? 'mid',
      era: options.era ?? 'recent',
      channelKey: options.channelKey,
      nearFamily: options.nearFamily,
    },
  }
}

test('trois fois le même format : seulement en dernier recours', () => {
  // Il y a de quoi mélanger : la Wave doit mélanger.
  const melange = buildWave(anchor({ angle: 'official-clip' }), [
    candidate('image', 'meme-gif'),
    candidate('image', 'fan-art'),
    candidate('video', 'live-concert'),
  ])
  assert.equal(melange.items.length, 3)
  assert.equal(melange.items.filter((item) => item.type === 'image').length, 2, 'deux images et une vidéo')

  // Un sujet qui n_a que des vidéos vaut mieux qu_une Wave courte.
  const queDesVideos = buildWave(anchor({ angle: 'meme-gif' }), [
    candidate('video', 'live-concert'),
    candidate('video', 'interview'),
    candidate('video', 'documentary'),
  ])
  assert.equal(queDesVideos.items.length, 3, 'faute de mieux, trois vidéos valent mieux que deux')
})

test('jamais trois images ni trois textes, même faute de mieux', () => {
  const troisImages = buildWave(anchor({ angle: 'official-clip' }), [
    candidate('image', 'meme-gif'),
    candidate('image', 'fan-art'),
    candidate('image', 'photo-image'),
  ])
  assert.equal(troisImages.items.length, 2, 'une Wave courte vaut mieux que trois images')

  const troisTextes = buildWave(anchor({ angle: 'official-clip' }), [
    candidate('joke', 'text-joke'),
    candidate('quote', 'text-quote'),
    candidate('fact', 'text-fact'),
  ])
  assert.ok(troisTextes.items.length <= 2, 'idem pour les textes')
})

test('deux images et un texte reste possible', () => {
  const { items } = buildWave(anchor({ angle: 'official-clip' }), [
    candidate('image', 'meme-gif'),
    candidate('image', 'fan-art'),
    candidate('joke', 'text-joke'),
  ])
  assert.equal(items.length, 3)
  assert.equal(items.filter((item) => item.type === 'image').length, 2)
  assert.equal(items.filter((item) => item.type === 'joke').length, 1)
})

test('la Wave mélange les formats plutôt que d_empiler des vidéos', () => {
  const { items } = buildWave(anchor(), [
    candidate('video', 'episode-extract'),
    candidate('video', 'parody-sketch'),
    candidate('video', 'compilation'),
    candidate('image', 'photo-image'),
    candidate('quiz' as ItemType, 'quiz'),
  ])
  assert.equal(items.length, 3)
  assert.ok(items.filter((item) => item.type === 'video').length <= 2, 'jamais plus de 2 vidéos')
  assert.ok(new Set(items.map((item) => item.type)).size >= 2, 'au moins deux formats')
})

test('jamais deux fois le même traitement, ni celui du contenu de départ', () => {
  const { items } = buildWave(anchor({ angle: 'live-concert' }), [
    candidate('video', 'live-concert'), // même traitement que l_ancre → refusé
    candidate('video', 'episode-extract'),
    candidate('video', 'episode-extract'), // doublon de traitement → refusé
    candidate('image', 'fan-art'),
    candidate('fact' as ItemType, 'text-fact'),
  ])
  const angles = items.map((item) => item.v3.angle)
  assert.equal(new Set(angles).size, angles.length, 'tous les traitements sont différents')
  assert.ok(!angles.includes('live-concert'), 'le traitement de départ est exclu')
})

test('un angle qui ne nomme qu_un format ne compte pas comme une répétition', () => {
  // Un GIF South Park mène à d_autres GIF South Park : c_est la logique d_une
  // banque d_images. Le plafond de deux par format garde la variété.
  const { items } = buildWave(anchor(), [
    candidate('image', 'meme-gif', { channelKey: 'giphy:a' }),
    candidate('image', 'meme-gif', { channelKey: 'giphy:b' }),
    candidate('image', 'meme-gif', { channelKey: 'giphy:c' }),
    candidate('video', 'episode-extract'),
  ])
  assert.equal(items.filter((item) => item.type === 'image').length, 2, 'deux images, pas trois')
  assert.ok(items.some((item) => item.type === 'video'), 'le troisième est une vidéo')
})

test('jamais le contenu de départ sous un autre identifiant : même titre, refusé', () => {
  const twin = candidate('image', 'meme-gif', { title: 'Cartman crie GIF', channelKey: 'giphy:autre' })
  assert.equal(accepts(anchor(), [], twin, new Set()), false)
})

test('jamais deux contenus du même auteur, ni celui du départ', () => {
  const { items } = buildWave(anchor(), [
    candidate('video', 'episode-extract', { channelKey: 'giphy:southpark' }), // auteur de l_ancre
    candidate('video', 'parody-sketch', { channelKey: 'youtube:UCaaa' }),
    candidate('image', 'photo-image', { channelKey: 'youtube:UCaaa' }), // même auteur
    candidate('image', 'fan-art', { channelKey: 'youtube:UCbbb' }),
  ])
  const authors = items.map((item) => item.v3.channelKey).filter(Boolean)
  assert.equal(new Set(authors).size, authors.length)
  assert.ok(!authors.includes('giphy:southpark'))
})

test('les textes n_apparaissent pas au niveau 3', () => {
  const large = buildWave(anchor(), [candidate('quote', 'text-quote', { level: 3 })])
  assert.equal(large.items.length, 0, 'une citation sans lien de sujet est refusée')

  const proche = buildWave(anchor(), [candidate('quote', 'text-quote', { level: 1 })])
  assert.equal(proche.items.length, 1, 'la même citation passe quand le sujet correspond')
})

test('les quasi-doublons ne se répètent pas dans une même Wave', () => {
  const { items } = buildWave(anchor(), [
    candidate('video', 'episode-extract', { nearFamily: 'aaaa' }),
    candidate('video', 'parody-sketch', { nearFamily: 'aaaa' }),
    candidate('image', 'photo-image', { nearFamily: 'bbbb' }),
  ])
  const familles = items.map((item) => item.v3.nearFamily)
  assert.equal(new Set(familles).size, familles.length)
})

test('un titre identique n_apparaît pas deux fois', () => {
  const { items } = buildWave(anchor(), [
    candidate('video', 'episode-extract', { title: 'South Park épisode culte' }),
    candidate('image', 'photo-image', { title: 'South Park, épisode culte !' }),
    candidate('image', 'fan-art', { title: 'autre chose' }),
  ])
  assert.equal(items.length, 2, 'le titre en double est écarté malgré la ponctuation différente')
})

test('les niveaux sont descendus dans l_ordre, et le niveau rendu est le plus lâche utilisé', () => {
  const { items, level } = buildWave(anchor(), [
    candidate('video', 'episode-extract', { level: 1 }),
    candidate('image', 'photo-image', { level: 2 }),
    candidate('web' as ItemType, 'website', { level: 3, universe: 'animation' }),
  ])
  assert.equal(items.length, 3)
  assert.equal(items[0]?.level, 1, 'le lien le plus proche est servi en premier')
  assert.equal(level, 3, 'le niveau annoncé est celui du lien le plus lointain retenu')
})

test('aucun candidat valide donne une Wave vide, jamais un contenu sans lien', () => {
  // Le seul candidat est du même auteur que le contenu de départ.
  const { items } = buildWave(anchor(), [candidate('image', 'meme-gif', { channelKey: 'giphy:southpark' })])
  assert.equal(items.length, 0)
})

test('accepts refuse le contenu de départ et ceux déjà vus', () => {
  const a = anchor()
  const vu = candidate('video', 'episode-extract')
  assert.equal(accepts(a, [], { ...vu, id: 'ancre' }, new Set()), false)
  assert.equal(accepts(a, [], vu, new Set([vu.id])), false)
  assert.equal(accepts(a, [], vu, new Set()), true)
})

// ---------------------------------------------------------------------------
// Phase 1 : la langue des textes
// ---------------------------------------------------------------------------

test('un texte n_entre dans la Wave que si le visiteur peut le lire ; l_anglais passe partout', () => {
  const japonais = candidate('joke', 'text-joke', { lang: 'ja', languageScope: 'localized' })
  const anglais = candidate('quote', 'text-quote', { lang: 'en', languageScope: 'localized' })
  const universel = candidate('fact', 'text-fact', { languageScope: 'universal' })
  const sansLangue = candidate('joke', 'text-joke')

  assert.equal(accepts(anchor(), [], japonais, new Set(), undefined, 'fr'), false, 'un texte japonais pour un visiteur français')
  assert.equal(accepts(anchor(), [], japonais, new Set(), undefined, 'jp'), true, 'le même pour un visiteur japonais')
  assert.equal(accepts(anchor(), [], anglais, new Set(), undefined, 'fr'), true, 'l_anglais n_est jamais bloqué')
  assert.equal(accepts(anchor(), [], universel, new Set(), undefined, 'de'), true)
  assert.equal(accepts(anchor(), [], sansLangue, new Set(), undefined, 'es'), true, 'sans langue connue : traité comme anglais')
  assert.equal(textFits({ lang: 'ja', languageScope: 'localized' }, 'jp'), true, 'jp et ja sont la même langue')

  const wave = buildWave(anchor(), [japonais, candidate('video', 'live-concert'), candidate('image', 'fan-art')], [], 'fr')
  assert.ok(!wave.items.includes(japonais), 'buildWave transmet la langue')
})

// ---------------------------------------------------------------------------
// Phase 1 : la même vidéo republiée par un autre compte
// ---------------------------------------------------------------------------

test('la même captation republiée sous un autre titre est refusée ; deux captations différentes passent', () => {
  const live = anchor({ angle: 'live-concert', nearFamily: '00000000000000ff' }, { type: 'video', title: 'Allumer le feu – Johnny live 98', duration: 245 })

  const republiee = candidate('video', 'interview', { title: 'Johnny Hallyday Allumer le feu (Live 1998)', nearFamily: '00000000000000ff', duration: 246 })
  assert.equal(accepts(live, [], republiee, new Set()), false, 'même empreinte, même durée : la même vidéo')

  const presque = candidate('video', 'interview', { title: 'Allumer le feu Johnny Hallyday live 1998 HD', nearFamily: '00000000000000fc', duration: 244 })
  assert.equal(accepts(live, [], presque, new Set()), false, 'empreinte à 2 bits, durée à ± 2 s : la même vidéo')

  const autreCaptation = candidate('video', 'interview', { title: 'Allumer le feu – Johnny live 98 (autre soir)', nearFamily: '00000000000000ff', duration: 301 })
  assert.equal(accepts(live, [], autreCaptation, new Set()), true, 'même chanson, autre soir, autre durée : une découverte')

  const lointaine = candidate('video', 'interview', { title: 'Johnny en interview', nearFamily: '0000000000ff00ff', duration: 245 })
  assert.equal(accepts(live, [], lointaine, new Set()), true, 'empreinte loin : un autre contenu, même s_il dure pareil')

  const gifRepublie = candidate('image', 'fan-art', { title: 'Cartman crie – GIF', nearFamily: 'abcdef0123456789' })
  const gifAncre = anchor({ nearFamily: 'abcdef0123456789' })
  assert.equal(accepts(gifAncre, [], gifRepublie, new Set()), false, 'sans durée, l_empreinte seule tranche')
})

// ---------------------------------------------------------------------------
// Phase 1 : deux concerts du même artiste, d_époques différentes
// ---------------------------------------------------------------------------

test('le même angle que l_ancre revient si l_ère diffère, jamais deux fois parmi les trois', () => {
  const liveRecent = anchor({ angle: 'live-concert', era: 'recent' }, { type: 'video' })

  assert.equal(accepts(liveRecent, [], candidate('video', 'live-concert', { era: 'retro' }), new Set()), true, 'un live de 1975 après un live de 2019')
  assert.equal(accepts(liveRecent, [], candidate('video', 'live-concert', { era: 'recent' }), new Set()), false, 'un live après un live de la même époque')
  assert.equal(accepts(liveRecent, [], candidate('video', 'live-concert', { era: 'unknown' }), new Set()), false, 'une ère inconnue ne compte pas comme différente')

  const dejaUnLive = [candidate('video', 'live-concert', { era: 'retro' })]
  assert.equal(accepts(liveRecent, dejaUnLive, candidate('image', 'live-concert', { era: 'retro' }), new Set()), false, 'jamais deux fois le même angle parmi les trois')

  const sansEre = anchor({ angle: 'live-concert' }, { type: 'video' })
  assert.equal(accepts(sansEre, [], candidate('video', 'live-concert', { era: 'retro' }), new Set()), false, 'sans ère sur l_ancre, la règle d_avant tient')
})

test('la durée des vidéos se lit dans ce que les fournisseurs stockent', () => {
  assert.equal(durationSeconds('PT1H2M3S'), 3723)
  assert.equal(durationSeconds('PT45S'), 45)
  assert.equal(durationSeconds('95'), 95)
  assert.equal(durationSeconds(95), 95)
  assert.equal(durationSeconds('n_importe quoi'), undefined)
  assert.equal(durationSeconds(undefined), undefined)
})
