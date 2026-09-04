export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import type { AnyBulkWriteOperation, Db, Document } from 'mongodb'

import { DEFAULT_INGEST_HEADERS, fetchJson } from '@/lib/ingest/http'
import { createFactDocument } from '@/lib/random/facts'
import { createJokeDocument } from '@/lib/random/jokes'
import { createQuoteDocument } from '@/lib/random/quotes'

type AppLang = 'en' | 'fr' | 'de' | 'es' | 'jp'
type TextSource = 'wikidata' | 'wikiquote' | 'jokeapi'
type LanguageScope = 'universal' | 'localized'

type StoredTextDoc = Document & {
  type: 'fact' | 'quote' | 'joke'
  text: string
  author?: string
  provider: TextSource
  hash: string
  sourceKey: string
  externalId: string
  lang: AppLang
  languageScope: LanguageScope
  localizationKey?: string
  source: { name: string; url?: string }
}

type WikidataEntity = {
  id?: string
  labels?: Record<string, { language?: string; value?: string }>
  claims?: Record<string, Array<{
    rank?: string
    mainsnak?: { datavalue?: { value?: { id?: string } } }
  }>>
}

type WikipediaCategoryMember = { pageid?: number; title?: string }

type WikiquotePage = {
  pageid?: number
  title?: string
  fullurl?: string
  pageprops?: { wikibase_item?: string }
  revisions?: Array<{ slots?: { main?: { content?: string } } }>
}

type JokeApiEntry = {
  error?: boolean
  id?: number
  lang?: string
  category?: string
  type?: string
  setup?: string
  delivery?: string
  joke?: string
  safe?: boolean
  flags?: Record<string, boolean>
}

const SUPPORTED_LANGS: AppLang[] = ['en', 'fr', 'de', 'es', 'jp']
const WIKIMEDIA_LANG: Record<AppLang, string> = { en: 'en', fr: 'fr', de: 'de', es: 'es', jp: 'ja' }
const JOKE_API_LANGS = new Set<AppLang>(['en', 'fr', 'de', 'es'])
const MAX_WIKIDATA_FACT_LENGTH = 140
const ROUTE_HEADERS = {
  ...DEFAULT_INGEST_HEADERS,
  'User-Agent': 'goRANDOM.fun ingestion/1.0 (https://gorandom.fun)',
}
const WIKIDATA_LICENSE = {
  name: 'CC0 1.0',
  url: 'https://creativecommons.org/publicdomain/zero/1.0/',
}
const WIKIQUOTE_LICENSE = {
  name: 'CC BY-SA 4.0',
  url: 'https://creativecommons.org/licenses/by-sa/4.0/',
}

let cachedDb: Db | null = null

async function getDb(): Promise<Db> {
  if (cachedDb) return cachedDb
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) throw new Error('Missing MONGODB_URI / MONGO_URI')
  const { MongoClient } = await import('mongodb')
  const client = new MongoClient(uri)
  await client.connect()
  cachedDb = client.db(process.env.MONGODB_DB || process.env.MONGO_DB || 'randomapp')
  return cachedDb
}

function normalizeText(value?: string | null): string {
  return (value || '').normalize('NFKC').replace(/\s+/g, ' ').trim()
}

function contentHash(type: StoredTextDoc['type'], text: string, author = ''): string {
  const payload = type === 'quote'
    ? `${normalizeText(text)}||${normalizeText(author)}`
    : normalizeText(text)
  return createHash('sha1').update(payload).digest('hex')
}

function shortHash(value: string): string {
  return createHash('sha1').update(normalizeText(value).toLowerCase()).digest('hex').slice(0, 16)
}

function parseLangs(value: string | null): AppLang[] {
  const requested = (value || SUPPORTED_LANGS.join(','))
    .split(',')
    .map((lang) => lang.trim().toLowerCase())
    .filter((lang): lang is AppLang => SUPPORTED_LANGS.includes(lang as AppLang))
  return Array.from(new Set(requested.length ? requested : SUPPORTED_LANGS))
}

function parseLimit(value: string | null, fallback: number): number {
  const parsed = Number(value || fallback)
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, Math.floor(parsed))) : fallback
}

function parseOffset(value: string | null): number {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(10_000, Math.floor(parsed))) : 0
}

function languageScope(lang: AppLang, hasTranslations = false): LanguageScope {
  if (hasTranslations) return 'localized'
  return lang === 'en' ? 'universal' : 'localized'
}

function wikidataSentence(lang: AppLang, kind: string, subject: string, object: string): string {
  const templates: Record<AppLang, Record<string, string>> = {
    en: {
      capital: `${subject} — capital: ${object}.`,
      currency: `${subject} — currency: ${object}.`,
      language: `${subject} — official language: ${object}.`,
      continent: `${subject} — continent: ${object}.`,
      highestPoint: `${subject} — highest point: ${object}.`,
    },
    fr: {
      capital: `${subject} — capitale : ${object}.`,
      currency: `${subject} — monnaie : ${object}.`,
      language: `${subject} — langue officielle : ${object}.`,
      continent: `${subject} — continent : ${object}.`,
      highestPoint: `${subject} — point culminant : ${object}.`,
    },
    de: {
      capital: `${subject} — Hauptstadt: ${object}.`,
      currency: `${subject} — Währung: ${object}.`,
      language: `${subject} — Amtssprache: ${object}.`,
      continent: `${subject} — Kontinent: ${object}.`,
      highestPoint: `${subject} — höchster Punkt: ${object}.`,
    },
    es: {
      capital: `${subject} — capital: ${object}.`,
      currency: `${subject} — moneda: ${object}.`,
      language: `${subject} — idioma oficial: ${object}.`,
      continent: `${subject} — continente: ${object}.`,
      highestPoint: `${subject} — punto más alto: ${object}.`,
    },
    jp: {
      capital: `${subject}の首都は${object}です。`,
      currency: `${subject}では通貨として${object}が使われています。`,
      language: `${object}は${subject}の公用語です。`,
      continent: `${subject}は${object}に位置しています。`,
      highestPoint: `${subject}の最高地点は${object}です。`,
    },
  }
  return templates[lang][kind] || `${subject}: ${object}.`
}

const WIKIDATA_FACT_PROPERTIES: Record<string, string> = {
  P36: 'capital',
  P38: 'currency',
  P37: 'language',
  P30: 'continent',
  P610: 'highestPoint',
}

async function fetchUnitedNationsMembers(): Promise<WikipediaCategoryMember[]> {
  const params = new URLSearchParams({
    action: 'query',
    list: 'categorymembers',
    cmtitle: 'Category:Member states of the United Nations',
    cmnamespace: '0',
    cmlimit: '500',
    format: 'json',
    origin: '*',
  })
  const payload = await fetchJson<{ query?: { categorymembers?: WikipediaCategoryMember[] } }>(
    `https://en.wikipedia.org/w/api.php?${params.toString()}`,
    { headers: ROUTE_HEADERS, timeoutMs: 25_000 },
  )
  const members = Array.isArray(payload?.query?.categorymembers) ? payload.query.categorymembers : []
  return members.filter((member) => member.pageid && member.title && member.title !== 'Member states of the United Nations')
}

function takeCircular<T>(items: T[], offset: number, count: number): T[] {
  if (!items.length) return []
  const start = offset % items.length
  const out: T[] = []
  for (let index = 0; index < Math.min(count, items.length); index++) {
    out.push(items[(start + index) % items.length])
  }
  return out
}

async function fetchWikipediaWikidataIds(pageIds: number[]): Promise<string[]> {
  if (!pageIds.length) return []
  const params = new URLSearchParams({
    action: 'query',
    pageids: pageIds.join('|'),
    prop: 'pageprops',
    ppprop: 'wikibase_item',
    formatversion: '2',
    format: 'json',
    origin: '*',
  })
  const payload = await fetchJson<{ query?: { pages?: Array<{ pageprops?: { wikibase_item?: string } }> } }>(
    `https://en.wikipedia.org/w/api.php?${params.toString()}`,
    { headers: ROUTE_HEADERS, timeoutMs: 20_000 },
  )
  const pages = Array.isArray(payload?.query?.pages) ? payload.query.pages : []
  return Array.from(new Set(pages.map((page) => page.pageprops?.wikibase_item || '').filter(Boolean)))
}

async function fetchWikidataEntities(ids: string[], langs: AppLang[], props: 'labels|claims' | 'labels'): Promise<Record<string, WikidataEntity>> {
  const entities: Record<string, WikidataEntity> = {}
  for (let index = 0; index < ids.length; index += 50) {
    const chunk = ids.slice(index, index + 50)
    const params = new URLSearchParams({
      action: 'wbgetentities',
      ids: chunk.join('|'),
      props,
      languages: Array.from(new Set(langs.map((lang) => WIKIMEDIA_LANG[lang]))).join('|'),
      languagefallback: '0',
      format: 'json',
      origin: '*',
    })
    const payload = await fetchJson<{ entities?: Record<string, WikidataEntity> }>(
      `https://www.wikidata.org/w/api.php?${params.toString()}`,
      { headers: ROUTE_HEADERS, timeoutMs: 25_000 },
    )
    Object.assign(entities, payload?.entities || {})
  }
  return entities
}

function preferredClaimObjectIds(entity: WikidataEntity, propertyId: string): string[] {
  const claims = entity.claims?.[propertyId] || []
  const preferred = claims.filter((claim) => claim.rank === 'preferred')
  const selected = preferred.length ? preferred : claims.filter((claim) => claim.rank !== 'deprecated')
  return Array.from(new Set(
    selected
      .map((claim) => claim.mainsnak?.datavalue?.value?.id || '')
      .filter(Boolean),
  ))
}

function localizedLabel(entity: WikidataEntity | undefined, lang: AppLang): string {
  return normalizeText(entity?.labels?.[WIKIMEDIA_LANG[lang]]?.value)
}

async function collectWikidata(langs: AppLang[], limit: number, offset: number): Promise<StoredTextDoc[]> {
  const lookupLangs = Array.from(new Set<AppLang>([...langs, 'en']))
  const members = await fetchUnitedNationsMembers()
  if (!members.length) throw new Error('Wikipedia did not return the country list used for Wikidata')

  const countryCount = Math.max(4, Math.ceil(limit / 3))
  const selectedMembers = takeCircular(members, offset, countryCount)
  const subjectIds = await fetchWikipediaWikidataIds(
    selectedMembers.map((member) => member.pageid).filter((id): id is number => Number.isFinite(id)),
  )
  const subjects = await fetchWikidataEntities(subjectIds, lookupLangs, 'labels|claims')
  const objectIds = Array.from(new Set(
    Object.values(subjects).flatMap((entity) =>
      Object.keys(WIKIDATA_FACT_PROPERTIES).flatMap((propertyId) => preferredClaimObjectIds(entity, propertyId)),
    ),
  ))
  const objects = await fetchWikidataEntities(objectIds, lookupLangs, 'labels')

  const rows: Array<{
    lang: AppLang
    logicalKey: string
    subjectId: string
    objectId: string
    propertyId: string
    kind: string
    subjectLabel: string
    objectLabel: string
  }> = []
  for (const subjectId of subjectIds) {
    const subject = subjects[subjectId]
    if (!subject) continue
    for (const [propertyId, kind] of Object.entries(WIKIDATA_FACT_PROPERTIES)) {
      for (const objectId of preferredClaimObjectIds(subject, propertyId)) {
        for (const lang of lookupLangs) {
          const subjectLabel = localizedLabel(subject, lang)
          const objectLabel = localizedLabel(objects[objectId], lang)
          if (!subjectLabel || !objectLabel) continue
          rows.push({
            lang,
            logicalKey: `wikidata:${subjectId}:${propertyId}:${objectId}`,
            subjectId,
            objectId,
            propertyId,
            kind,
            subjectLabel,
            objectLabel,
          })
        }
      }
    }
  }
  if (!rows.length) throw new Error('Wikidata did not return any usable facts')

  const variantsByKey = new Map<string, Set<AppLang>>()
  for (const row of rows) {
    const variants = variantsByKey.get(row.logicalKey) || new Set<AppLang>()
    variants.add(row.lang)
    variantsByKey.set(row.logicalKey, variants)
  }

  const selected = new Set(langs)
  const countByLanguage = new Map<AppLang, number>()
  const docs: StoredTextDoc[] = []
  for (const row of rows) {
    if (!selected.has(row.lang) || (countByLanguage.get(row.lang) || 0) >= limit) continue
    const hasTranslations = (variantsByKey.get(row.logicalKey)?.size || 0) > 1
    const text = wikidataSentence(row.lang, row.kind, row.subjectLabel, row.objectLabel)
    if (text.length > MAX_WIKIDATA_FACT_LENGTH) continue
    const base = createFactDocument({
      text,
      provider: 'wikidata',
      source: { name: 'Wikidata', url: `https://www.wikidata.org/wiki/${row.subjectId}` },
      tags: ['knowledge', 'geography', row.kind],
      keywords: [row.subjectLabel, row.objectLabel, row.propertyId],
    })
    if (!base) continue
    const externalId = `${row.logicalKey}:${row.lang}`
    docs.push({
      ...base,
      provider: 'wikidata',
      hash: contentHash('fact', text),
      sourceKey: externalId,
      externalId,
      lang: row.lang,
      languageScope: languageScope(row.lang, hasTranslations),
      ...(hasTranslations ? { localizationKey: row.logicalKey } : {}),
      license: WIKIDATA_LICENSE,
    })
    countByLanguage.set(row.lang, (countByLanguage.get(row.lang) || 0) + 1)
  }
  return docs
}

function wikiTextToPlain(value: string): string {
  const withoutRefs = value
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, ' ')
    .replace(/<ref\b[^/>]*\/>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1')
    .replace(/\[(?:https?:\/\/\S+)\s+([^\]]+)\]/g, '$1')
    .replace(/\[(?:https?:\/\/[^\]]+)\]/g, ' ')
    .replace(/'{2,5}/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{\{[^{}]*\}\}/g, ' ')
    .replace(/^[:;#*\s-]+/, '')
  return normalizeText(decodeBasicHtmlEntities(withoutRefs))
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&amp;|&#38;/gi, '&')
    .replace(/&lt;|&#60;/gi, '<')
    .replace(/&gt;|&#62;/gi, '>')
    .replace(/&#(\d+);/g, (_, code: string) => {
      const point = Number(code)
      return Number.isFinite(point) && point > 0 ? String.fromCodePoint(point) : ''
    })
}

function trimWikiquoteCitationMetadata(value: string): string {
  const text = normalizeText(value)
  const translatedAppendix = text.match(/^([«“„"][\s\S]{20,360}?[»”"]\.?)[\s]+\[[\s\S]{10,}\]\.?$/u)
  if (translatedAppendix?.[1]) return normalizeText(translatedAppendix[1])
  const wrappedPatterns = [
    /^"([\s\S]{20,360})"\s*[-–—]\s+.+$/,
    /^“([\s\S]{20,360})”\s*[-–—]\s+.+$/,
    /^„([\s\S]{20,360})“\s*[-–—]\s+.+$/,
    /^(«[\s\S]{20,360}»)\s*[-–—]\s+.+$/,
  ]
  for (const pattern of wrappedPatterns) {
    const match = text.match(pattern)
    if (match?.[1]) return normalizeText(match[1])
  }

  const sourceSeparator = text.search(/\s[-–—]\s+(?=[^.!?]*(?:\bIn:|\bVerlag\b|\bISBN\b|\bS\.\s*\d|\b[A-ZÉÈÀ][\p{L}-]+\s+\d{4}\b))/iu)
  return sourceSeparator > 20 ? normalizeText(text.slice(0, sourceSeparator)) : text
}

const LANGUAGE_MARKERS: Record<Exclude<AppLang, 'jp'>, Set<string>> = {
  en: new Set(['the', 'and', 'of', 'to', 'in', 'is', 'that', 'with', 'for', 'not', 'as', 'you', 'your', 'from', 'was', 'are', 'have', 'be', 'it', 'i', 'we', 'my', 'me', 'this', 'do', 'does', 'can', 'will', 'who']),
  fr: new Set(['le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'est', 'que', 'qui', 'dans', 'pour', 'pas', 'avec', 'sur', 'je', 'il', 'elle', 'nous', 'vous', 'tous', 'tout', 'mais', 'comme', 'plus', 'aux']),
  de: new Set(['der', 'die', 'das', 'und', 'ist', 'ein', 'eine', 'zu', 'den', 'von', 'mit', 'nicht', 'auf', 'für', 'ich', 'sich', 'dem', 'des', 'dass', 'wenn', 'wie', 'als', 'auch']),
  es: new Set(['el', 'la', 'los', 'las', 'de', 'del', 'un', 'una', 'y', 'es', 'que', 'en', 'por', 'para', 'con', 'no', 'se', 'su', 'nos', 'como', 'cuando', 'nuestro', 'nuestros', 'una', 'al']),
}

function languageMarkerScore(text: string, lang: Exclude<AppLang, 'jp'>): number {
  const words = text
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
  let score = words.reduce((total, word) => total + (LANGUAGE_MARKERS[lang].has(word) ? 1 : 0), 0)
  if (lang === 'es' && /[¿¡ñ]/i.test(text)) score += 3
  if (lang === 'de' && /[äöüß]/i.test(text)) score += 2
  if (lang === 'fr' && /[àâçéèêëîïôùûÿœæ]/i.test(text)) score += 1
  return score
}

function matchesExpectedLanguage(text: string, expected: AppLang): boolean {
  const hasJapaneseScript = /[\u3040-\u30ff\u3400-\u9fff]/u.test(text)
  if (expected === 'jp') return hasJapaneseScript
  if (hasJapaneseScript) return false

  const candidates: Array<Exclude<AppLang, 'jp'>> = ['en', 'fr', 'de', 'es']
  const scores = candidates.map((lang) => ({ lang, score: languageMarkerScore(text, lang) }))
  scores.sort((a, b) => b.score - a.score)
  const expectedScore = scores.find((entry) => entry.lang === expected)?.score || 0
  const best = scores[0]
  if (!best || expectedScore < 2) return false
  if (best.lang === expected) return true
  return expectedScore >= best.score - 1
}

function normalizeCommonWikiTemplates(content: string): string {
  let normalized = content
    .replace(/\{\{\s*(?:e|ème)\s*\|\s*([^|{}]+?)(?:\|[^{}]*)?\}\}/gi, '$1e')
    .replace(/\{\{\s*(?:s|siècle)\s*\|\s*([^|{}]+?)(?:\|[^{}]*)?\}\}/gi, '$1e siècle')
    .replace(/\{\{\s*(?:lang|langue)\s*\|\s*[^|{}]+\|\s*([^{}]+?)\}\}/gi, '$1')
    .replace(/\{\{\s*w\s*\|\s*([^|{}]+)\|\s*([^{}]+?)\}\}/gi, '$2')
    .replace(/\{\{\s*w\s*\|\s*([^{}]+?)\}\}/gi, '$1')
  for (let pass = 0; pass < 3; pass++) {
    normalized = normalized.replace(/\{\{\s*(?:formatnum|nobr|nowrap)\s*\|\s*([^{}]+?)\}\}/gi, '$1')
  }
  return normalized
}

function wikiquoteContentWithoutBlockedSections(content: string): string {
  const blockedHeading = /(?:quotes?\s+about|citations?\s+(?:sur|à propos)|citas?\s+sobre|zitate?\s+über|misattributed|disputed|faussement attribu|attribuées? à tort|falsch zugeschrieben|bibliograph|references?|références?|notes?|sources?|external links?|liens externes?|enlaces externos|weblinks?|see also|voir aussi|véase también|人物評|外部リンク|参考文献)/iu
  const blockedLevels = new Map<number, boolean>()
  const kept: string[] = []
  for (const line of content.split(/\r?\n/)) {
    const heading = line.match(/^(={2,6})\s*(.*?)\s*\1\s*$/)
    if (heading) {
      const level = heading[1].length
      for (const existingLevel of Array.from(blockedLevels.keys())) {
        if (existingLevel >= level) blockedLevels.delete(existingLevel)
      }
      const parentBlocked = Array.from(blockedLevels.values()).some(Boolean)
      blockedLevels.set(level, parentBlocked || blockedHeading.test(wikiTextToPlain(heading[2])))
      continue
    }
    if (!Array.from(blockedLevels.values()).some(Boolean)) kept.push(line)
  }
  return kept.join('\n')
}

function isUsableQuote(value: string): boolean {
  const text = normalizeText(value)
  if (text.length < 30 || text.length > 360) return false
  if (/https?:\/\//i.test(text)) return false
  if (/^(source|sources|references|external links|bibliography|voir aussi|références|quelle|quellen|enlaces externos)\b/i.test(text)) return false
  if (/^(isbn|category|catégorie|date de naissance|born|died)\b/i.test(text)) return false
  const letters = (text.match(/\p{L}/gu) || []).length
  return letters >= 20
}

function extractWikiquoteCandidates(content: string, lang: AppLang): string[] {
  const eligibleContent = normalizeCommonWikiTemplates(wikiquoteContentWithoutBlockedSections(content))
  const candidates: string[] = []
  const seen = new Set<string>()
  const add = (raw: string) => {
    const text = trimWikiquoteCitationMetadata(wikiTextToPlain(raw))
    const key = text.toLocaleLowerCase()
    if (!isUsableQuote(text) || !matchesExpectedLanguage(text, lang) || seen.has(key)) return
    seen.add(key)
    candidates.push(text)
  }

  const templatePattern = /\{\{\s*(?:citation|quote)\b([\s\S]*?)\}\}/gi
  let match: RegExpExecArray | null
  while ((match = templatePattern.exec(eligibleContent))) {
    const body = match[1] || ''
    const named = body.match(/\|\s*(?:citation|texte|text|quote)\s*=\s*([\s\S]*?)(?=\n\s*\||\|\s*[\p{L}_-]+\s*=|$)/iu)
    const positional = body.match(/^\s*\|\s*([^|]+)/)
    add(named?.[1] || positional?.[1] || '')
  }

  for (const line of eligibleContent.split(/\r?\n/)) {
    if (!/^\*\s+[^*]/.test(line)) continue
    if (/\{\{\s*(?:citation|quote)\b/i.test(line)) continue
    add(line)
  }
  return candidates
}

function quoteWordSet(value: string): Set<string> {
  return new Set(
    value
      .normalize('NFKD')
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 3),
  )
}

function quotesAreNearDuplicates(first: string, second: string): boolean {
  const left = quoteWordSet(first)
  const right = quoteWordSet(second)
  if (!left.size || !right.size) return false
  let common = 0
  for (const word of left) if (right.has(word)) common += 1
  const smaller = Math.min(left.size, right.size)
  const larger = Math.max(left.size, right.size)
  return common / smaller >= 0.72 && smaller / larger >= 0.55
}

async function fetchPublicDomainEntityIds(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const params = new URLSearchParams({
    action: 'wbgetentities',
    ids: ids.join('|'),
    props: 'claims',
    format: 'json',
    origin: '*',
  })
  const payload = await fetchJson<{ entities?: Record<string, { claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: { time?: string } } } }>> }> }>(
    `https://www.wikidata.org/w/api.php?${params.toString()}`,
    { headers: ROUTE_HEADERS, timeoutMs: 20_000 },
  )
  const cutoff = new Date().getUTCFullYear() - 75
  const accepted = new Set<string>()
  for (const [id, entity] of Object.entries(payload?.entities || {})) {
    const time = entity.claims?.P570?.[0]?.mainsnak?.datavalue?.value?.time || ''
    const yearMatch = time.match(/[+-](\d{4,})-/)
    const year = Number(yearMatch?.[1] || 0)
    if (year > 0 && year <= cutoff) accepted.add(id)
  }
  return accepted
}

async function fetchWikiquotePages(lang: AppLang): Promise<WikiquotePage[]> {
  const wikiLang = WIKIMEDIA_LANG[lang]
  const params = new URLSearchParams({
    action: 'query',
    generator: 'random',
    grnnamespace: '0',
    grnlimit: '10',
    prop: 'revisions|info|pageprops',
    inprop: 'url',
    rvprop: 'content',
    rvslots: 'main',
    formatversion: '2',
    format: 'json',
    origin: '*',
  })
  const payload = await fetchJson<{ query?: { pages?: WikiquotePage[] } }>(
    `https://${wikiLang}.wikiquote.org/w/api.php?${params.toString()}`,
    { headers: ROUTE_HEADERS, timeoutMs: 25_000 },
  )
  return Array.isArray(payload?.query?.pages) ? payload.query.pages : []
}

async function collectWikiquoteForLanguage(lang: AppLang, limit: number): Promise<StoredTextDoc[]> {
  const out: StoredTextDoc[] = []
  const seen = new Set<string>()
  for (let attempt = 0; attempt < 6 && out.length < limit; attempt++) {
    const pages = await fetchWikiquotePages(lang)
    const qids = pages
      .map((page) => page.pageprops?.wikibase_item || '')
      .filter(Boolean)
      .slice(0, 50)
    const publicDomainIds = await fetchPublicDomainEntityIds(Array.from(new Set(qids)))
    for (const page of pages) {
      const qid = page.pageprops?.wikibase_item || ''
      const title = normalizeText(page.title)
      const content = page.revisions?.[0]?.slots?.main?.content || ''
      if (!qid || !title || !content || !publicDomainIds.has(qid)) continue
      const candidates = extractWikiquoteCandidates(content, lang)
      for (const text of candidates) {
        const signature = `${text.toLocaleLowerCase()}||${title.toLocaleLowerCase()}`
        if (seen.has(signature) || out.some((doc) => doc.author === title && quotesAreNearDuplicates(doc.text, text))) continue
        seen.add(signature)
        const base = createQuoteDocument({
          text,
          author: title,
          provider: 'wikiquote',
          source: { name: `${title} — Wikiquote`, url: page.fullurl },
          tags: ['quote', 'public-domain'],
        })
        if (!base) continue
        const externalId = `wikiquote:${lang}:${page.pageid || qid}:${shortHash(signature)}`
        out.push({
          ...base,
          provider: 'wikiquote',
          hash: contentHash('quote', text, title),
          sourceKey: externalId,
          externalId,
          lang,
          languageScope: languageScope(lang),
          license: WIKIQUOTE_LICENSE,
          wikidataAuthorId: qid,
        })
        if (out.length >= limit) break
      }
      if (out.length >= limit) break
    }
  }
  return out
}

async function collectWikiquote(langs: AppLang[], limit: number): Promise<StoredTextDoc[]> {
  const settled = await Promise.allSettled(langs.map((lang) => collectWikiquoteForLanguage(lang, limit)))
  const docs = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : [])
  if (!docs.length) throw new Error('Wikiquote did not return any public-domain quotes that passed validation')
  return docs
}

function jokeApiEntries(payload: JokeApiEntry & { jokes?: JokeApiEntry[] }): JokeApiEntry[] {
  if (Array.isArray(payload.jokes)) return payload.jokes
  return payload.error ? [] : [payload]
}

function jokeText(entry: JokeApiEntry): string {
  const single = normalizeText(entry.joke)
  if (single) return single
  const setup = normalizeText(entry.setup)
  const delivery = normalizeText(entry.delivery)
  return delivery ? `${setup}${setup ? ' — ' : ''}${delivery}` : setup
}

async function collectJokeApiForLanguage(lang: AppLang, limit: number): Promise<StoredTextDoc[]> {
  if (!JOKE_API_LANGS.has(lang)) return []
  const out: StoredTextDoc[] = []
  const seenIds = new Set<string>()
  const attempts = Math.min(30, Math.max(4, Math.ceil(limit / 10) * 4))
  for (let attempt = 0; attempt < attempts && out.length < limit; attempt++) {
    const amount = Math.min(10, Math.max(1, limit - out.length))
    const params = new URLSearchParams({
      lang: WIKIMEDIA_LANG[lang],
      blacklistFlags: 'nsfw,religious,political,racist,sexist,explicit',
      amount: String(amount),
    })
    params.set('safe-mode', '')
    const payload = await fetchJson<JokeApiEntry & { jokes?: JokeApiEntry[] }>(
      `https://v2.jokeapi.dev/joke/Any?${params.toString()}`,
      { headers: ROUTE_HEADERS, timeoutMs: 15_000 },
    )
    if (!payload) continue
    for (const entry of jokeApiEntries(payload)) {
      const id = Number.isFinite(entry.id) ? String(entry.id) : ''
      const text = jokeText(entry)
      const externalId = id ? `jokeapi:${lang}:${id}` : `jokeapi:${lang}:${shortHash(text)}`
      if (!text || seenIds.has(externalId)) continue
      if (entry.safe === false || Object.values(entry.flags || {}).some(Boolean)) continue
      const base = createJokeDocument({
        text,
        provider: 'jokeapi',
        source: {
          name: 'JokeAPI',
          url: id ? `https://v2.jokeapi.dev/joke/Any?lang=${WIKIMEDIA_LANG[lang]}&idRange=${id}` : 'https://v2.jokeapi.dev',
        },
        tags: ['joke', normalizeText(entry.category).toLowerCase()].filter(Boolean),
      })
      if (!base) continue
      seenIds.add(externalId)
      out.push({
        ...base,
        provider: 'jokeapi',
        hash: contentHash('joke', text),
        sourceKey: externalId,
        externalId,
        lang,
        languageScope: languageScope(lang),
        safe: true,
      })
      if (out.length >= limit) break
    }
  }
  return out
}

async function collectJokeApi(langs: AppLang[], limit: number): Promise<StoredTextDoc[]> {
  const supported = langs.filter((lang) => JOKE_API_LANGS.has(lang))
  if (!supported.length) throw new Error('JokeAPI has no Japanese catalog; select EN, FR, DE or ES')
  const settled = await Promise.allSettled(supported.map((lang) => collectJokeApiForLanguage(lang, limit)))
  const docs = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : [])
  if (!docs.length) throw new Error('JokeAPI did not return any safe jokes')
  return docs
}

function uniqueDocuments(docs: StoredTextDoc[]): StoredTextDoc[] {
  const unique = new Map<string, StoredTextDoc>()
  for (const doc of docs) {
    const key = `${doc.type}:${doc.sourceKey}`
    if (!unique.has(key)) unique.set(key, doc)
  }
  return Array.from(unique.values())
}

async function storeDocuments(docs: StoredTextDoc[], dryRun: boolean) {
  const db = await getDb()
  const collection = db.collection('items')
  const sourceKeys = docs.map((doc) => doc.sourceKey)
  const hashes = docs.map((doc) => doc.hash)
  const existing = await collection.find({
    type: { $in: Array.from(new Set(docs.map((doc) => doc.type))) },
    $or: [
      { sourceKey: { $in: sourceKeys } },
      { hash: { $in: hashes } },
    ],
  }).project({ type: 1, sourceKey: 1, hash: 1 }).toArray()

  const bySourceKey = new Set(existing.map((doc) => `${doc.type}:${doc.sourceKey || ''}`))
  const byHash = new Set(existing.map((doc) => `${doc.type}:${doc.hash || ''}`))
  const eligible: StoredTextDoc[] = []
  let duplicates = 0
  let wouldUpdate = 0
  for (const doc of docs) {
    if (bySourceKey.has(`${doc.type}:${doc.sourceKey}`)) {
      eligible.push(doc)
      wouldUpdate += 1
      continue
    }
    if (byHash.has(`${doc.type}:${doc.hash}`)) {
      duplicates += 1
      continue
    }
    eligible.push(doc)
  }

  const wouldInsert = eligible.length - wouldUpdate
  if (dryRun || !eligible.length) {
    return { inserted: 0, updated: 0, wouldInsert, wouldUpdate, duplicates }
  }

  const now = new Date()
  const operations: AnyBulkWriteOperation[] = eligible.map((doc) => ({
    updateOne: {
      filter: { type: doc.type, sourceKey: doc.sourceKey },
      update: {
        $set: { ...doc, updatedAt: now },
        $setOnInsert: { createdAt: now, rand: Math.random() },
      },
      upsert: true,
    },
  }))
  const result = await collection.bulkWrite(operations, { ordered: false })
  return {
    inserted: result.upsertedCount || 0,
    updated: result.modifiedCount || 0,
    wouldInsert,
    wouldUpdate,
    duplicates,
  }
}

function sampleForResponse(docs: StoredTextDoc[]) {
  return docs.slice(0, 8).map((doc) => ({
    type: doc.type,
    text: doc.text,
    author: doc.author,
    lang: doc.lang,
    source: doc.source,
    languageScope: doc.languageScope,
  }))
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const providedKey = (url.searchParams.get('key') || request.headers.get('x-admin-ingest-key') || '').trim()
    const expectedKey = (process.env.ADMIN_INGEST_KEY || '').trim()
    if (!expectedKey || providedKey !== expectedKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const source = (url.searchParams.get('source') || '').trim().toLowerCase() as TextSource
    if (!['wikidata', 'wikiquote', 'jokeapi'].includes(source)) {
      return NextResponse.json({ error: 'source must be wikidata, wikiquote or jokeapi' }, { status: 400 })
    }
    const langs = parseLangs(url.searchParams.get('langs'))
    const limit = parseLimit(url.searchParams.get('limit'), source === 'wikiquote' ? 10 : 25)
    const offset = parseOffset(url.searchParams.get('offset'))
    const dryRun = url.searchParams.get('dryRun') === '1' || url.searchParams.get('dry') === '1'

    const collected = source === 'wikidata'
      ? await collectWikidata(langs, limit, offset)
      : source === 'wikiquote'
        ? await collectWikiquote(langs, limit)
        : await collectJokeApi(langs, limit)
    const unique = uniqueDocuments(collected)
    const result = await storeDocuments(unique, dryRun)
    const perLanguage = Object.fromEntries(
      langs.map((lang) => [lang, unique.filter((doc) => doc.lang === lang).length]),
    )

    return NextResponse.json({
      ok: true,
      source,
      dryRun,
      langs,
      unsupportedLangs: source === 'jokeapi' ? langs.filter((lang) => !JOKE_API_LANGS.has(lang)) : [],
      requestedPerLanguage: limit,
      offset,
      nextOffset: source === 'wikidata' ? offset + Math.max(4, Math.ceil(limit / 3)) : undefined,
      scanned: collected.length,
      unique: unique.length,
      perLanguage,
      sample: sampleForResponse(unique),
      ...result,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'text source ingest failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
