import assert from 'node:assert/strict'
import test from 'node:test'

import {
  inKeptShare,
  isLearnedStudio,
  isMiniSeries,
  isoSeconds,
  isVerticalSerial,
  miniSeriesVerdict,
  KEEP_ONE_IN,
  miniSeriesReason,
  studioCandidates,
  studiosMatcher,
} from '../../lib/ingest/miniSeries'
import { isRoutineAtIngest } from '../../lib/ingest/videoEditorialAdmission'

// Real titles, all taken from what entered the catalogue on 26 September 2026.
const SERIALS = [
  'The Vampire\'s Century-Long Bride | Full Series | Short Drama English [Full Movie]',
  'La Princesa que Volvió del Pasado | Serie Completa | Short Drama Español | NITRO REALMS',
  'UN RÉVEILLON INOUBLIABLE | Série Complète | Short Drama Français',
  'De Esposa Trofeo a Heredera | Drama Español [Full Movie] | Drama Hub [Full Movie]',
  '熱門爽劇【愛是一場困局】（全集）尹一博＆楊殊予 [Full Movie]',
  'VIP 2026 I Kissing Her Billionaire Student -  FULL MOVIES ENGLISH SUB',
  '[Doblado]Gemelos del destino | Full 55 Eps SD Drama 2026 [Full Movie]',
  'Que tu ailles bien | Série Complète (34 Eps) | Short Drama Français | NITRO REALMS',
  'The Cartel\'s Contract Bride Movie Ep. 1-53 | The Healing Power of an Unexpected Family',
  'From Puppet Bride To Alpha Queen - FULL FILM | ENSUB',
  'The Billionaire Ex-Wife (FULL)',
  'Divorce Sealed, Regret Too Late (FULL)',
  'Pregnant By My Enemy\'S Dad Fullepisode🍿',
  'The Fake Heiress Picked the Wrong Target Full Movie 2026',
  'Wolf Foster | Werewolf Princess Revenge Drama',
  '[Doblado ESP] De inútil a invaluable la compañera rechazada del Alfa [Full Movie]',
  '[FULL] My Cold Husband Is My Secret Fan [Full Movie]',
  '【AI BL】🌈My Alpha Husband Chose His Family Over Me… But After Losing Me, He Begged for My Return',
  'AI - 穿越大楚当王爷 (下) [Full Movie]',
  'NO CUT 💘 Sold to the Wolf King | Full Episodes [Full Movie]',
  'Better Late Than Single: After Service (2026) - Episode 3 English Sub | Canyon Reels [Full Movie]',
  'El Gran Salvador | FULL SUB ESPAÑOL | CliffRush Drama [Full Movie]',
  'Silicon God Strikes Back Dailymotion Movie - Free Episodes [Full Movie]',
  'The Fake Dating Spell - New Movie 2026💖#Full Movie #Faithful.Hearts [Full Movie]',
  '✨She Met The Cold CEO By Accident,And A Little Life Connected Their Destinies Forever#drama',
  'After My Divorce, I Rule the New York Underworld Mafia Romance, Revenge & Powerful Woman Episodes',
  'My Contract Wife is Actually a Fashion Genius_full [Full Movie]',
  'He danced with his first love while our entire estate collapsed [Full Movie]',
  'Married The Mafioso I Saved | Love and Loyalty Tested 💕 [Full Movie]',
  'Wiedergeboren als Geisterkönig - Teil 2/2 | Folgen 36-67 [Full Movie]',
]

// What the owner wants kept: forgotten films reposted whole, TV, music, sport, news, anything else.
const KEEP = [
  'El Judas 1952 HD 1080 Completa Antonio Vilar, Manuel Gas [Full Movie]',
  'Eegah (1962) - Arch Hall Jr., Marilyn Manning, Richard Kiel - Feature (Horror, Comedy) [Full Movie]',
  'El calzonazos 1974 HD 1080 Completa Paco Martínez Soria, Florinda Chico [Full Movie]',
  'Aquí llega Condemor, el pecador de la pradera 1996 HD 1080 Completa Chiquito de la Calzada [Full Movie]',
  'Lured (1947) Full Movie | Lucille Ball, George Sanders | Classic Film Noir Thriller',
  'Boxing Helena (1993) [Full Movie]',
  'Classic 1949 – Rim of the Canyon: The Ghost Town Ride [Full Movie]',
  'Revenge of the Nerds (1984) full movie',
  'An American Werewolf in London full movie',
  'Miracle in Bethlehem, PA. (2023) Full Movie HD [Full Movie]',
  'Vadh 2 2025 in hindi dubbed [Full Movie]',
  'Amor Real Capitulo 44 [Full Movie]',
  'Watch Bewaqoofian Episode 64 - on Ary Digital in High Quality 21st January 2017 [Full Movie]',
  'Khatron ke Khiladi s10e3 [Full Movie]',
  'Qalandar Episode 54 - [Eng Sub] - Muneeb Butt - Komal Meer - Ali Abbas - 8th April 2023 [Full Movie]',
  'Divorce Court - Full Episode',
  '16 and Pregnant full episode',
  'Duke Ellington full concert 1962',
  'Alpha Blondy full concert live',
  'Romantic Hindi songs Full HD jukebox',
  'Stoney & The Jagged Edge – Chasing Rainbows 1968 (USA, Heavy Psychedelic Rock) [Full Movie]',
  'Andrew Ross Sorkin in Conversation with David Remnick [Full Movie]',
  'Apple CEO interview full',
  'World\'s Strongest Man 2025 final full episode',
  'Street Fighter - New Trailer (2026 Movie)',
  'Toy Story 4  - Bande annonce finale VO',
  'The Easiest, Most Delicious Cake You\'ll Ever Try in Just 40 Minutes—So Fluffy!',
  'One of the Weirdest High-Level Fights You\'ll Ever See | Deontay Wilder vs. Derek Chisora',
  'I Love Lucy full episode',
  'Luna llena concierto completo',
]

test('the serials seen on 26 September are refused', () => {
  const missed = SERIALS.filter((title) => !isMiniSeries(title))
  assert.deepEqual(missed, [])
})

test('forgotten films, TV episodes, concerts, sport and interviews pass', () => {
  const refused = KEEP.filter((title) => isMiniSeries(title)).map((title) => `${title} → ${miniSeriesReason(title)}`)
  assert.deepEqual(refused, [])
})

test('an old year shields a film from every guess, not from an explicit serial label', () => {
  assert.equal(miniSeriesReason('The Billionaire Wife (1995) full movie'), null)
  assert.equal(miniSeriesReason('La Revancha: Retorno a 1983 | Serie Completa (77 Episodios) | Short Drama Español'), 'label')
})

test('the reason says which clue decided', () => {
  assert.equal(miniSeriesReason('Haunted by His Love | Full Series | Short Drama English'), 'label')
  assert.equal(miniSeriesReason('Todo Era Suyo - Completo en Español | NITRO REALMS'), 'studio')
  assert.equal(miniSeriesReason('最新熱門爽劇【天下第一廚神】下集'), 'cjk')
  assert.equal(miniSeriesReason('The Divorced Heiress Takes Back Her Crown New Releases Drama'), 'trope')
  assert.equal(miniSeriesReason('[AI BL] The Champion Who Lost Everything Was Saved by His Biggest Fan [full]'), 'ai-story')
  assert.equal(miniSeriesReason('Quick Take: The YoJoeShow Podcast Ep. 32: Does AI Really Understand You?'), null)
  assert.equal(miniSeriesReason('My Street Magic Trick Went Completely Wrong! #Viral #Shorts #Funny'), null)
  assert.equal(miniSeriesReason('I Sold My House To Escape My Parents Forever - Full Movie English'), 'narrative')
})

test('a learned studio condemns a title shaped like a serial, never a plain one', () => {
  const learned = studiosMatcher(['velvet crown studio'])
  const serial = 'Everything Was Always Hers (FULL) | Velvet Crown Studio'
  assert.equal(isMiniSeries(serial), false)
  assert.equal(miniSeriesReason(serial, learned), 'studio')
  assert.equal(miniSeriesReason('Velvet Crown Studio opens its doors in Lisbon', learned), null)
  assert.equal(miniSeriesReason('Velvet crowning ceremony (full)', studiosMatcher(['velvet crown'])), null)
})

test('studio candidates are the short, non-generic segments of a title', () => {
  assert.deepEqual(studioCandidates('La Revancha | Serie Completa | Short Drama Español | NITRO REALMS'), ['la revancha', 'nitro realms'])
  assert.deepEqual(studioCandidates('The Hidden Queen S ｜ Glacier Films - FULL ✅ [Full Movie]').includes('glacier films'), true)
  assert.deepEqual(studioCandidates('Short Drama English | Full HD | 2026'), [])
})

test('a learned name must be common on refusals and rare on what was let in', () => {
  assert.equal(isLearnedStudio({ refused: 7, kept: 0 }), false)
  assert.equal(isLearnedStudio({ refused: 8, kept: 0 }), true)
  assert.equal(isLearnedStudio({ refused: 20, kept: 5 }), false)
  assert.equal(isLearnedStudio({ refused: 40, kept: 9 }), true)
})

test('about one serial in a hundred is kept, always the same ones', () => {
  const ids = Array.from({ length: 20_000 }, (_, index) => `x${index.toString(36)}`)
  const kept = ids.filter(inKeptShare)
  assert.ok(Math.abs(kept.length - ids.length / KEEP_ONE_IN) < ids.length / KEEP_ONE_IN / 4, `${kept.length} kept`)
  assert.deepEqual(ids.filter(inKeptShare), kept)
  assert.equal(inKeptShare(''), false)
})

test('a title that is only a newsroom slug joins the routine news at the door', () => {
  assert.equal(isRoutineAtIngest({ title: 'tn7-rescatistas-de-la-cruz-roja-costarricense-extraen-con-vida-110926 [Full Movie]' }), true)
  assert.equal(isRoutineAtIngest({ title: 'mqn-un-santuario-natural-en-Palmares-cumple-26-años' }), true)
  assert.equal(isRoutineAtIngest({ title: 'Spider-Man: Across the Spider-Verse trailer' }), false)
  assert.equal(isRoutineAtIngest({ title: 'Jack-in-the-box full gameplay' }), false)
})

test('a long vertical video is a serial whatever its title; a short one or a horizontal film is not', () => {
  assert.equal(isoSeconds('PT5805S'), 5805)
  assert.equal(isoSeconds('PT1H33M28S'), 5608)
  assert.equal(isoSeconds('PT'), null)
  assert.equal(miniSeriesVerdict({ title: 'The Invincible Bodyguard: One Punch to the Heart', aspectRatio: 0.5625, duration: 'PT1H33M28S' }), 'shape')
  assert.equal(miniSeriesVerdict({ title: 'Quand un PDG consulte une Sexologue', aspectRatio: 0.56, duration: 'PT5760S' }), 'shape')
  assert.equal(miniSeriesVerdict({ title: 'My ArchNemesis, My Fated Mate', aspectRatio: 0.5625, duration: 'PT3900S' }), 'shape')
  assert.equal(isVerticalSerial({ title: 'Best Soccer Goals and Incredible Match Highlights', aspectRatio: 0.5625, duration: 'PT45S' }), false)
  assert.equal(isVerticalSerial({ title: 'Gone With The West', aspectRatio: 1.33, duration: 'PT5400S' }), false)
  assert.equal(isVerticalSerial({ title: 'Metallica concert filmed from the pit', aspectRatio: 0.5625, duration: 'PT2400S' }), false)
  assert.equal(isVerticalSerial({ title: 'Anything', duration: 'PT5400S' }), false, 'sans format connu, on ne devine pas')
  assert.equal(isVerticalSerial({ title: 'The Crazy Night at the Concert [Full Movie]', aspectRatio: 0.5625, duration: 'PT5700S' }), true)
  assert.equal(isVerticalSerial({ title: 'Puppet No More: Long Live His Fake Majesty', aspectRatio: 0.5625, duration: 'PT2220S' }), true)
  assert.equal(isVerticalSerial({ title: 'Prime Minister (Documentary film)', aspectRatio: 0.5625, duration: 'PT4200S' }), false)
  assert.equal(miniSeriesVerdict({ title: 'Short Drama | Full Short Drama | English Sub 2026', aspectRatio: 1.77, duration: 'PT60S' }), 'label', 'le titre passe d_abord')
})
