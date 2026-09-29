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
 * Written in the runner's form: `run(ctx)`, nothing else exported.
 */

import type { Document } from 'mongodb'

import { subjectDoor, type DoorSubject } from '../../dig/door'
import { PERSON_ANGLES, personQuery, themeQuery } from '../../dig/angles'
import { languageOf, levelOf } from '../../dig/levels'
import { playable, searchDailymotion } from '../../dig/dailymotion'
import { REGION_OF } from '../../dig/people'
import { baseTickets, countryTurns, enqueue, installQueueIndexes, markDone, nextPass, PLAN, QUEUE, recordPass, rememberChannels, takeSubject, ticketOrder, type QueuedSubject } from '../../dig/queue'
import { queueTrends } from '../../dig/trends'
import type { DigVideo } from '../../dig/video'
import { LIST_UNITS, PAGE_SIZE, playlistPage, searchPage, SEARCH_UNITS, uploadsPlaylist, videoDetails } from '../../dig/youtube'
import { writeSubjects } from '../../subjects/build'
import { normalize } from '../../tagging/normalize'
import { emptyCounters } from '../journal'
import { addAdmission, type LineContext, type LineResult } from '../context'
import type { DigBase, DigLevel, DigPass, DigTags, SubjectSource } from '../../types'

const META = 'dig_meta_v4'
/** Left before the deadline, the run stops between two passes. */
const DEADLINE_MARGIN_MS = 60_000
/** Rounds over the tickets in one run: a star needs several to get all its passes. */
const MAX_ROUNDS = 12
/** Pages of a channel read in one pass: a hundred videos. */
const CHANNEL_PAGES = 2
/** A channel that named the subject this often is worth a subject of its own. */
const SNOWBALL_HITS = 3
const SNOWBALL_PER_RUN = 5

type Served = { id: string; label: string; base: DigBase; pass: DigPass; query?: string; read: number; kept: number; inserted: number; levels: Record<string, number> }
export type DigCursorNote = { served: Served[]; units: number; note: string }

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const sourceOf = (base: DigBase): SubjectSource => (base === 'keywords' ? 'combo' : base === 'trends' ? 'trend' : base === 'likes' ? 'like' : 'mainstream')

function doorSubject(subject: QueuedSubject): DoorSubject {
  return { id: subject._id, label: subject.label, aliases: subject.aliases, ownChannels: subject.ownChannels }
}

/** The subject's own channel: its title carries the subject's name. */
function isOwnChannel(subject: QueuedSubject, channelTitle: string | undefined): boolean {
  if (!channelTitle) return false
  const title = normalize(channelTitle)
  return [subject.label, ...subject.aliases].some((alias) => alias.length >= 4 && title.includes(normalize(alias)))
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
  const door = subjectDoor(videos, { ...doorSubject(subject), ownChannels: [...own, ...videos.filter((video) => isOwnChannel(subject, video.channelTitle)).map((video) => video.channelId ?? '')] }, pass, run.requireName ?? true)
  const levels: Record<string, number> = {}
  const admitted = door.kept.map((video) => {
    const lang = languageOf(video.declaredLang, video.title, subject.lang)
    const level: DigLevel = levelOf(video.viewCount, lang)
    levels[level] = (levels[level] ?? 0) + 1
    const dig: DigTags = { subjectId: subject._id, base: subject.base, level, pass, ...(lang ? { lang } : {}) }
    const { seconds: _seconds, live: _live, declaredLang: _lang, ...raw } = video
    void _seconds; void _live; void _lang
    return { ...raw, digHint: dig, ...(subject.universe ? { universeHint: subject.universe } : {}), contextQueries: [`dig:${subject.base}:${subject._id}`, run.query], source: { name: `dig:${subject.base}` } }
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
    await admitPass(runner.ctx, { subject, pass: 'channel', query: `chaîne ${channel.title}`, videos: own ? videos.slice(0, 40) : videos, provider: 'youtube', units, requireName: !own }, runner.counters, runner.served)
    readIds.push(channel.id)
    if (runner.youtubeStopped) break
  }
  const marked = subject.channelsToRead.map((channel) => (readIds.includes(channel.id) ? { ...channel, read: true } : channel))
  const inserted = runner.served.filter((entry) => entry.id === subject._id && entry.pass === 'channel').reduce((sum, entry) => sum + entry.inserted, 0)
  await recordPass(runner.ctx.db, subject._id, 'channel', { at: new Date(), read: 0, kept: 0, inserted, searches: 0, label: `${readIds.length} chaînes` }, own ? {} : { channelsToRead: marked })
  if (own) await markDone(runner.ctx.db, subject._id)
}

async function runDailymotion(runner: Runner, subject: QueuedSubject): Promise<void> {
  const done = (subject.passes.dailymotion ?? []).length
  const query = done === 0 ? subject.label : `${subject.label} ${subject.lang === 'fr' ? 'archive' : 'rare'}`
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
  if (!key) ctx.log('youtube : pas de clé, seule Dailymotion sera lue')
  await installQueueIndexes(ctx.db).catch(() => undefined)

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
  const servedIds = new Set<string>()
  const declared = new Set<string>()
  let idle = 0
  rounds: for (let round = 0; round < MAX_ROUNDS; round += 1) {
    let servedThisRound = 0
    for (const base of tickets) {
      if (ctx.timeLeft() < DEADLINE_MARGIN_MS) { errors.push('échéance atteinte'); break rounds }
      const country = base === 'people' && countries.length ? countries[countryTurn++ % countries.length] : undefined
      const subject = (await takeSubject(ctx.db, base, new Set(), country)) ?? (country ? await takeSubject(ctx.db, base, new Set()) : null) ?? (await takeSubject(ctx.db, 'snowball', new Set()))
      if (!subject) continue
      const pass = nextPass(subject)
      if (!pass) continue
      if (runner.youtubeStopped && pass !== 'dailymotion') continue
      servedIds.add(subject._id)
      servedThisRound += 1
      await declareSubject(ctx, subject, declared)
      try {
        await runPass(runner, subject, pass)
        await snowball(runner, subject)
      } catch (error) {
        errors.push(`${subject.label} (${pass}) : ${message(error)}`)
        if (/HTTP 403|HTTP 429/.test(message(error))) { runner.youtubeStopped = true; ctx.log('youtube : refus, plus de YouTube ce passage') }
      }
      const refreshed = await ctx.db.collection<QueuedSubject>(QUEUE).findOne({ _id: subject._id })
      if (refreshed && !nextPass(refreshed)) await markDone(ctx.db, subject._id)
    }
    if (!servedThisRound) { idle += 1; if (idle >= 2) break }
    if (runner.youtubeStopped && !runner.served.some((entry) => entry.pass === 'dailymotion' && entry.read)) break
  }

  const note = `${servedIds.size} sujets · ${runner.served.length} passes · ${runner.units} unités · ${counters.inserted} vidéos entrées`
  ctx.log(note)
  const cursor: DigCursorNote = { served: runner.served, units: runner.units, note }
  return { counters, cursor, errors }
}
