import assert from 'node:assert/strict'
import test from 'node:test'

import { ObjectId } from 'mongodb'

import { PERSON_ANGLES, personQuery, themeAngles, themeQuery } from '../../lib/v3/dig/angles'
import { aliasForms, capMoments, isAddressOf, isCelebrityNews, keepMostWatchedTwin, namesSubjectFor, subjectDoor, tellingWords } from '../../lib/v3/dig/door'
import { languageOf, levelOf } from '../../lib/v3/dig/levels'
import { baseTickets, DEFAULT_TICKETS, nextPass, ticketOrder, type QueuedSubject } from '../../lib/v3/dig/queue'
import { likeSubject, looksLikeName } from '../../lib/v3/dig/likes'
import { COUNTRIES, fameOf, REGION_OF } from '../../lib/v3/dig/people'
import { readThemes, themeSubject, validateTheme } from '../../lib/v3/dig/themes'
import { isOwnChannel } from '../../lib/v3/ingest/lines/dig'
import { withDig } from '../../lib/v3/tagging/atInsert'
import type { ItemTags } from '../../lib/v3/types'

const will = { id: 'entity:will-smith', label: 'Will Smith', aliases: ['will smith'] }
const video = (title: string, extra: Partial<{ viewCount: number; channelId: string; description: string; apiTags: string[]; seconds: number; live: boolean }> = {}) =>
  ({ videoId: title.slice(0, 11), title, ...extra })

test('the level is the views brought back to a mid-sized audience: a Hindi short at 300 million is not above everything', () => {
  assert.equal(levelOf(300_000_000, 'hi'), 1, 'still the mainstream')
  assert.equal(levelOf(5_000_000, 'hi'), 2, 'five million in Hindi is a known video, not a giant')
  assert.equal(levelOf(5_000_000, 'fr'), 1)
  assert.equal(levelOf(150_000, 'fr'), 2)
  assert.equal(levelOf(150_000, 'en'), 3, 'English has three times the public')
  assert.equal(levelOf(20_000, 'de'), 3)
  assert.equal(levelOf(900, 'de'), 4)
  assert.equal(levelOf(undefined, 'fr'), 4, 'no views known: the confidential')
})

test('the language: what the provider says, else the script of the title, else the subject\'s', () => {
  assert.equal(languageOf('hi-IN', 'anything', 'fr'), 'hi')
  assert.equal(languageOf(undefined, 'बिंदास बंदर', 'en'), 'hi')
  assert.equal(languageOf(undefined, '【マインクラフト】ドッキリ', 'en'), 'ja')
  assert.equal(languageOf(undefined, 'Sarkodie - Adonai', 'en'), 'en')
  assert.equal(languageOf(undefined, 'Sarkodie - Adonai', undefined), undefined)
})

test('where the subject must be named: the title on top, anywhere around (the #willsmith steak)', () => {
  const steak = video('DIY Hot Rock Lunch #howmuchatx', { description: 'steak lunch #willsmith #food', apiTags: [] })
  assert.equal(namesSubjectFor(steak, will, 'top'), false)
  assert.equal(namesSubjectFor(steak, will, 'around'), true)
  const clay = video('Will Smith fully handmade from polymer clay')
  assert.equal(namesSubjectFor(clay, will, 'top'), true)
  assert.equal(namesSubjectFor(video('Willow Smith - Wait a Minute'), will, 'top'), false, 'whole words only')
})

test('one moment, three copies: the slap does not come seven times', () => {
  const titles = [
    'Watch the uncensored moment Will Smith smacks Chris Rock at the Oscars', 'Will Smith slap compilation', 'Chris Rock on Will Smith slap',
    'A different angle of the Will Smith and Chris Rock slap', 'Jim Carrey silences Will Smith slap supporter', 'Eddie Murphy makes a Will Smith slap joke',
    'Will Smith - Miami (Official Video)', 'Will Smith bloopers',
  ]
  const { kept, refused } = capMoments(titles.map((title, index) => video(title, { viewCount: 1_000_000 - index })), will)
  assert.equal(refused, 2, 'past three copies, the slap is refused')
  assert.equal(kept.filter((item) => /slap/i.test(item.title)).length, 3)
  assert.ok(kept.some((item) => /Miami/.test(item.title)) && kept.some((item) => /bloopers/.test(item.title)), 'other moments untouched')
  assert.ok(tellingWords('Will Smith - Miami (Official Video)', will).has('miami'))
  assert.ok(!tellingWords('Will Smith - Miami (Official Video)', will).has('official'))
})

test('twins keep the most watched: two Will Smiths in clay', () => {
  const { kept, refused } = keepMostWatchedTwin([
    video('Will Smith fully handmade from polymer clay', { viewCount: 2_400 }),
    video('Will Smith handmade from polymer clay shorts', { viewCount: 900 }),
    video('Will Smith - Miami', { viewCount: 10 }),
  ], will)
  assert.equal(refused, 1)
  assert.equal(kept[0].viewCount, 2_400)
})

test('the subject\'s door: two per channel (five for its own), no live, no news desk, two interviews', () => {
  const rows = [
    video('Will Smith bloopers', { channelId: 'fan', viewCount: 9 }), video('Will Smith gag reel', { channelId: 'fan', viewCount: 8 }), video('Will Smith outtakes on set', { channelId: 'fan', viewCount: 7 }),
    video('Will Smith - Miami', { channelId: 'own', viewCount: 100 }), video('Will Smith - Switch', { channelId: 'own', viewCount: 90 }), video('Will Smith - Men in Black', { channelId: 'own', viewCount: 80 }),
    video('Will Smith live now', { channelId: 'x', live: true }), video('Will Smith arrested after court trial', { channelId: 'y', viewCount: 50 }),
    video('Will Smith interview about Bad Boys', { channelId: 'a', viewCount: 5 }), video('Will Smith interview on Aladdin', { channelId: 'b', viewCount: 4 }), video('Will Smith interview in Paris', { channelId: 'c', viewCount: 3 }),
    video('Will Smith full movie', { channelId: 'z', seconds: 3 * 3600, viewCount: 1 }),
  ]
  const { kept, refused } = subjectDoor(rows, { ...will, ownChannels: ['own'] }, 'top')
  assert.equal(kept.filter((item) => item.channelId === 'fan').length, 2)
  assert.equal(kept.filter((item) => item.channelId === 'own').length, 3)
  assert.equal(refused['direct'], 1)
  assert.equal(refused['actu people'], 1)
  assert.equal(refused['interview en trop'], 1)
  assert.equal(refused['plus de deux heures'], 1)
  assert.ok(isCelebrityNews('Que devient Amy Winehouse ?'))
  assert.ok(!isCelebrityNews('Amy Winehouse - Rehab live'))
})

test('the tickets: every base served in turns, the setting read or the default kept', () => {
  assert.deepEqual(ticketOrder(['people', 'people', 'likes', 'keywords']).slice(0, 3), ['people', 'likes', 'keywords'])
  assert.deepEqual(baseTickets('people:2,likes:1'), ['people', 'people', 'likes'])
  assert.deepEqual(baseTickets('nope:3'), DEFAULT_TICKETS)
  assert.equal(DEFAULT_TICKETS.length, 10)
})

const queued = (extra: Partial<QueuedSubject>): QueuedSubject => ({
  _id: 'entity:x', label: 'X', aliases: [], kind: 'entity', base: 'people', fame: 'known', state: 'queued', priority: 0, passes: {}, channelsToRead: [], ingested: 0, searches: 0, depthTarget: 150, createdAt: new Date(), ...extra,
})

test('the passes of a name: top, around as many times as its fame allows, its channels, Dailymotion, then done', () => {
  const rec = { at: new Date(), read: 0, kept: 0, inserted: 0, searches: 1 }
  assert.equal(nextPass(queued({})), 'top')
  assert.equal(nextPass(queued({ passes: { top: [rec] } })), 'around')
  assert.equal(nextPass(queued({ passes: { top: [rec], around: [rec, rec] } })), 'dailymotion', 'no channel met: straight to Dailymotion')
  assert.equal(nextPass(queued({ passes: { top: [rec], around: [rec, rec] }, channelsToRead: [{ id: 'c', title: 'c', hits: 2 }] })), 'channel')
  assert.equal(nextPass(queued({ fame: 'star', passes: { top: [rec], around: [rec, rec] } })), 'around', 'a star goes around five times')
  assert.equal(nextPass(queued({ passes: { top: [rec], around: [rec, rec], dailymotion: [rec] } })), null)
})

test('the passes of a theme: top once, then one angle per call until they run out', () => {
  const rec = { at: new Date(), read: 0, kept: 0, inserted: 0, searches: 1 }
  const theme = queued({ _id: 'topic:ventriloque', kind: 'topic', base: 'keywords', angles: ['amateur', '1980s'], done: [] })
  assert.equal(nextPass(theme), 'top')
  assert.equal(nextPass({ ...theme, passes: { top: [rec] } }), 'around')
  assert.equal(nextPass({ ...theme, passes: { top: [rec] }, done: ['amateur'] }), 'around')
  assert.equal(nextPass({ ...theme, passes: { top: [rec] }, done: ['amateur', '1980s'] }), 'dailymotion')
  assert.equal(themeQuery('ventriloquist', 'amateur', undefined), 'ventriloquist amateur|homemade|home video|backyard')
  assert.equal(themeQuery('ventriloquist', '1980s', undefined), 'ventriloquist 1980s')
  assert.equal(themeAngles().length, 11)
})

test('around a person: the exact name, then a group of angle words, in the subject\'s language', () => {
  assert.equal(personQuery('Will Smith', PERSON_ANGLES[3], 'en'), '"Will Smith" homemade|handmade|fan made|clay|drawing|cake|fan art|lego|stop motion')
  assert.equal(personQuery('Omar Sy', PERSON_ANGLES[0], 'fr'), '"Omar Sy" bêtisier|coulisses|tournage|making of')
})

test('the theme list reads, every theme has a universe, and a theme is a known-level subject with all its angles', () => {
  const themes = readThemes()
  assert.ok(themes.length >= 250, `${themes.length} themes`)
  assert.equal(new Set(themes.map((theme) => theme.slug)).size, themes.length, 'slugs are unique')
  const ventriloque = themes.find((theme) => theme.slug === 'ventriloque')!
  const subject = themeSubject(ventriloque)
  assert.equal(subject._id, 'topic:ventriloque')
  assert.equal(subject.base, 'keywords')
  assert.equal(subject.angles?.length, 11)
  assert.ok(subject.aliases.includes('ventriloque') && subject.aliases.includes('ventriloquist'))
  assert.throws(() => validateTheme({ slug: 'x', fr: 'x', en: 'x', universe: 'nope' as never }))
})

test('fame by how many Wikipedias know a person', () => {
  assert.equal(fameOf(120), 'star')
  assert.equal(fameOf(20), 'known')
  assert.equal(fameOf(5), 'small')
})

test('what the dig found is about what it searched: the subject first, the line and the dig block written', () => {
  const tags: ItemTags = { subjects: [{ id: 'entity:chris-rock', role: 'primary', evidence: 'alias' }], universe: 'cinema-tv', moods: [], angle: 'other', popularity: 'mainstream', era: 'recent', line: 'legacy', usable: true, tagVersion: 1, taggedAt: new Date() }
  const tagged = withDig(tags, { subjectId: 'entity:will-smith', base: 'people', level: 1, pass: 'top' })
  assert.deepEqual(tagged.subjects.map((subject) => [subject.id, subject.role, subject.evidence]), [['entity:will-smith', 'primary', 'search-verified'], ['entity:chris-rock', 'secondary', 'alias']])
  assert.equal(tagged.line, 'dig')
  assert.equal(tagged.dig?.level, 1)
})

test('every country the dig knows sits in a region, and the world has at least six of them', () => {
  for (const code of Object.keys(COUNTRIES)) assert.ok(REGION_OF[code], `${code} has a region`)
  assert.ok(new Set(Object.values(REGION_OF)).size >= 6)
})

test('the subject\'s own channel is known spaced or glued: AvrilLavigneVEVO is Avril Lavigne', () => {
  const avril = { label: 'Avril Lavigne', aliases: [] }
  assert.ok(isOwnChannel(avril, 'AvrilLavigneVEVO'))
  assert.ok(isOwnChannel(avril, 'Avril Lavigne'))
  assert.ok(!isOwnChannel(avril, 'Lavigne Fan Club'))
})

test('a theme answers to its plural and to its description: "Weird Japanese Ads Compilation" is a Japanese commercial', () => {
  assert.deepEqual(aliasForms('japanese ad').sort(), ['japanese ad', 'japanese ades', 'japanese ads'].sort())
  assert.ok(aliasForms('commercials').includes('commercial'))
  const theme = { id: 'topic:pubs-japonaises', label: 'japanese commercials', aliases: ['japanese ad', 'japanese commercial', 'cm'], kind: 'topic' as const }
  assert.ok(namesSubjectFor(video('Weird Japanese Ads Compilation'), theme, 'top'))
  assert.ok(namesSubjectFor(video('The strangest thing on TV', { description: 'a japanese commercial from 1987' }), theme, 'top'), 'a theme is read in the description on every pass')
  assert.ok(!namesSubjectFor(video('The strangest thing on TV', { description: 'a commercial from 1987' }), theme, 'top'))
})

test('the subject of a like, in the owner\'s words: a name is dug like a star, a theme gets its angles, the liked channel is read first', () => {
  const item = { _id: new ObjectId(), channelId: 'UCamy', channelTitle: 'Amy Winehouse', lang: 'en', v3: { universe: 'music' as const } }
  const name = likeSubject({ itemId: String(item._id), digSubject: { label: 'Amy Winehouse' } }, item)!
  assert.equal(name._id, 'entity:amy-winehouse')
  assert.equal(name.base, 'likes')
  assert.equal(name.fame, 'star')
  assert.deepEqual(name.channelsToRead, [{ id: 'UCamy', title: 'Amy Winehouse', hits: 5 }])
  const theme = likeSubject({ itemId: 'x', digSubject: { label: 'pub tv 1994' } }, undefined)!
  assert.equal(theme._id, 'topic:pub-tv-1994')
  assert.equal(theme.kind, 'topic')
  assert.equal(theme.angles?.length, 11)
  assert.equal(likeSubject({ itemId: 'x', digSubject: { label: ' ' } }, undefined), null)
  assert.ok(looksLikeName('Dr. Mike') && !looksLikeName('lieux abandonnés'))
})

test('a street named after the subject is not the subject', () => {
  const schuman = { label: 'Robert Schuman', aliases: ['robert schuman'] }
  assert.ok(isAddressOf('Siticash: 26 Bd Robert Schuman, 93 Livry Gargan #bonplan', schuman))
  assert.ok(isAddressOf('Lycée Robert Schuman - journée portes ouvertes', schuman))
  assert.ok(!isAddressOf('Robert Schuman, le père de l\'Europe (archive 1950)', schuman))
  assert.ok(!isAddressOf('Discours de Robert Schuman, 9 mai 1950', schuman))
  const { refused } = subjectDoor([video('Siticash: 26 Bd Robert Schuman, 93 Livry Gargan', { viewCount: 5 })], { id: 'entity:robert-schuman', ...schuman }, 'top')
  assert.equal(refused['adresse'], 1)
})
