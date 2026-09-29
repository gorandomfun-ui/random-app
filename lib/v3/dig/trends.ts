/**
 * The subjects of the day: what people read on Wikipedia yesterday, in the
 * site's languages, resolved on Wikidata to people, films, series, bands and
 * games. They enter the queue as trends, dug shallow; one that stays three
 * days in a row is dug like a known name.
 */

import type { Db } from 'mongodb'

import { subjectId } from '../tagging/normalize'
import { fetchTopArticles, type WikiLanguage } from '../subjects/wikipedia'
import { fetchWikidataSubjects, type WikidataSubject } from '../subjects/wikidata'
import type { Universe } from '../types'
import { enqueue, QUEUE, type NewSubject, type QueuedSubject } from './queue'

export const TREND_LANGUAGES: WikiLanguage[] = ['fr', 'en', 'de', 'es', 'pt', 'it']
export const TREND_TOP = 60
/** Below that, a page is just the weather: not a subject of the day. */
const MIN_VIEWS = 40_000

/** What the dig follows among the things Wikidata knows: people, and the works people watch. */
const WORK_INSTANCES = new Set(['Q11424', 'Q5398426', 'Q7889', 'Q215380', 'Q2088357', 'Q15416', 'Q4830453', 'Q1667921', 'Q482994', 'Q11446', 'Q7725634', 'Q134556', 'Q1107', 'Q1454'])
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function trendSubject(entity: WikidataSubject, language: string, day: string, days: number): NewSubject | null {
  const isWork = entity.instances.some((instance) => WORK_INSTANCES.has(instance))
  if (!entity.isHuman && !isWork) return null
  if (entity.label.length > 60) return null
  return {
    _id: subjectId('entity', entity.label), label: entity.label, aliases: entity.aliases.slice(0, 8), kind: 'entity', base: 'trends',
    fame: days >= 3 ? 'known' : 'small', lang: language, universe: entity.universe as Universe,
    priority: 25 + Math.min(days, 5) * 2, source: { day, language, wikipedia: entity.sourceTitle, qid: entity.qid, days },
  }
}

/** Reads yesterday's top pages, resolves them, queues the subjects of the day. */
export async function queueTrends(db: Db, now: Date, request: typeof fetch = fetch, log: (text: string) => void = () => undefined): Promise<{ queued: number; refreshed: number }> {
  const yesterday = new Date(now.getTime() - 24 * 3600_000)
  const day = yesterday.toISOString().slice(0, 10)
  const found: NewSubject[] = []
  for (const language of TREND_LANGUAGES) {
    let articles: Array<{ title: string; views: number }> = []
    try {
      articles = (await fetchTopArticles(language, yesterday, undefined, 0, request)).filter((article) => article.views >= MIN_VIEWS).slice(0, TREND_TOP)
    } catch (error) {
      log(`wikipedia ${language} : ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    const titles = articles.map((article) => article.title.replace(/_/g, ' '))
    for (let start = 0; start < titles.length; start += 50) {
      try {
        const entities = await fetchWikidataSubjects(language, titles.slice(start, start + 50), undefined, request)
        for (const entity of entities) {
          const seen = await db.collection<QueuedSubject>(QUEUE).findOne({ _id: subjectId('entity', entity.label) }, { projection: { source: 1, base: 1 } })
          const previousDays = Number((seen?.source as { days?: number } | undefined)?.days ?? 0)
          const subject = trendSubject(entity, language, day, seen?.base === 'trends' ? previousDays + 1 : 1)
          if (subject) found.push(subject)
        }
      } catch (error) {
        log(`wikidata ${language} : ${error instanceof Error ? error.message : String(error)}`)
      }
      await wait(300)
    }
  }
  const unique = new Map(found.map((subject) => [subject._id, subject]))
  const result = await enqueue(db, [...unique.values()])
  // A trend that came back gets its days counted and its fame raised; enqueue leaves fame alone, so it is set here.
  for (const subject of unique.values()) {
    await db.collection<QueuedSubject>(QUEUE).updateOne({ _id: subject._id, base: 'trends' }, { $set: { source: subject.source, fame: subject.fame, priority: subject.priority } }).catch(() => undefined)
  }
  log(`tendances : ${unique.size} sujets du ${day}, ${result.inserted} nouveaux`)
  return { queued: result.inserted, refreshed: result.refreshed }
}
