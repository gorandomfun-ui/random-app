/**
 * The trend-subjects line: the trend as a way in.
 *
 * Reads what the world talks about today (Google Trends, Wikipedia, Giphy,
 * YouTube — see `lib/v3/trend/signals.ts`), turns it into subjects of the
 * day (`candidates.ts`), and digs those subjects for what gravitates around
 * them: not the viral video itself, but the archives, the amateur takes, the
 * angles the networks did not push (`dig.ts`). What is admitted carries the
 * line `trend` and the day of its signal as `trendObservedAt`.
 *
 * Written in the runner's form: `run(ctx)`, nothing else exported, nothing
 * here depends on GitHub or on Vercel.
 */

import { fetchWikidataByIds, fetchWikidataSubjects, searchWikidataEntity, type WikidataSubject } from '../../subjects/wikidata'
import { lookupSubjectIndex } from '../../tagging/lookup'
import { matchSubjects } from '../../tagging/subjectIndex'
import { needsSecondClue, normalize, subjectId } from '../../tagging/normalize'
import { SUBJECTS_COLLECTION } from '../../subjects/build'
import { DAILY_CAP, displayLabel, mergeCandidates, qualifies, refusalOf, textKey, type Candidate, type CandidatePiece } from '../../trend/candidates'
import { digSteps, keepForStep, searchDailymotion, searchGiphy, searchYouTube, YOUTUBE_SEARCH_UNITS, type DigSubject } from '../../trend/dig'
import { TREND_COUNTRIES, dayOf, fetchGiphyTrending, fetchTrendsSignals, fetchWikipediaSignals, fetchYouTubeMostPopular, type Signal } from '../../trend/signals'
import { emptyCounters } from '../journal'
import { addAdmission, type LineContext, type LineResult } from '../context'
import type { Universe } from '../../types'
import type { Document } from 'mongodb'

/** Mongo needs the string _id declared, otherwise it assumes an ObjectId. */
type SubjectDocument = Document & { _id: string }

export const SIGNALS_COLLECTION = 'trend_signals_v3'
/** Unknown names sent to Wikidata per run: the best-scored ones. */
const RESOLVE_AT_MOST = 60
/** Days a name is remembered as seen, so a persistent one rises. */
const PERSISTENCE_DAYS = 3
/** Between two Wikidata label searches, so sixty of them stay under its rate limit. */
const SEARCH_SPACING_MS = 250
/** Left before the deadline, the dig stops between two searches. */
const DEADLINE_MARGIN_MS = 45_000
const GIPHY_PER_QUERY = 25

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** The signal readers, each on its own: a feed that fails costs its signals, never the run. */
async function gatherSignals(ctx: LineContext, now: Date, errors: string[]): Promise<Signal[]> {
  const http = ctx.http ?? fetch
  const day = dayOf(now)
  const signals: Signal[] = []
  const gather = async (label: string, work: () => Promise<Signal[]>) => {
    try {
      const found = await work()
      signals.push(...found)
      ctx.log(`${label} : ${found.length} signaux`)
    } catch (error) {
      errors.push(`${label} : ${message(error)}`)
    }
  }
  for (const country of TREND_COUNTRIES) await gather(`trends ${country}`, () => fetchTrendsSignals(country, day, http))
  for (const country of TREND_COUNTRIES) await gather(`wikipedia ${country}`, () => fetchWikipediaSignals(country, now, http))
  const giphyKey = process.env.GIPHY_API_KEY
  if (giphyKey) await gather('giphy', () => fetchGiphyTrending(giphyKey, day, http))
  else ctx.log('giphy : pas de clé, source ignorée')
  const youtubeKey = process.env.YOUTUBE_API_KEY
  if (youtubeKey) {
    for (const country of TREND_COUNTRIES) {
      if (!(await ctx.quota.reserve(1))) { ctx.log('youtube : budget épuisé avant les plus populaires'); break }
      await gather(`youtube ${country}`, () => fetchYouTubeMostPopular(youtubeKey, country, day, http))
    }
  } else ctx.log('youtube : pas de clé, source ignorée')
  return signals
}

/** Known names first: what the dictionary recognises in a title. Unknown whole titles from Trends and Wikipedia wait for Wikidata. */
async function candidatePieces(ctx: LineContext, signals: Signal[]): Promise<CandidatePiece[]> {
  const { index, partial } = await lookupSubjectIndex(ctx.db, signals.map((signal) => signal.title))
  if (partial) ctx.log('dictionnaire lu partiellement')
  const pieces: CandidatePiece[] = []
  for (const signal of signals) {
    const whole = signal.source === 'google-trends' || signal.source === 'wikipedia'
    // A Trends query or a page title is the name itself: an ambiguous alias applies when it is the whole title.
    const matches = matchSubjects(index, signal.title, (match) => whole && normalize(signal.title) === match.alias)
      // A trend is a named thing: a theme of the dictionary ("music video", "bande-annonce") is never a subject of the day.
      .filter((match) => match.subject.kind === 'entity')
    for (const match of matches) {
      pieces.push({ key: match.subject.id, label: match.subject.label, subjectId: match.subject.id, universe: match.subject.universe as Universe, signal })
    }
    if (!matches.length && whole) pieces.push({ key: textKey(displayLabel(signal.title)), label: displayLabel(signal.title), signal })
  }
  return pieces
}

/** Unknown names asked of Wikidata: page titles by edition, Trends queries by label search. */
async function resolveUnknown(ctx: LineContext, candidates: Candidate[], errors: string[]): Promise<{ resolved: CandidatePiece[]; unresolved: number }> {
  const http = ctx.http ?? fetch
  const unknown = candidates.filter((candidate) => !candidate.subjectId).sort((a, b) => b.score - a.score).slice(0, RESOLVE_AT_MOST)
  const byCandidate = new Map<Candidate, WikidataSubject>()

  // Wikipedia titles, fifty per edition per call.
  const byLanguage = new Map<string, Candidate[]>()
  for (const candidate of unknown) {
    const page = candidate.signals.find((signal) => signal.page)
    if (page?.page) byLanguage.set(page.lang, [...(byLanguage.get(page.lang) ?? []), candidate])
  }
  for (const [language, group] of byLanguage) {
    try {
      const titles = group.map((candidate) => candidate.signals.find((signal) => signal.page)!.page!)
      const entities = await fetchWikidataSubjects(language, titles, undefined, http)
      for (const candidate of group) {
        const title = candidate.signals.find((signal) => signal.page)!.page!.replace(/_/g, ' ')
        const entity = entities.find((found) => found.sourceTitle.replace(/_/g, ' ') === title)
        if (entity) byCandidate.set(candidate, entity)
      }
    } catch (error) {
      errors.push(`wikidata ${language} : ${message(error)}`)
    }
  }
  // Trends queries, one label search each, then the entities by id.
  const searches: Array<{ candidate: Candidate; qid: string }> = []
  for (const candidate of unknown) {
    if (byCandidate.has(candidate)) continue
    const lang = candidate.signals[0]?.lang ?? 'en'
    try {
      const qid = await searchWikidataEntity(candidate.label, lang, undefined, http)
      if (qid) searches.push({ candidate, qid })
      if (!ctx.http) await new Promise((resolve) => setTimeout(resolve, SEARCH_SPACING_MS))
    } catch (error) {
      errors.push(`wikidata recherche "${candidate.label}" : ${message(error)}`)
      break
    }
  }
  for (let offset = 0; offset < searches.length; offset += 50) {
    const slice = searches.slice(offset, offset + 50)
    try {
      const entities = await fetchWikidataByIds(slice.map((entry) => entry.qid), undefined, http)
      for (const entry of slice) {
        const entity = entities.find((found) => found.qid === entry.qid)
        if (entity) byCandidate.set(entry.candidate, entity)
      }
    } catch (error) {
      errors.push(`wikidata entités : ${message(error)}`)
    }
  }

  const resolved: CandidatePiece[] = []
  for (const [candidate, entity] of byCandidate) {
    const id = subjectId('entity', entity.label)
    for (const signal of candidate.signals) {
      resolved.push({
        key: id, label: entity.label, subjectId: id, universe: entity.universe, aliases: entity.aliases, isHuman: entity.isHuman,
        instances: entity.instances, description: entity.description, qid: entity.qid, signal,
      })
    }
  }
  return { resolved, unresolved: unknown.length - byCandidate.size }
}

/** Names the selection may examine before giving up on filling the day. */
const VERIFY_AT_MOST = 40

/**
 * Every subject of the day gets its Wikidata check: a dictionary entity
 * carries a universe but no description and no class, and "Aileen Wuornos"
 * or "Die Linke" only show what they are once Wikidata says so. Refused
 * ones give their place to the next in score, up to the cap.
 */
async function verifySelected(ctx: LineContext, kept: Candidate[], counters: LineResult['counters'], errors: string[]): Promise<Candidate[]> {
  const http = ctx.http ?? fetch
  const ordered = kept.filter(qualifies).sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, VERIFY_AT_MOST)
  const selected: Candidate[] = []
  for (const candidate of ordered) {
    if (selected.length >= DAILY_CAP) break
    let verified = candidate
    if (!candidate.qid) {
      try {
        const lang = candidate.signals[0]?.lang ?? 'en'
        const qid = await searchWikidataEntity(candidate.label, lang, undefined, http)
        if (!ctx.http) await new Promise((resolve) => setTimeout(resolve, SEARCH_SPACING_MS))
        const entity = qid ? (await fetchWikidataByIds([qid], undefined, http))[0] : undefined
        if (entity) {
          verified = {
            ...candidate, qid: entity.qid, isHuman: entity.isHuman, instances: entity.instances, description: entity.description,
            universe: candidate.universe && candidate.universe !== 'other' ? candidate.universe : entity.universe,
            aliases: [...new Set([...(candidate.aliases ?? []), ...entity.aliases])],
          }
        }
      } catch (error) {
        errors.push(`wikidata vérification "${candidate.label}" : ${message(error)}`)
      }
    }
    const reason = refusalOf(verified)
    if (reason) { counters.rejected[reason] = (counters.rejected[reason] ?? 0) + 1; continue }
    selected.push(verified)
  }
  return selected
}

/** How many past days each key was seen on, from the signal journal. */
async function daysSeen(ctx: LineContext, keys: string[], today: string): Promise<Map<string, number>> {
  const since = dayOf(new Date(Date.parse(today) - PERSISTENCE_DAYS * 86_400_000))
  const rows = await ctx.db.collection(SIGNALS_COLLECTION)
    .find({ key: { $in: keys }, day: { $gte: since, $lt: today } }, { projection: { key: 1, day: 1 }, maxTimeMS: 5000 })
    .toArray()
    .catch(() => [] as Array<{ key?: string; day?: string }>)
  const days = new Map<string, Set<string>>()
  for (const row of rows) if (row.key && row.day) days.set(row.key, new Set([...(days.get(row.key) ?? []), row.day]))
  return new Map([...days].map(([key, set]) => [key, set.size]))
}

async function writeSubjects(ctx: LineContext, selected: Candidate[], today: string): Promise<void> {
  if (ctx.dryRun || !selected.length) return
  const now = new Date()
  await ctx.db.collection<SubjectDocument>(SUBJECTS_COLLECTION).bulkWrite(selected.map((candidate) => ({
    updateOne: {
      filter: { _id: candidate.subjectId! },
      update: {
        $setOnInsert: {
          kind: 'entity', label: candidate.label, universe: candidate.universe ?? 'other', counts: {}, angleCounts: {}, createdAt: now,
          ambiguous: needsSecondClue(candidate.label), 'trend.firstSeen': today, 'dig.budget': 4, 'dig.ingested': 0,
        },
        $addToSet: { aliases: { $each: [candidate.label, ...(candidate.aliases ?? [])].map(normalize).filter((alias) => alias.length >= 2) }, sources: 'trend' },
        $set: { 'trend.lastSeen': today, 'trend.score': candidate.score, 'dig.status': 'planned', ...(candidate.qid ? { qid: candidate.qid } : {}) },
      },
      upsert: true,
    },
  })), { ordered: false })
}

/** Every signal on record, with the key it fed, so a persistent name can be told and the day reread. */
async function journalSignals(ctx: LineContext, signals: Signal[], keyOf: Map<Signal, string>): Promise<void> {
  if (ctx.dryRun || !signals.length) return
  const at = new Date()
  await ctx.db.collection(SIGNALS_COLLECTION).insertMany(signals.map((signal) => ({
    day: signal.day, source: signal.source, country: signal.country, rank: signal.rank, title: signal.title, key: keyOf.get(signal) ?? null, at,
  })), { ordered: false }).catch((error) => ctx.log(`journal des signaux : ${message(error)}`))
}

type Dig = { subject: DigSubject; steps: ReturnType<typeof digSteps>; turn: number }

/** The dig, turn after turn across all subjects, so every subject gets its name searched before any gets a pair. */
async function dig(ctx: LineContext, digs: Dig[], signalDay: Date, counters: LineResult['counters'], errors: string[]): Promise<{ hitDeadline: boolean }> {
  const http = ctx.http ?? fetch
  const youtubeKey = process.env.YOUTUBE_API_KEY
  let youtubeStopped = !youtubeKey
  if (!youtubeKey) ctx.log('youtube : pas de clé, fouille vidéo YouTube ignorée')
  // Giphy's free keys allow a few dozen calls an hour: one image search per subject, and none after a refusal.
  let giphyStopped = !process.env.GIPHY_API_KEY
  for (let turn = 0; turn < 3; turn += 1) {
    for (const current of digs) {
      const step = current.steps[turn]
      if (!step) continue
      if (ctx.timeLeft() < DEADLINE_MARGIN_MS) return { hitDeadline: true }
      const subjectId = current.subject.id
      for (const spec of step.youtube) {
        if (youtubeStopped || spec.kind !== 'search') break
        if (!(await ctx.quota.reserve(YOUTUBE_SEARCH_UNITS))) { youtubeStopped = true; ctx.log('youtube : budget du jour atteint'); break }
        try {
          const videos = await searchYouTube(youtubeKey!, { query: spec.query, order: spec.order, after: spec.after, before: spec.before, language: spec.language }, http)
          const kept = keepForStep(videos, spec.focus?.subject ?? current.steps[0].youtube[0]?.focus?.subject ?? { key: subjectId, label: current.subject.label, aliases: current.subject.aliases, kind: 'entity', evidence: 'title' })
            .map((video) => ({ ...video, trendObservedAt: signalDay }))
          const result = await ctx.admit({ subjectId, videos: kept })
          addAdmission(counters, { ...result, scanned: videos.length })
          await ctx.search({ provider: 'youtube', query: spec.query, subjectId, scanned: videos.length, kept: kept.length, inserted: result.inserted, duplicates: result.duplicates, rejected: result.rejected, quotaUnits: YOUTUBE_SEARCH_UNITS, insertedIds: result.insertedIds })
        } catch (error) {
          errors.push(`youtube "${spec.query}" : ${message(error)}`)
          if (/HTTP 403/.test(message(error))) youtubeStopped = true
        }
      }
      for (const spec of step.dailymotion.slice(0, 1)) {
        if (spec.kind !== 'dailymotion' || !spec.query) continue
        try {
          const videos = await searchDailymotion({ query: spec.query, sort: spec.sort === 'recent' ? 'recent' : 'relevance', after: spec.after, before: spec.before }, http)
          const kept = keepForStep(videos, spec.focus?.subject ?? { key: subjectId, label: current.subject.label, aliases: current.subject.aliases, kind: 'entity', evidence: 'title' })
            .map((video) => ({ ...video, trendObservedAt: signalDay }))
          const result = await ctx.admit({ subjectId, videos: kept })
          addAdmission(counters, { ...result, scanned: videos.length })
          await ctx.search({ provider: 'dailymotion', query: spec.query, subjectId, scanned: videos.length, kept: kept.length, inserted: result.inserted, duplicates: result.duplicates, rejected: result.rejected, quotaUnits: 0, insertedIds: result.insertedIds })
        } catch (error) {
          errors.push(`dailymotion "${spec.query}" : ${message(error)}`)
        }
      }
      for (const query of turn === 0 ? step.images.slice(0, 1) : []) {
        const giphyKey = process.env.GIPHY_API_KEY
        if (!giphyKey || giphyStopped) break
        try {
          const images = await searchGiphy(giphyKey, query, GIPHY_PER_QUERY, http)
          const result = await ctx.admit({ subjectId, images })
          addAdmission(counters, { ...result, scanned: images.length })
          await ctx.search({ provider: 'giphy', query, subjectId, scanned: images.length, kept: images.length, inserted: result.inserted, duplicates: result.duplicates, rejected: result.rejected, quotaUnits: 0, insertedIds: result.insertedIds })
        } catch (error) {
          errors.push(`giphy "${query}" : ${message(error)}`)
          if (/HTTP 429/.test(message(error))) { giphyStopped = true; ctx.log('giphy : limite horaire atteinte, plus d_images ce passage') }
        }
      }
      current.turn = turn + 1
      if (!ctx.dryRun) {
        await ctx.db.collection<SubjectDocument>(SUBJECTS_COLLECTION).updateOne(
          { _id: subjectId },
          { $set: { 'dig.lastRunAt': new Date(), 'dig.turns': current.turn, 'dig.status': current.turn >= current.steps.length ? 'done' : 'running' } },
        ).catch(() => undefined)
      }
    }
  }
  return { hitDeadline: false }
}

export async function run(ctx: LineContext): Promise<LineResult> {
  const now = new Date()
  const today = dayOf(now)
  const counters = emptyCounters()
  const errors: string[] = []

  const signals = await gatherSignals(ctx, now, errors)
  if (!signals.length) return { counters, errors: [...errors, 'aucun signal : aucune source n_a répondu'] }

  const pieces = await candidatePieces(ctx, signals)
  let candidates = mergeCandidates(pieces)
  const { resolved, unresolved } = await resolveUnknown(ctx, candidates, errors)
  candidates = mergeCandidates([...pieces.filter((piece) => piece.subjectId), ...resolved])
  if (unresolved) counters.rejected['unresolved'] = unresolved

  const persistence = await daysSeen(ctx, candidates.map((candidate) => candidate.key), today)
  const kept: Candidate[] = []
  for (const candidate of candidates) {
    const reason = refusalOf(candidate)
    if (reason) { counters.rejected[reason] = (counters.rejected[reason] ?? 0) + 1; continue }
    const days = persistence.get(candidate.key) ?? 0
    kept.push({ ...candidate, daysSeen: days, score: candidate.score + days * 2 })
  }
  const selected = await verifySelected(ctx, kept, counters, errors)
  ctx.log(`${signals.length} signaux, ${candidates.length} candidats, ${kept.length} recevables, ${selected.length} sujets du jour`)

  const keyOf = new Map<Signal, string>()
  for (const candidate of candidates) for (const signal of candidate.signals) keyOf.set(signal, candidate.key)
  await journalSignals(ctx, signals, keyOf)
  await writeSubjects(ctx, selected, today)

  const summary = selected.map((candidate) => ({ id: candidate.subjectId!, label: candidate.label, score: candidate.score, sources: candidate.sources, countries: candidate.countries, universe: candidate.universe ?? 'other' }))
  const cursor = { day: today, subjects: summary }
  if (ctx.dryRun) {
    ctx.log('passage à blanc : les sujets sont listés, rien n_est fouillé ni écrit')
    return { counters: { ...counters, scanned: signals.length }, cursor, errors }
  }

  const signalDay = new Date(Date.parse(today))
  const digs: Dig[] = selected.map((candidate) => ({
    subject: { id: candidate.subjectId!, label: candidate.label, aliases: candidate.aliases ?? [] },
    steps: digSteps({ id: candidate.subjectId!, label: candidate.label, aliases: candidate.aliases ?? [] }, now.getTime()),
    turn: 0,
  }))
  const { hitDeadline } = await dig(ctx, digs, signalDay, counters, errors)
  if (hitDeadline) errors.push('échéance atteinte pendant la fouille')
  return { counters, cursor, errors }
}
