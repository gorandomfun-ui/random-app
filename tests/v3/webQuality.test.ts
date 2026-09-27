import assert from 'node:assert/strict'
import test from 'node:test'

import { boringWebReason } from '../../lib/v3/web/quality'

// Taken from what was stored, 27 September.
const BORING: Array<[string, string, string]> = [
  ['https://www.mudpuppy.com/products/cat-cafe-500-piece-puzzle', 'Cat Cafe 500 Piece Family Puzzle - Mudpuppy', 'shop'],
  ['https://plantsnpetals.net/products/tokyomilk-dead-sexy-parfum', 'TokyoMilk Dead Sexy Parfum', 'shop'],
  ['https://bandagallery.com/collections/artwork', 'Curated Art Collection', 'shop'],
  ['https://tienda.lafabrica.com/editorial-la-fabrica/9143-los-citricos', 'Los cítricos', 'shop'],
  ['https://www.surfclubnewport.com/menus/', 'Menus | Surf Club in Rhode Island', 'listing'],
  ['https://www.youtube.com/watch?v=abc', 'How to Dribble a Basketball', 'video'],
  ['https://stibee.com/api/v1.0/emails/share/Ah1Vl', '(광고)[생활맥주] 첫 번째 뉴스레터', 'mail'],
  ['https://www.hollywoodreporter.com/movies/movie-news/louise-linton-hits-sundance', 'Louise Linton Hits Sundance', 'article'],
  ['https://civileats.com/2025/07/07/farmworkers-heal-climate-scarred-land/', 'Farmworkers Heal Climate-Scarred Land', 'article'],
  ['https://presidencia.gob.do/noticias/ministerio-de-medio-ambiente-realiza-feria', 'Ministerio de Medio Ambiente', 'admin'],
  ['https://travel.utah.gov/international-media-hub/', 'International Trade and Media Hub', 'admin'],
  ['https://www.uni4edu.com/sw/chuo-kikuu/university-of-bonn/programs', 'University of Bonn', 'admin'],
  ['https://www.boynemountain.com/upcoming-events/holiday-open-house', 'Holiday Open House', 'listing'],
  ['https://www.abc.net.au/education/tv-guide', 'TV Guide - ABC Education', 'listing'],
  ['https://jornaldebrasilia.com.br/blogs-e-colunas/olivier-anquier-em-entrevista', 'Olivier Anquier', 'article'],
  ['https://marylandroadtrips.com/running-spots-in-maryland-worth-driving-for/', 'Running Spots in Maryland Worth Driving For', 'article'],
  ['https://apps.apple.com/us/app/retro-fitness/id924464892', 'Retro Fitness', 'shop'],
  ['https://soundcloud.com/garethemery/where-do-we-go-from-here', 'Stream Where Do We Go From Here', 'media'],
  ['https://autumnsdss.bandcamp.com/track/anti-monarchy-chant', 'Anti-Monarchy Chant | Autumns', 'media'],
  ['https://pikbest.com/free-powerpoint/chinese-tea.html', 'Chinese Tea Powerpoint Templates', 'shop'],
  ['https://pt.wikipedia.org/wiki/Capital_da_moda', 'Capital da moda', 'article'],
  ['https://press.polaroid.com/222112-for-the-rebel-rebels', 'For the Rebel Rebels', 'article'],
]
const KEEP: Array<[string, string]> = [
  ['https://www.onb.ac.at/en/', 'Austrian National Library - Start page'],
  ['https://cyberneticzoo.com/robots/1924-radio-police-automaton-gernsback-american/', '1924 - Radio Police Automaton'],
  ['https://www.cbfhawaii.com/', 'Cherry Blossom Festival'],
  ['https://neal.fun/deep-sea/', 'The Deep Sea'],
  ['https://radio.garden/', 'Radio Garden'],
  ['https://pointerpointer.com', 'Pointer Pointer'],
  ['https://www.windows93.net/', 'WINDOWS93'],
  ['https://oskarstalberg.com/Townscaper/', 'Townscaper'],
  ['https://eyecontemporaryart.com/', 'Bring Art Home | Hong Kong Art Gallery'],
  ['https://httpster.net/', 'Httpster: Website Design Inspiration'],
]

test('a shop, a menu, an article, a council page, a newsletter or a video is not a site worth a draw', () => {
  assert.deepEqual(BORING.filter(([url, title, reason]) => boringWebReason(url, title) !== reason).map(([url, title]) => `${url} → ${boringWebReason(url, title)}`), [])
})

test('object-sites, archives, museums and a front page pass', () => {
  assert.deepEqual(KEEP.filter(([url, title]) => boringWebReason(url, title) !== null).map(([url, title]) => `${url} → ${boringWebReason(url, title)}`), [])
})

test('a search result deep inside some site is a single page; a front page, a short address or a project host is not', () => {
  assert.equal(boringWebReason('https://www.footprintsandmemories.com/my-wurst-months-and-other-german-street-food/', 'My Wurst Months', 'google-cse'), 'page')
  assert.equal(boringWebReason('https://www.visitlyon.fr/decouvrir/quartiers/vieux-lyon', 'Vieux Lyon', 'google-cse'), 'page')
  assert.equal(boringWebReason('https://neal.fun/deep-sea/', 'The Deep Sea', 'google-cse'), null)
  assert.equal(boringWebReason('https://someone.github.io/a/b/strange-toy/', 'Strange toy', 'google-cse'), null)
  assert.equal(boringWebReason('https://bigfuncolumbus.com/', 'Big Fun Columbus - Vintage Toys', 'google-cse'), null)
  assert.equal(boringWebReason('https://www.footprintsandmemories.com/my-wurst-months-and-other-german-street-food/', 'My Wurst Months', 'hn'), null, 'other sources keep their deep pages')
})
