/**
 * The dig: one line for the four bases (the owner, 28 September 2026).
 *
 * The queue holds subjects — names and themes — from the people of a
 * country, the theme list, yesterday's Wikipedia and the owner's likes. Each
 * run serves them base after base, as the tickets say, and gives each its
 * next pass: the top of the subject (its most watched videos), around it
 * (angle words: bloopers, homemade, parodies, beginnings, the street), its
 * channels (read for one unit a page, the cheap way down the ladder), then
 * Dailymotion for the archives. Every video enters with its subject, base,
 * level and pass written on it; the common door (ads, serials, AI) and the
 * subject's door (names it, two per channel, one moment three times, twins,
 * interviews, news) stand in front.
 *
 * Written in the runner's form: `run(ctx)`; `isOwnChannel` is exported for its test.
 */

import type { Document } from 'mongodb'

import { subjectDoor, type DoorSubject } from '../../dig/door'
import { PERSON_ANGLES, personQuery, themeQuery } from '../../dig/angles'
import { languageOf, levelOf } from '../../dig/levels'
import { playable, searchDailymotion } from '../../dig/dailymotion'
import { REGION_OF } from '../../dig/people'
import { baseTickets, countryTurns, enqueue, installQueueIndexes, markDone, nextPass, PLAN, QUEUE, recordPass, rememberChannels, takeSubject, ticketOrder, universeTurns, type QueuedSubject } from '../../dig/queue'
import { queueLikes } from '../../dig/likes'
import { readThemes, themeSubject } from '../../dig/themes'
import { curatorOwnerId } from '@/lib/discovery/curatorAuth'
import { queueTrends } from '../../dig/trends'
import { computeUniverseRecap, recapNote, writeUniverseRecap } from '../../pools/recap'
import { censusNote, computeCardCensus, writeCardCensus } from '../../cards/census'
import { channelKey } from '../../tagging/classify'
import type { DigVideo } from '../../dig/video'
import { LIST_UNITS, PAGE_SIZE, playlistPage, searchPage, SEARCH_UNITS, uploadsPlaylist, videoDetails } from '../../dig/youtube'
import { writeSubjects } from '../../subjects/build'
import { normalize } from '../../tagging/normalize'
import { emptyCounters } from '../journal'
import { addAdmission, type LineContext, type LineResult } from '../context'
import type { DigBase, DigLevel, DigPass, DigTags, SubjectSource, Universe } from '../../types'

const META = 'dig_meta_v4'
/** Left before the deadline, the run stops between two passes. */
const DEADLINE_MARGIN_MS = 60_000
/** Rounds over the tickets in one run; a round with nothing to serve twice ends it. */
const MAX_ROUNDS = 40
/** Pages of a channel read in one pass: two hundred videos, for four units. */
const CHANNEL_PAGES = 4
/** A channel that named the subject this often is worth a subject of its own. */
const SNOWBALL_HITS = 3
const SNOWBALL_PER_RUN = 20
/**
 * Passes a subject gets in a row in one run: one YouTube search (its top, or
 * one search around), then everything that costs nothing — Dailymotion, the
 * channels met — until it is done. The searches stay spread over many
 * subjects; the depth comes from the free passes (the owner, 30 September:
 * never the whole quota on one thing).
 */
const PASSES_IN_A_ROW = 12
const SEARCHES_PER_SUBJECT_PER_RUN = 1
/**
 * What one channel may bring in over a week, whatever the subject or the pass:
 * the audit of 30 September–1 October found the biggest channels were all
 * media outlets on Dailymotion — showbiz agencies, trailer and press
 * channels — at eighty videos each in two days. A limit, not a refusal: a
 * person who posts three videos a week gives all three. The subject's own
 * channels are not counted (a star's channel is read on purpose).
 */
const WEEKLY_PER_CHANNEL = Number(process.env.RANDOM_DIG_WEEKLY_PER_CHANNEL ?? 20)
const WEEK_MS = 7 * 86_400_000
/** This run's counts per channel: what the week already holds, plus what the run admits. */
let weekCounts = new Map<string, number>()

/** The kept videos under the week's cap per channel; the refused count goes with the door's. */
async function underWeeklyCap(ctx: LineContext, kept: DigVideo[], provider: string, own: Set<string>): Promise<{ kept: DigVideo[]; refused: number }> {
  const out: DigVideo[] = []
  let refused = 0
  const since = new Date(Date.now() - WEEK_MS)
  for (const video of kept) {
    const key = channelKey({ provider, channelId: video.channelId })
    if (!key || own.has(video.channelId ?? '')) { out.push(video); continue }
    let count = weekCounts.get(key)
    if (count === undefined) count = await ctx.db.collection('items').countDocuments({ 'v3.channelKey': key, createdAt: { $gte: since } }, { hint: 'v3_channel_key', maxTimeMS: 4000 }).catch(() => 0)
    if (count >= WEEKLY_PER_CHANNEL) { refused += 1; weekCounts.set(key, count); continue }
    weekCounts.set(key, count + 1)
    out.push(video)
  }
  return { kept: out, refused }
}

type Served = { id: string; label: string; base: DigBase; pass: DigPass; query?: string; read: number; kept: number; inserted: number; levels: Record<string, number> }
export type DigCursorNote = { served: Served[]; units: number; note: string }

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const sourceOf = (base: DigBase): SubjectSource => (base === 'keywords' ? 'combo' : base === 'trends' ? 'trend' : base === 'likes' ? 'like' : 'mainstream')

function doorSubject(subject: QueuedSubject): DoorSubject {
  return { id: subject._id, label: subject.label, aliases: subject.aliases, ownChannels: subject.ownChannels, kind: subject.kind }
}

/**
 * The theme list as the owner last saved it, taken at every run: a theme he
 * added is queued, one he removed is paused, the others keep their passes.
 */
async function reloadThemes(ctx: LineContext): Promise<void> {
  let themes: ReturnType<typeof readThemes>
  try { themes = readThemes() } catch (error) { ctx.log(`thèmes : liste illisible, ${message(error)}`); return }
  const subjects = themes.map(themeSubject)
  const result = await enqueue(ctx.db, subjects)
  const paused = await ctx.db.collection<QueuedSubject>(QUEUE).updateMany({ base: 'keywords', kind: 'topic', _id: { $nin: subjects.map((subject) => subject._id) }, state: { $ne: 'paused' } } as Document, { $set: { state: 'paused' } })
  if (result.inserted || paused.modifiedCount) ctx.log(`thèmes : ${result.inserted} nouveaux, ${paused.modifiedCount} retirés de la liste`)
}

/** The subject's own channel: its title carries the subject's name, spaced or glued ("AvrilLavigneVEVO"). */
export function isOwnChannel(subject: Pick<QueuedSubject, 'label' | 'aliases'>, channelTitle: string | undefined): boolean {
  if (!channelTitle) return false
  const title = normalize(channelTitle)
  const glued = title.replace(/ /g, '')
  return [subject.label, ...subject.aliases].some((alias) => {
    const name = normalize(alias)
    return name.length >= 4 && (title.includes(name) || glued.includes(name.replace(/ /g, '')))
  })
}

/** The subject in the dictionary the tagger and the Wave read, once per run. */
async function declareSubject(ctx: LineContext, subject: QueuedSubject, declared: Set<string>): Promise<void> {
  if (declared.has(subject._id) || ctx.dryRun) return
  declared.add(subject._id)
  await writeSubjects(ctx.db, [{
    _id: subject._id, kind: subject.kind === 'topic' ? 'topic' : 'entity', label: subject.label,
    aliases: [...new Set([subject.label, ...subject.aliases].map(normalize).filter((alias) => alias.length >= 2))],
    universe: subject.universe ?? 'other', sources: [sourceOf(subject.base)], counts: {}, angleCounts: {}, createdAt: new Date(), ambiguous: false,
  }]).catch((error) => ctx.log(`dictionnaire : ${message(error)}`))
}

type Pass = { subject: QueuedSubject; pass: DigPass; query: string; videos: DigVideo[]; provider: 'youtube' | 'dailymotion'; units: number; requireName?: boolean; keepAngles?: boolean }

/** The subject's door, the level of each, the common door: what one pass leaves in the catalogue. */
async function admitPass(ctx: LineContext, run: Pass, counters: LineResult['counters'], served: Served[]): Promise<{ kept: DigVideo[]; inserted: number }> {
  const { subject, pass, videos } = run
  const own = subject.ownChannels ?? []
  const ownIds = [...own, ...videos.filter((video) => isOwnChannel(subject, video.channelTitle)).map((video) => video.channelId ?? '')]
  const door = subjectDoor(videos, { ...doorSubject(subject), ownChannels: ownIds }, pass, run.requireName ?? true)
  // The week's cap per channel, on what the door kept (the audit of 1 October: media outlets at eighty videos in two days).
  const weekly = await underWeeklyCap(ctx, door.kept, run.provider, new Set(ownIds))
  if (weekly.refused) door.refused['chaîne cette semaine'] = (door.refused['chaîne cette semaine'] ?? 0) + weekly.refused
  door.kept = weekly.kept
  const levels: Record<string, number> = {}
  const admitted = door.kept.map((video) => {
    const lang = languageOf(video.declaredLang, video.title, subject.lang)
    const level: DigLevel = levelOf(video.viewCount, lang)
    levels[level] = (levels[level] ?? 0) + 1
    const dig: DigTags = { subjectId: subject._id, base: subject.base, level, pass, ...(lang ? { lang } : {}) }
    const { seconds: _seconds, live: _live, declaredLang: _lang, ...raw } = video
    void _seconds; void _live; void _lang
    // A probe's universe is its list's, not necessarily the video's ("South Korea" in the street foods): the tagger reads the video itself.
    return { ...raw, digHint: dig, ...(subject.universe && !subject.probe ? { universeHint: subject.universe } : {}), contextQueries: [`dig:${subject.base}:${subject._id}`, run.query], source: { name: `dig:${subject.base}` } }
  })
  const result = await ctx.admit({ subjectId: subject._id, videos: admitted, keepAngles: run.keepAngles ?? false })
  addAdmission(counters, { ...result, scanned: videos.length, rejected: { ...result.rejected, ...door.refused } })
  counters.byProvider = { ...(counters.byProvider ?? {}), [run.provider]: ((counters.byProvider ?? {})[run.provider] ?? 0) + result.inserted }
  await ctx.search({ provider: run.provider, query: run.query, subjectId: subject._id, scanned: videos.length, kept: door.kept.length, inserted: result.inserted, duplicates: result.duplicates, rejected: { ...result.rejected, ...door.refused }, quotaUnits: run.units, insertedIds: result.insertedIds })
  served.push({ id: subject._id, label: subject.label, base: subject.base, pass, query: run.query, read: videos.length, kept: door.kept.length, inserted: result.inserted, levels })
  return { kept: door.kept, inserted: result.inserted }
}

/** Channels met in a pass, by how many of the kept videos they gave; the subject's own left out of the snowball. */
function channelsOf(subject: QueuedSubject, kept: DigVideo[]): Array<{ id: string; title: string; hits: number; own: boolean }> {
  const seen = new Map<string, { id: string; title: string; hits: number; own: boolean }>()
  for (const video of kept) {
    if (!video.channelId) continue
    const known = seen.get(video.channelId) ?? { id: video.channelId, title: video.channelTitle ?? video.channelId, hits: 0, own: isOwnChannel(subject, video.channelTitle) }
    known.hits += 1
    seen.set(video.channelId, known)
  }
  return [...seen.values()]
}

type Runner = { ctx: LineContext; key: string; http: typeof fetch; counters: LineResult['counters']; errors: string[]; served: Served[]; youtubeStopped: boolean; snowballed: number; units: number }

/** A YouTube search page, then its details: null when the quota is out. */
async function readSearch(runner: Runner, query: string, order: 'viewCount' | 'relevance', lang: string | undefined, pageToken?: string): Promise<{ videos: DigVideo[]; next?: string; units: number } | null> {
  if (!(await runner.ctx.quota.reserve(SEARCH_UNITS))) { runner.youtubeStopped = true; runner.ctx.log('youtube : budget du jour atteint'); return null }
  runner.units += SEARCH_UNITS
  const page = await searchPage(runner.key, query, order, { pageToken, lang, request: runner.http })
  if (!page.ids.length) return { videos: [], next: undefined, units: SEARCH_UNITS }
  if (!(await runner.ctx.quota.reserve(LIST_UNITS))) { runner.youtubeStopped = true; return null }
  runner.units += LIST_UNITS
  return { videos: await videoDetails(runner.key, page.ids, runner.http), next: page.nextPageToken, units: SEARCH_UNITS + LIST_UNITS }
}

async function runTop(runner: Runner, subject: QueuedSubject): Promise<void> {
  const query = subject.kind === 'entity' ? `"${subject.label}"` : subject.label
  const pages = PLAN[subject.fame].topPages
  let token: string | undefined
  const all: DigVideo[] = []
  let units = 0
  for (let page = 0; page < pages; page += 1) {
    const read = await readSearch(runner, query, 'viewCount', subject.lang, token)
    if (!read) break
    all.push(...read.videos); units += read.units; token = read.next
    if (!token) break
  }
  const { kept, inserted } = await admitPass(runner.ctx, { subject, pass: 'top', query, videos: all, provider: 'youtube', units, keepAngles: true }, runner.counters, runner.served)
  const channels = channelsOf(subject, kept)
  await rememberChannels(runner.ctx.db, subject._id, channels.filter((channel) => !channel.own))
  const own = channels.filter((channel) => channel.own).map((channel) => channel.id)
  await recordPass(runner.ctx.db, subject._id, 'top', { at: new Date(), read: all.length, kept: kept.length, inserted, searches: units / SEARCH_UNITS, label: query }, own.length ? { ownChannels: [...new Set([...(subject.ownChannels ?? []), ...own])] } : {})
}

async function runAround(runner: Runner, subject: QueuedSubject): Promise<void> {
  const done = (subject.passes.around ?? []).length
  let query: string
  let angle: string | undefined
  if (subject.kind === 'topic') {
    angle = (subject.angles ?? []).find((candidate) => !(subject.done ?? []).includes(candidate))
    if (!angle) return markDone(runner.ctx.db, subject._id)
    query = themeQuery(subject.label, angle, subject.lang)
  } else {
    query = personQuery(subject.label, PERSON_ANGLES[done % PERSON_ANGLES.length], subject.lang)
  }
  const read = await readSearch(runner, query, 'relevance', subject.lang)
  if (!read) return
  const { kept, inserted } = await admitPass(runner.ctx, { subject, pass: 'around', query, videos: read.videos, provider: 'youtube', units: read.units }, runner.counters, runner.served)
  const channels = channelsOf(subject, kept)
  await rememberChannels(runner.ctx.db, subject._id, channels.filter((channel) => !channel.own))
  await recordPass(runner.ctx.db, subject._id, 'around', { at: new Date(), read: read.videos.length, kept: kept.length, inserted, searches: 1, label: query }, angle ? { done: [...(subject.done ?? []), angle] } : {})
}

async function runChannel(runner: Runner, subject: QueuedSubject): Promise<void> {
  const own = subject.kind === 'channel'
  const targets = own
    ? [{ id: subject._id.replace(/^channel:youtube:/, ''), title: subject.label, hits: 0 }]
    : [...subject.channelsToRead].filter((channel) => !channel.read).sort((left, right) => right.hits - left.hits).slice(0, PLAN[subject.fame].channels)
  const readIds: string[] = []
  for (const channel of targets) {
    if (runner.ctx.timeLeft() < DEADLINE_MARGIN_MS) break
    if (!(await runner.ctx.quota.reserve(LIST_UNITS))) { runner.youtubeStopped = true; break }
    runner.units += LIST_UNITS
    let playlist: string | null = null
    try { playlist = await uploadsPlaylist(runner.key, channel.id, runner.http) } catch (error) { runner.errors.push(`chaîne ${channel.title} : ${message(error)}`); continue }
    if (!playlist) { readIds.push(channel.id); continue }
    const ids: string[] = []
    let token: string | undefined
    for (let page = 0; page < CHANNEL_PAGES; page += 1) {
      if (!(await runner.ctx.quota.reserve(LIST_UNITS))) { runner.youtubeStopped = true; break }
      runner.units += LIST_UNITS
      try {
        const read = await playlistPage(runner.key, playlist, token, runner.http)
        ids.push(...read.ids); token = read.nextPageToken
      } catch (error) { runner.errors.push(`chaîne ${channel.title} : ${message(error)}`); break }
      if (!token) break
    }
    const videos: DigVideo[] = []
    let units = LIST_UNITS * (1 + CHANNEL_PAGES)
    for (let start = 0; start < ids.length; start += PAGE_SIZE) {
      if (!(await runner.ctx.quota.reserve(LIST_UNITS))) { runner.youtubeStopped = true; break }
      runner.units += LIST_UNITS; units += LIST_UNITS
      try { videos.push(...await videoDetails(runner.key, ids.slice(start, start + PAGE_SIZE), runner.http)) } catch (error) { runner.errors.push(`chaîne ${channel.title} : ${message(error)}`) }
    }
    await admitPass(runner.ctx, { subject, pass: 'channel', query: `chaîne ${channel.title}`, videos: own ? videos.slice(0, 100) : videos, provider: 'youtube', units, requireName: !own }, runner.counters, runner.served)
    readIds.push(channel.id)
    if (runner.youtubeStopped) break
  }
  const marked = subject.channelsToRead.map((channel) => (readIds.includes(channel.id) ? { ...channel, read: true } : channel))
  const inserted = runner.served.filter((entry) => entry.id === subject._id && entry.pass === 'channel').reduce((sum, entry) => sum + entry.inserted, 0)
  await recordPass(runner.ctx.db, subject._id, 'channel', { at: new Date(), read: 0, kept: 0, inserted, searches: 0, label: `${readIds.length} chaînes` }, own ? {} : { channelsToRead: marked })
  if (own) await markDone(runner.ctx.db, subject._id)
}

/** The Dailymotion queries of a subject, one per pass: the name, then the archives, the rare, the live; a theme goes amateur, archive, vintage. */
function dailymotionQuery(subject: QueuedSubject, done: number): string {
  const fr = subject.lang === 'fr'
  const words = subject.kind === 'topic'
    ? [subject.label, `${subject.label} ${fr ? 'amateur' : 'amateur'}`, `${subject.label} ${fr ? 'archive' : 'archive'}`, `${subject.label} ${fr ? 'vintage' : 'vintage'}`]
    : [subject.label, `${subject.label} ${fr ? 'archive' : 'archive'}`, `${subject.label} ${fr ? 'rare' : 'rare'}`, `${subject.label} ${fr ? 'live' : 'live'}`]
  return words[done % words.length]
}

async function runDailymotion(runner: Runner, subject: QueuedSubject): Promise<void> {
  const done = (subject.passes.dailymotion ?? []).length
  const query = dailymotionQuery(subject, done)
  let videos: DigVideo[] = []
  try { videos = await searchDailymotion(query, done === 0 ? 'visited' : 'relevance', runner.http) } catch (error) { runner.errors.push(`dailymotion "${query}" : ${message(error)}`) }
  // The player refuses one in eight of what the API lists: asked before the video is stored, never after.
  const checked: DigVideo[] = []
  for (const video of subjectDoor(videos, doorSubject(subject), 'dailymotion').kept) if (await playable(video.videoId, runner.http)) checked.push(video)
  const { inserted } = await admitPass(runner.ctx, { subject, pass: 'dailymotion', query, videos: checked, provider: 'dailymotion', units: 0 }, runner.counters, runner.served)
  await recordPass(runner.ctx.db, subject._id, 'dailymotion', { at: new Date(), read: videos.length, kept: checked.length, inserted, searches: 0, label: query })
}

/** Channels that named the subject often become subjects of their own: the snowball. */
async function snowball(runner: Runner, subject: QueuedSubject): Promise<void> {
  if (runner.snowballed >= SNOWBALL_PER_RUN || runner.ctx.dryRun) return
  const row = await runner.ctx.db.collection<QueuedSubject>(QUEUE).findOne({ _id: subject._id }, { projection: { channelsToRead: 1, ownChannels: 1 } })
  const own = new Set(row?.ownChannels ?? [])
  const worthy = (row?.channelsToRead ?? []).filter((channel) => channel.hits >= SNOWBALL_HITS && !own.has(channel.id)).slice(0, SNOWBALL_PER_RUN - runner.snowballed)
  if (!worthy.length) return
  const result = await enqueue(runner.ctx.db, worthy.map((channel) => ({
    _id: `channel:youtube:${channel.id}`, label: channel.title, aliases: [], kind: 'channel' as const, base: 'snowball' as const, fame: 'small' as const,
    lang: subject.lang, universe: subject.universe, priority: 5, source: { from: subject._id, hits: channel.hits },
  })))
  runner.snowballed += result.inserted
  if (result.inserted) runner.ctx.log(`boule de neige : ${result.inserted} chaîne(s) autour de ${subject.label}`)
}

async function runPass(runner: Runner, subject: QueuedSubject, pass: DigPass): Promise<void> {
  if (pass === 'top') return runTop(runner, subject)
  if (pass === 'around') return runAround(runner, subject)
  if (pass === 'channel') return runChannel(runner, subject)
  return runDailymotion(runner, subject)
}

export async function run(ctx: LineContext): Promise<LineResult> {
  const counters = emptyCounters()
  const errors: string[] = []
  const key = process.env.YOUTUBE_API_KEY ?? ''
  const http = ctx.http ?? fetch
  const runner: Runner = { ctx, key, http, counters, errors, served: [], youtubeStopped: !key, snowballed: 0, units: 0 }
  weekCounts = new Map()
  if (!key) ctx.log('youtube : pas de clé, seule Dailymotion sera lue')
  await installQueueIndexes(ctx.db).catch(() => undefined)

  if (!ctx.dryRun) await reloadThemes(ctx).catch((error) => errors.push(`thèmes : ${message(error)}`))
  if (!ctx.dryRun) await queueLikes(ctx.db, curatorOwnerId(), ctx.log).catch((error) => errors.push(`likes : ${message(error)}`))

  // The subjects of the day, once a day, before the tickets.
  const today = new Date().toISOString().slice(0, 10)
  const meta = await ctx.db.collection(META).findOne({ _id: 'trends' } as Document).catch(() => null)
  if (meta?.day !== today && !ctx.dryRun) {
    await queueTrends(ctx.db, new Date(), http, ctx.log).catch((error) => errors.push(`tendances : ${message(error)}`))
    await ctx.db.collection(META).updateOne({ _id: 'trends' } as Document, { $set: { day: today, at: new Date() } }, { upsert: true }).catch(() => undefined)
  }

  const tickets = ticketOrder(baseTickets())
  // The people tickets go round the world: one country of each region before a second of any.
  const countries = await countryTurns(ctx.db, REGION_OF).catch(() => [] as string[])
  if (countries.length) ctx.log(`pays, dans l'ordre : ${countries.join(', ')}`)
  let countryTurn = 0
  // The keywords tickets go round the universes, and open a new probe every other ticket (lib/v3/dig/lists.ts).
  const universes = await universeTurns(ctx.db).catch(() => [] as Universe[])
  let universeTurn = 0
  let keywordTickets = 0
  const servedIds = new Set<string>()
  const declared = new Set<string>()
  let idle = 0
  rounds: for (let round = 0; round < MAX_ROUNDS; round += 1) {
    let servedThisRound = 0
    for (const base of tickets) {
      if (ctx.timeLeft() < DEADLINE_MARGIN_MS) { errors.push('échéance atteinte'); break rounds }
      const youtube = !runner.youtubeStopped
      const country = base === 'people' && countries.length ? countries[countryTurn++ % countries.length] : undefined
      const universe = base === 'keywords' && universes.length ? universes[universeTurn++ % universes.length] : undefined
      const prefer = base === 'keywords' && keywordTickets++ % 2 === 1 ? 'queued' : 'running'
      const subject = (await takeSubject(ctx.db, base, servedIds, country, youtube, universe, prefer)) ?? (country || universe ? await takeSubject(ctx.db, base, servedIds, undefined, youtube, undefined, prefer) : null) ?? (await takeSubject(ctx.db, 'snowball', servedIds, undefined, youtube))
      if (!subject) continue
      servedIds.add(subject._id)
      servedThisRound += 1
      await declareSubject(ctx, subject, declared)
      // The subject is dug in a row: one YouTube search, then Dailymotion and its channels — until it is done, the budget out, or the time up.
      let current: QueuedSubject | null = subject
      let searches = 0
      for (let step = 0; current && step < PASSES_IN_A_ROW; step += 1) {
        if (ctx.timeLeft() < DEADLINE_MARGIN_MS) break
        const pass = nextPass(current, !runner.youtubeStopped && searches < SEARCHES_PER_SUBJECT_PER_RUN)
        if (!pass) break
        if (pass === 'top' || pass === 'around') searches += 1
        try {
          await runPass(runner, current, pass)
          await snowball(runner, current)
        } catch (error) {
          errors.push(`${current.label} (${pass}) : ${message(error)}`)
          if (/HTTP 403|HTTP 429/.test(message(error))) { runner.youtubeStopped = true; ctx.log('youtube : refus, plus de YouTube ce passage') }
        }
        current = await ctx.db.collection<QueuedSubject>(QUEUE).findOne({ _id: subject._id })
      }
      if (current && !nextPass(current, true)) await markDone(ctx.db, subject._id)
    }
    if (!servedThisRound) { idle += 1; if (idle >= 2) break }
  }

  // The day's recap by universe, once a day: the nightly pools line used to write it, and the admin page reads it.
  const recapMeta = await ctx.db.collection(META).findOne({ _id: 'recap' } as Document).catch(() => null)
  if (recapMeta?.day !== today && !ctx.dryRun) {
    try {
      const recap = await computeUniverseRecap(ctx.db, new Date())
      await writeUniverseRecap(ctx.db, recap)
      await ctx.db.collection(META).updateOne({ _id: 'recap' } as Document, { $set: { day: today, at: new Date() } }, { upsert: true })
      ctx.log(`récap par univers : ${recapNote(recap)}`)
    } catch (error) {
      errors.push(`récap par univers : ${message(error)}`)
    }
  }

  // What each card of the wheel received today, after every run: the admin page reads it (lib/v3/cards/census.ts).
  if (!ctx.dryRun) {
    try {
      const census = await computeCardCensus(ctx.db, new Date())
      await writeCardCensus(ctx.db, census)
      ctx.log(`cartes : ${censusNote(census)}`)
    } catch (error) {
      errors.push(`cartes : ${message(error)}`)
    }
  }

  const note = `${servedIds.size} sujets · ${runner.served.length} passes · ${runner.units} unités · ${counters.inserted} vidéos entrées`
  ctx.log(note)
  const cursor: DigCursorNote = { served: runner.served, units: runner.units, note }
  return { counters, cursor, errors }
}
