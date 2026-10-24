import test from 'node:test'
import assert from 'node:assert/strict'

import { buildWave, accepts, textFits, type WaveAnchor, type WaveCandidate } from '@/lib/v3/wave/select'
import { buildClosest, byCloseness, durationSeconds, FAR_LIKENESS, sharesNamedSubject, tellsAlone } from '@/lib/v3/wave/find'
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
    level?: 1 | 2 | 3 | 4 | 5
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

test('on a loose link only a video, which the AI checks: a picture or a site needs the named subject or the word pair (24 October)', () => {
  for (const level of [3, 4, 5] as const) {
    assert.equal(buildWave(anchor(), [candidate('image', 'photo-image', { level })]).items.length, 0, `a picture at level ${level}`)
    assert.equal(buildWave(anchor(), [candidate('web' as ItemType, 'website', { level })]).items.length, 0, `a site at level ${level}`)
    assert.equal(buildWave(anchor(), [candidate('video', 'parody-sketch', { level })]).items.length, 1, `a video at level ${level}`)
  }
  assert.equal(buildWave(anchor(), [candidate('image', 'photo-image', { level: 2 })]).items.length, 1, 'a picture on the word pair')
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
    candidate('video', 'parody-sketch', { level: 3, universe: 'animation' }),
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

test('the ladder at the click: from a clip at the top, the Wave prefers another level and another pass of the subject', () => {
  const clip: WaveAnchor = { ...anchor({ subjects: [{ id: 'entity:madonna', role: 'primary', evidence: 'search-verified' }], universe: 'music', angle: 'official-clip', channelKey: 'youtube:madonna' }, { type: 'video', title: 'Madonna - Hung Up (Official Video)' }), digLevel: 1, digPass: 'top' }
  const sameLevel = { ...candidate('video', 'live-concert', { title: 'Madonna - Live 2012', channelKey: 'youtube:a' }), digLevel: 1, digPass: 'top' }
  const fan = { ...candidate('video', 'fan-footage', { title: 'Madonna en pâte à modeler', channelKey: 'youtube:b' }), digLevel: 4, digPass: 'around' }
  const blooper = { ...candidate('video', 'parody-sketch', { title: 'Madonna blooper 1990', channelKey: 'youtube:c' }), digLevel: 2, digPass: 'channel' }
  const gif = candidate('image', 'meme-gif', { title: 'Madonna vogue GIF', channelKey: 'giphy:x' })
  const wave = buildWave(clip, [sameLevel, fan, blooper, gif])
  assert.equal(wave.items.length, 3)
  assert.deepEqual(wave.items.map((item) => item.title).sort(), [gif.title, fan.title, blooper.title].sort(), 'the other levels and the image; the same level waits')
  assert.ok(!wave.items.some((item) => item.title === sameLevel.title))
})

test("a content joins the closest step only if its own title names the anchor's subject, or the dig found it by it (24 October, Columbus)", () => {
  const named = new Map([['entity:christopher-columbus', ['christopher columbus', 'Christopher Columbus', 'Cristóbal Colón', 'Christophe Colomb']]])
  const carrying = (title: string, evidence: 'alias' | 'ai' | 'search-verified' = 'alias') => ({
    title,
    v3: { ...candidate('video', 'documentary').v3, subjects: [{ id: 'entity:christopher-columbus', role: 'secondary' as const, evidence }] },
  })
  assert.equal(sharesNamedSubject(carrying("Faits intéressants à connaître sur l'ananas"), named), false, 'Columbus only in its description')
  assert.equal(sharesNamedSubject(carrying('Los Bomberos intervienen en un incendio en un bar en Burgos'), named), false)
  assert.equal(sharesNamedSubject(carrying("Christophe Colomb, l'énigme (2007) - Bande annonce"), named), true)
  assert.equal(sharesNamedSubject(carrying('Cristóbal Colón: El Legado de un Gran Descubridor'), named), true, 'by another of his names')
  assert.equal(sharesNamedSubject(carrying('Bugs Bunny cartoon', 'search-verified'), named), true, 'the dig found it by searching him')
  assert.equal(sharesNamedSubject(carrying('Christophe Colomb', 'alias'), new Map()), false, "a subject the anchor's title does not name")
})

/** A fingerprint `differ` bits away from the all-zero one: likeness 1 − differ/384. */
function print(differ: number): Uint8Array {
  const bits = new Uint8Array(48)
  for (let index = 0; index < differ; index += 1) bits[index >> 3] |= 1 << (index & 7)
  return bits
}

test('the AI keeps the far videos out of the Wave while close ones fill it, and the closest come first', () => {
  const start: WaveAnchor = { ...anchor(), type: 'video', title: 'Christopher Columbus cartoon', vec: print(0) }
  const far = { ...candidate('video', 'mainstream-report', { channelKey: 'a', title: 'Incendio en un bar en Burgos' }), vec: print(184) }
  const close = { ...candidate('video', 'interview', { channelKey: 'b', title: 'Voyages of Christopher Columbus' }), vec: print(40) }
  const closer = { ...candidate('video', 'official-clip', { channelKey: 'c', title: 'Christopher Columbus: what really happened' }), vec: print(20) }
  const image = candidate('image', 'meme-gif', { channelKey: 'd', title: 'Christopher Columbus Dog GIF' })
  const pool = byCloseness(start, [far, close, image, closer])
  assert.deepEqual(pool.map((item) => item.title), [closer.title, close.title, image.title, far.title], 'closest first; no fingerprint sits in the middle')
  assert.ok(pool[3].likeness !== undefined && pool[3].likeness < FAR_LIKENESS)
  const { wave } = buildClosest(start, pool, [])
  assert.equal(wave.items.length, 3)
  assert.ok(!wave.items.some((item) => item.title === far.title), 'the bar fire stays out')
})

test('the Wave keeps its three: a far video comes last of all when nothing closer can fill it ("plus courte… non non non")', () => {
  const start: WaveAnchor = { ...anchor(), type: 'video', title: 'Christopher Columbus cartoon', vec: print(0) }
  const far = { ...candidate('video', 'mainstream-report', { channelKey: 'a', title: 'Incendio en un bar en Burgos' }), vec: print(184) }
  const close = { ...candidate('video', 'interview', { channelKey: 'b', title: 'Voyages of Christopher Columbus' }), vec: print(40) }
  const image = candidate('image', 'meme-gif', { channelKey: 'd', title: 'Christopher Columbus Dog GIF' })
  const { wave } = buildClosest(start, byCloseness(start, [far, close, image]), [])
  assert.equal(wave.items.length, 3)
  assert.equal(wave.items[2].title, far.title)
  assert.equal(wave.level, 5, 'the level says how loose the Wave became')
  assert.deepEqual(byCloseness({}, [far, close]).map((item) => item.title), [far.title, close.title], 'no fingerprint of its own: the pool as it was')
})

test('a word too common to carry a Wave alone is passed over by the one-word steps: "awesome", "5th", "histoire", 2014', () => {
  for (const word of ['awesome', 'Awesome', '5th', '2014', 'histoire', 'Histoire', 'meilleur', 'incroyable', 'love']) assert.equal(tellsAlone(word), false, word)
  for (const word of ['armenia', 'semester', 'gellone', 'bagel', 'Selçuk', 'colomb']) assert.equal(tellsAlone(word), true, word)
})
