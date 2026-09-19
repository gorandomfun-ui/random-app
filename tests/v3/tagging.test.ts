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

// ---------------------------------------------------------------------------
// Le dictionnaire de sujets
// ---------------------------------------------------------------------------

test('les thèmes écrits à la main sont cohérents', async () => {
  const { THEMES, duplicateThemeSlugs } = await import('@/lib/v3/subjects/themes')
  assert.deepEqual(duplicateThemeSlugs(), [], 'aucun slug en double')
  for (const theme of THEMES) {
    assert.ok(theme.aliases.length >= 1, `${theme.slug} doit avoir au moins un alias`)
    assert.ok(isUniverse(theme.universe), `${theme.slug} a un univers hors liste`)
    assert.match(theme.slug, /^[a-z0-9-]+$/, `${theme.slug} doit être un slug simple`)
  }
})

test('les pages Wikipédia qui ne sont pas des sujets sont écartées', async () => {
  const { looksLikeSubject } = await import('@/lib/v3/subjects/wikipedia')
  for (const rejected of [
    'Wikipédia:Accueil_principal',
    'Spécial:Recherche',
    'Special:Search',
    'Category:Films',
    'Catégorie:Cinéma',
    'Liste_des_présidents',
    'List_of_films',
    'Deaths_in_2020',
    'Décès_en_2020',
    'Main_Page',
    '2020',
    'Paris_(disambiguation)',
  ]) {
    assert.equal(looksLikeSubject(rejected), false, `${rejected} ne devrait pas être un sujet`)
  }
  for (const accepted of ['South_Park', 'Johnny_Hallyday', 'Zinedine_Zidane', 'Cookie_(informatique)']) {
    assert.equal(looksLikeSubject(accepted), true, `${accepted} devrait être accepté`)
  }
})

test('un thème devient un sujet correctement formé', async () => {
  const { buildThemeSubjects } = await import('@/lib/v3/subjects/build')
  const subjects = buildThemeSubjects()
  const poterie = subjects.find((subject) => subject._id === 'topic:poterie')
  assert.ok(poterie, 'le thème poterie doit exister')
  assert.equal(poterie?.kind, 'topic')
  assert.equal(poterie?.universe, 'craft')
  assert.ok(poterie?.aliases.includes('pottery'))
  assert.ok(poterie?.aliases.includes('陶芸'), 'les graphies japonaises sont conservées')
  // Les alias sont normalisés, donc comparables à un titre normalisé.
  assert.ok(poterie?.aliases.every((alias) => alias === alias.toLowerCase()))
})

test('la fusion réunit les alias sans perdre de source', async () => {
  const { mergeSubjects } = await import('@/lib/v3/subjects/build')
  const base = {
    kind: 'entity' as const,
    label: 'South Park',
    universe: 'animation' as const,
    counts: {},
    angleCounts: {},
    createdAt: new Date(),
    ambiguous: false,
  }
  const merged = mergeSubjects([
    { ...base, _id: 'entity:south-park', aliases: ['south park'], sources: ['mainstream'] },
    { ...base, _id: 'entity:south-park', aliases: ['サウスパーク'], sources: ['trend'] },
  ])
  assert.equal(merged.length, 1, 'le même sujet vu deux fois reste un seul sujet')
  assert.deepEqual(merged[0]?.aliases.sort(), ['south park', 'サウスパーク'].sort())
  assert.deepEqual(merged[0]?.sources.sort(), ['mainstream', 'trend'])
})

// ---------------------------------------------------------------------------
// L'étiqueteur complet
// ---------------------------------------------------------------------------

const DICTIONARY = [
  { _id: 'entity:south-park', label: 'South Park', universe: 'animation', kind: 'entity', aliases: ['south park', 'サウスパーク'], ambiguous: false },
  { _id: 'entity:johnny-hallyday', label: 'Johnny Hallyday', universe: 'music', kind: 'entity', aliases: ['johnny hallyday'], ambiguous: false },
  { _id: 'topic:moto', label: 'moto', universe: 'vehicles', kind: 'topic', aliases: ['moto', 'motorcycle'], ambiguous: true },
  { _id: 'topic:road-trip', label: 'road trip', universe: 'travel', kind: 'topic', aliases: ['road trip'], ambiguous: false },
  { _id: 'entity:cars', label: 'Cars', universe: 'animation', kind: 'entity', aliases: ['cars'], ambiguous: true },
]

test('index: une recherche ne compare que les alias plausibles', async () => {
  const { buildSubjectIndex } = await import('@/lib/v3/tagging/subjectIndex')
  const index = buildSubjectIndex(DICTIONARY)
  assert.ok(index.aliasCount >= 7)
  assert.ok(index.byFirstWord.has('south'), 'les alias latins sont indexés par premier mot')
  assert.equal(index.unspaced.length, 1, 'les alias japonais vont dans la liste à part')
})

test('étiquetage: sujet principal, secondaires, univers, angle', async () => {
  const { buildSubjectIndex } = await import('@/lib/v3/tagging/subjectIndex')
  const { tagItem } = await import('@/lib/v3/tagging/tagItem')
  const index = buildSubjectIndex(DICTIONARY)

  const tags = tagItem(
    {
      type: 'video',
      title: 'Johnny Hallyday en road trip, reportage',
      provider: 'youtube',
      channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
      viewCount: 2_000_000,
      publishedAt: new Date('2012-05-01T00:00:00Z'),
    },
    index,
    new Date('2026-09-17T00:00:00Z'),
  )

  assert.equal(tags.subjects[0]?.id, 'entity:johnny-hallyday', 'l_alias le plus précis devient le sujet principal')
  assert.equal(tags.subjects[0]?.role, 'primary')
  assert.ok(tags.subjects.some((subject) => subject.id === 'topic:road-trip'))
  assert.equal(tags.universe, 'music')
  assert.equal(tags.popularity, 'mainstream')
  assert.equal(tags.era, 'retro')
  assert.equal(tags.channelKey, 'youtube:UCuAXFkgsw1L7xaCfnd5JJOw')
  assert.equal(tags.usable, true)
  assert.equal(tags.tagVersion, 1)
})

test('étiquetage: le japonais est reconnu sans espaces', async () => {
  const { buildSubjectIndex } = await import('@/lib/v3/tagging/subjectIndex')
  const { tagItem } = await import('@/lib/v3/tagging/tagItem')
  const index = buildSubjectIndex(DICTIONARY)
  const tags = tagItem({ type: 'image', title: '今日のサウスパークの回が最高だった' }, index)
  assert.equal(tags.subjects[0]?.id, 'entity:south-park')
})

test('étiquetage: un alias d_un seul mot courant n_est jamais utilisé pour une entité', async () => {
  const { buildSubjectIndex } = await import('@/lib/v3/tagging/subjectIndex')
  const { tagItem } = await import('@/lib/v3/tagging/tagItem')
  const index = buildSubjectIndex(DICTIONARY)

  // Les titres anglais sont en Majuscules À Chaque Mot, donc la majuscule ne
  // prouve rien. Sur la vraie base, "magic" faisait passer un épisode de série
  // pour Magic: The Gathering, et "video" pour "Video recording".
  assert.equal(tagItem({ type: 'video', title: 'washing my cars in the rain' }, index).subjects.length, 0)
  assert.equal(
    tagItem({ type: 'video', title: 'Cars 2 bande annonce' }, index).subjects.length,
    0,
    'même avec une majuscule, un mot seul ne suffit pas pour une entité',
  )
})

test('étiquetage: un thème écrit à la main garde ses alias courts', async () => {
  const { buildSubjectIndex } = await import('@/lib/v3/tagging/subjectIndex')
  const { tagItem } = await import('@/lib/v3/tagging/tagItem')
  const index = buildSubjectIndex(DICTIONARY)
  // "moto" est court mais choisi à la main : il reste utilisable, avec indice.
  const tags = tagItem({ type: 'video', title: 'Balade en Moto dans les Alpes', categoryId: 'vehicles' }, index)
  assert.ok(tags.subjects.some((subject) => subject.id === 'topic:moto'))
})

test('étiquetage: un nom long fait taire les noms courts qu_il contient', async () => {
  const { buildSubjectIndex } = await import('@/lib/v3/tagging/subjectIndex')
  const { tagItem } = await import('@/lib/v3/tagging/tagItem')
  const index = buildSubjectIndex([
    ...DICTIONARY,
    { _id: 'entity:creed-ii', label: 'Creed II', universe: 'cinema-tv', kind: 'entity', aliases: ['creed ii'], ambiguous: false },
    { _id: 'entity:assassin-s-creed', label: "Assassin's Creed", universe: 'gaming', kind: 'entity', aliases: ['assassin s creed'], ambiguous: false },
  ])
  const tags = tagItem({ type: 'video', title: "Assassin's Creed II Brotherhood intro" }, index)
  const ids = tags.subjects.map((subject) => subject.id)
  assert.ok(ids.includes('entity:assassin-s-creed'))
  assert.ok(!ids.includes('entity:creed-ii'), '"Creed II" est déjà décrit par "Assassin_s Creed"')
})

test('étiquetage: un contenu inexploitable ne reçoit aucun sujet', async () => {
  const { buildSubjectIndex } = await import('@/lib/v3/tagging/subjectIndex')
  const { tagItem } = await import('@/lib/v3/tagging/tagItem')
  const index = buildSubjectIndex(DICTIONARY)
  const tags = tagItem({ type: 'video', title: 'VID_20190812' }, index)
  assert.equal(tags.usable, false)
  assert.equal(tags.subjects.length, 0)
})

test('étiquetage: une catégorie Dailymotion ne devient jamais une clé d_auteur', async () => {
  const { buildSubjectIndex } = await import('@/lib/v3/tagging/subjectIndex')
  const { tagItem } = await import('@/lib/v3/tagging/tagItem')
  const index = buildSubjectIndex(DICTIONARY)
  const tags = tagItem(
    { type: 'video', title: 'South Park épisode culte', provider: 'dailymotion', channelId: 'news', channelTitle: 'Nieuws' },
    index,
  )
  assert.equal(tags.channelKey, undefined)
  assert.equal(tags.subjects[0]?.id, 'entity:south-park', 'le sujet reste correct malgré la chaîne inutilisable')
})

// ---------------------------------------------------------------------------
// Familles : quasi-doublons et formats répétés
// ---------------------------------------------------------------------------

test('squelette de titre : chiffres, emojis et hashtags sont retirés', async () => {
  const { titleSkeleton } = await import('@/lib/v3/families')
  const a = titleSkeleton("L'histoire INCROYABLE de Marie, 1847 — Partie 3 😱 #histoire")
  const b = titleSkeleton("L'histoire INCROYABLE de Pierre, 1923 — Partie 7 😱 #histoire")
  assert.equal(a.includes('1847'), false)
  assert.equal(a.includes('partie'), true)
  assert.notEqual(a, b, 'les prénoms restent, donc les squelettes diffèrent encore')
})

test('quasi-doublons : des titres fabriqués en série tombent dans la même famille', async () => {
  const { nearFamilyKey, simhash, titleSkeleton, hammingDistance, NEAR_DUPLICATE_MAX_BITS } = await import('@/lib/v3/families')
  const names = ['Marie', 'Pierre', 'Jean']
  // En retirant aussi le prénom (un sujet reconnu), les trois deviennent identiques.
  const keys = names.map((name) => nearFamilyKey(`L'histoire INCROYABLE de ${name}, 1847 — Partie 3 😱`, [name]))
  assert.equal(new Set(keys).size, 1, 'les trois doivent partager la même empreinte')

  // Deux titres proches mais pas identiques restent sous le seuil.
  const left = simhash(titleSkeleton('tuto danse hip hop pour debutants a la maison'))
  const right = simhash(titleSkeleton('tuto danse hip hop pour debutants chez soi'))
  assert.ok(hammingDistance(left, right) >= 0)

  // Deux sujets sans rapport doivent être très éloignés.
  const far = hammingDistance(
    simhash(titleSkeleton('concert de jazz a la nouvelle orleans')),
    simhash(titleSkeleton('reparer un moteur de tracteur agricole')),
  )
  assert.ok(far > NEAR_DUPLICATE_MAX_BITS, `des titres sans rapport doivent différer de plus de ${NEAR_DUPLICATE_MAX_BITS} bits, obtenu ${far}`)
})

test('famille de format : thème × angle × langue', async () => {
  const { formatFamilyKey } = await import('@/lib/v3/families')
  assert.equal(
    formatFamilyKey({ primarySubjectId: 'topic:danse', universe: 'sport', angle: 'tutorial', lang: 'hi' }),
    'topic:danse×tutorial×hi',
  )
  // Sans sujet, l_univers tient lieu de thème.
  assert.equal(
    formatFamilyKey({ universe: 'history', angle: 'documentary', lang: 'en' }),
    'history×documentary×en',
  )
  // Langue inconnue : une valeur explicite plutôt qu_un trou.
  assert.equal(formatFamilyKey({ universe: 'other', angle: 'other' }), 'other×other×xx')
})

test('empreinte identique pour un texte identique, différente sinon', async () => {
  const { nearFamilyKey } = await import('@/lib/v3/families')
  assert.equal(nearFamilyKey('bonjour le monde'), nearFamilyKey('bonjour le monde'))
  assert.notEqual(nearFamilyKey('bonjour le monde'), nearFamilyKey('au revoir tout le monde'))
  assert.match(nearFamilyKey('un titre quelconque'), /^[0-9a-f]{16}$/)
})

// ---------------------------------------------------------------------------
// Giphy
// ---------------------------------------------------------------------------

test('titre Giphy : séparer le sujet du studio', async () => {
  const { parseGiphyTitle } = await import('@/lib/v3/giphy')
  assert.deepEqual(parseGiphyTitle('Fps Platformer GIF by Annapurna Interactive'), {
    subjectText: 'Fps Platformer',
    studio: 'Annapurna Interactive',
  })
  assert.deepEqual(parseGiphyTitle('Music Video Wow GIF by Apple Music'), {
    subjectText: 'Music Video Wow',
    studio: 'Apple Music',
  })
  // Sans studio
  assert.deepEqual(parseGiphyTitle('asian food GIF'), { subjectText: 'asian food', studio: null })
  // Giphy utilise aussi "Sticker" pour la même forme
  assert.deepEqual(parseGiphyTitle('Happy Birthday Sticker by Tenor'), {
    subjectText: 'Happy Birthday',
    studio: 'Tenor',
  })
  // Titre libre : tout est considéré comme sujet
  assert.deepEqual(parseGiphyTitle('Pink Frog'), { subjectText: 'Pink Frog', studio: null })
  assert.deepEqual(parseGiphyTitle(''), { subjectText: null, studio: null })
  assert.deepEqual(parseGiphyTitle(null), { subjectText: null, studio: null })
})

test('texte Giphy à étiqueter : sujet, studio, auteur et slug', async () => {
  const { giphySearchableText } = await import('@/lib/v3/giphy')
  const text = giphySearchableText({
    title: 'Trending Its Gone Viral GIF by One Chicago',
    slug: 'onechicago-nbc-chicago-fire-xYz123AbC',
    username: 'onechicago',
  })
  assert.ok(text.includes('Trending Its Gone Viral'))
  assert.ok(text.includes('One Chicago'), 'le studio est un sujet potentiel')
  assert.ok(text.includes('chicago fire'), 'les mots du slug sont récupérés')
  assert.ok(!text.includes('xYz123AbC'), 'l_identifiant en fin de slug est écarté')
})

test('un résultat Giphy ne compte que s_il mentionne le sujet demandé', async () => {
  const { mentionsSubject } = await import('@/lib/v3/giphy')
  assert.equal(mentionsSubject('South Park Cartman GIF', 'South Park'), true)
  assert.equal(mentionsSubject('Southern cooking GIF', 'South Park'), false)
  assert.equal(mentionsSubject('', 'South Park'), false)
})

// ---------------------------------------------------------------------------
// Sites web : liens morts et pages marchandes
// ---------------------------------------------------------------------------

test('page marchande : reconnue par l_adresse', async () => {
  const { looksMerchant } = await import('@/lib/v3/web/linkCheck')
  for (const url of [
    'https://example.com/shop/tshirt',
    'https://example.com/boutique',
    'https://example.com/products/42',
    'https://example.com/panier',
    'https://example.com/checkout?step=1',
    'https://shop.example.com/',
    'https://www.etsy.com/listing/123',
  ]) {
    assert.equal(looksMerchant(url), true, url)
  }
  for (const url of [
    'https://www.earth.nullschool.net/',
    'https://experiments.mozilla.org/',
    'https://example.com/workshop',
    'https://example.com/a-propos',
  ]) {
    assert.equal(looksMerchant(url), false, `${url} ne doit PAS être pris pour une boutique`)
  }
})

test('page marchande : "workshop" ne doit pas déclencher "shop"', async () => {
  const { looksMerchant } = await import('@/lib/v3/web/linkCheck')
  // Le mot doit être un segment d_URL entier, pas une sous-chaîne.
  assert.equal(looksMerchant('https://example.com/workshop/pottery'), false)
  assert.equal(looksMerchant('https://example.com/shop/pottery'), true)
})

test('étiquetage : les mots fournis hors du titre sont lus', async () => {
  const { buildSubjectIndex } = await import('@/lib/v3/tagging/subjectIndex')
  const { tagItem } = await import('@/lib/v3/tagging/tagItem')
  const index = buildSubjectIndex([
    ...DICTIONARY,
    { _id: 'entity:chicago-fire', label: 'Chicago Fire', universe: 'cinema-tv', kind: 'entity', aliases: ['chicago fire'], ambiguous: false },
  ])

  // Le titre seul ne dit rien, mais le slug Giphy porte le vrai sujet.
  const sansSlug = tagItem({ type: 'image', title: 'Trending Its Gone Viral GIF' }, index)
  assert.equal(sansSlug.subjects.length, 0)

  const avecSlug = tagItem(
    { type: 'image', title: 'Trending Its Gone Viral GIF', slug: 'onechicago-nbc-chicago-fire-xYz123' },
    index,
  )
  assert.equal(avecSlug.subjects[0]?.id, 'entity:chicago-fire')
})

test('étiquetage : l_identifiant aléatoire du slug n_est pas pris pour un sujet', async () => {
  const { buildSubjectIndex } = await import('@/lib/v3/tagging/subjectIndex')
  const { tagItem } = await import('@/lib/v3/tagging/tagItem')
  const index = buildSubjectIndex([
    ...DICTIONARY,
    { _id: 'entity:moto-gp', label: 'MotoGP', universe: 'sport', kind: 'entity', aliases: ['moto gp'], ambiguous: false },
  ])
  const tags = tagItem({ type: 'image', title: 'un gif', slug: 'danse-party-moto-gp-AbC999' }, index)
  assert.ok(tags.subjects.some((subject) => subject.id === 'entity:moto-gp'))
})
