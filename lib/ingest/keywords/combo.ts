import fs from 'node:fs/promises'
import path from 'node:path'
import { buildRegionalQuery, type RegionKey } from '@/lib/ingest/keywords/regionPools'

export type WeightedKeywordList = {
  includeProbability: number
  values: string[]
}

export type YearBucket = {
  label?: string
  from: number
  to: number
  weight: number
}

export type YearKeywordConfig = {
  includeProbability: number
  noneProbability: number
  buckets: YearBucket[]
}

export type KeywordComboConfig = {
  wordPrimary: WeightedKeywordList
  wordSecondary: WeightedKeywordList
  countries: WeightedKeywordList
  years: YearKeywordConfig
}

export type KeywordComponents = {
  primary?: string
  secondary?: string
  country?: string
  year?: number
  region?: string
}

export type KeywordCombo = {
  query: string
  components: KeywordComponents
}

type ComboConfigCache = {
  config: KeywordComboConfig
  mtimeMs: number
}

let cache: ComboConfigCache | null = null

async function readComboConfigFile(): Promise<KeywordComboConfig> {
  const filePath = path.resolve(process.cwd(), 'lib/ingest/keywords/combo.json')
  const raw = await fs.readFile(filePath, 'utf8')
  const parsed = JSON.parse(raw) as KeywordComboConfig
  return parsed
}

async function statComboConfigFile(): Promise<number> {
  const filePath = path.resolve(process.cwd(), 'lib/ingest/keywords/combo.json')
  const stats = await fs.stat(filePath)
  return stats.mtimeMs
}

function clampProbability(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  if (value === undefined || value === null) return fallback
  return Math.max(0, Math.min(1, value))
}

function normalizeList(list: WeightedKeywordList): WeightedKeywordList {
  return {
    includeProbability: clampProbability(list?.includeProbability, 1),
    values: Array.isArray(list?.values)
      ? list.values
          .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
          .filter(Boolean)
      : [],
  }
}

function normalizeYearConfig(config: YearKeywordConfig): YearKeywordConfig {
  let includeProbability = clampProbability(config?.includeProbability, 1)
  const noneProbability = clampProbability(config?.noneProbability, 0)
  if (includeProbability < noneProbability) {
    includeProbability = noneProbability
  }
  const buckets = Array.isArray(config?.buckets)
    ? config.buckets
        .map((bucket) => ({
          label: typeof bucket?.label === 'string' ? bucket.label : undefined,
          from: Number.isFinite(bucket?.from) ? Math.floor(bucket.from) : NaN,
          to: Number.isFinite(bucket?.to) ? Math.floor(bucket.to) : NaN,
          weight: Number.isFinite(bucket?.weight) ? Math.max(0, bucket.weight) : 0,
        }))
        .filter((bucket) => bucket.weight > 0 && !Number.isNaN(bucket.from) && !Number.isNaN(bucket.to) && bucket.to >= bucket.from)
    : []

  return { includeProbability, noneProbability, buckets }
}

function normalizeConfig(config: KeywordComboConfig): KeywordComboConfig {
  return {
    wordPrimary: normalizeList(config?.wordPrimary ?? { includeProbability: 0, values: [] }),
    wordSecondary: normalizeList(config?.wordSecondary ?? { includeProbability: 0, values: [] }),
    countries: normalizeList(config?.countries ?? { includeProbability: 0, values: [] }),
    years: normalizeYearConfig(config?.years ?? { includeProbability: 0, noneProbability: 1, buckets: [] }),
  }
}

export async function loadKeywordComboConfig(force = false): Promise<KeywordComboConfig> {
  const mtime = await statComboConfigFile()
  if (!force && cache && cache.mtimeMs === mtime) {
    return cache.config
  }
  const rawConfig = await readComboConfigFile()
  const normalized = normalizeConfig(rawConfig)
  cache = { config: normalized, mtimeMs: mtime }
  return normalized
}

function pickOne<T>(values: T[], rng: () => number): T | undefined {
  if (!values.length) return undefined
  const index = Math.floor(rng() * values.length)
  return values[index]
}

function maybePickFromList(list: WeightedKeywordList, rng: () => number): string | undefined {
  if (!list.values.length) return undefined
  if (rng() > list.includeProbability) return undefined
  const value = pickOne(list.values, rng)
  return value
}

function pickYearValue(config: YearKeywordConfig, rng: () => number): number | undefined {
  if (!config.buckets.length) return undefined

  const roll = rng()
  if (roll > config.includeProbability) return undefined
  if (roll < config.noneProbability) return undefined

  const totalWeight = config.buckets.reduce((sum, bucket) => sum + bucket.weight, 0)
  if (totalWeight <= 0) return undefined

  const target = rng() * totalWeight
  let cumulative = 0
  for (const bucket of config.buckets) {
    cumulative += bucket.weight
    if (target <= cumulative) {
      if (bucket.from === bucket.to) return bucket.from
      const span = bucket.to - bucket.from
      const offset = Math.floor(rng() * (span + 1))
      return bucket.from + offset
    }
  }

  const last = config.buckets[config.buckets.length - 1]
  return last ? last.to : undefined
}

function resolveTargetTokenCount(total: number, rng: () => number): number {
  if (total <= 1) return total
  const roll = rng()
  if (roll < 0.8) return Math.min(2, total)
  if (roll < 0.95) return Math.min(3, total)
  return total
}

type ComponentToken = {
  key: keyof KeywordComponents
  value: string
  priority: number
  tieBreaker: number
}

function prioritizeTokens(tokens: ComponentToken[]): ComponentToken[] {
  return tokens
    .slice()
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      return a.tieBreaker - b.tieBreaker
    })
}

export type GenerateComboOptions = {
  region?: RegionKey
  rng?: () => number
}

export async function generateKeywordCombo(options: GenerateComboOptions = {}): Promise<KeywordCombo> {
  const rng = options.rng ?? Math.random
  const region = options.region ?? 'global'

  if (region !== 'global') {
    const { terms, language } = buildRegionalQuery(region, 'web', rng)
    const [primary, secondary, ...rest] = terms
    const components: KeywordComponents = {
      primary,
      secondary,
      country: language,
      region,
    }
    if (rest.length) components.year = undefined
    return {
      query: terms.join(' '),
      components,
    }
  }

  const config = await loadKeywordComboConfig()

  const primary = maybePickFromList(config.wordPrimary, rng)
  const secondary = maybePickFromList(config.wordSecondary, rng)
  const country = maybePickFromList(config.countries, rng)
  const year = pickYearValue(config.years, rng)

  const candidateTokens: ComponentToken[] = []
  if (primary) {
    candidateTokens.push({ key: 'primary', value: primary, priority: 4, tieBreaker: rng() })
  }
  if (secondary) {
    candidateTokens.push({ key: 'secondary', value: secondary, priority: 3, tieBreaker: rng() })
  }
  if (country) {
    candidateTokens.push({ key: 'country', value: country, priority: 2, tieBreaker: rng() })
  }
  if (year) {
    candidateTokens.push({ key: 'year', value: String(year), priority: 1, tieBreaker: rng() })
  }

  if (!candidateTokens.length) {
    const fallbackPrimary = pickOne(config.wordPrimary.values, rng)
    if (fallbackPrimary) {
      candidateTokens.push({ key: 'primary', value: fallbackPrimary, priority: 4, tieBreaker: rng() })
    } else {
      const fallbackSecondary = pickOne(config.wordSecondary.values, rng)
      if (fallbackSecondary) {
        candidateTokens.push({ key: 'secondary', value: fallbackSecondary, priority: 3, tieBreaker: rng() })
      }
    }
  }

  const totalTokens = candidateTokens.length
  const desiredCount = resolveTargetTokenCount(totalTokens, rng)
  const prioritized = prioritizeTokens(candidateTokens)
  const selected = prioritized.slice(0, Math.max(1, desiredCount))
  const selectedMap = new Map<keyof KeywordComponents, string>()
  selected.forEach((token) => {
    selectedMap.set(token.key, token.value)
  })

  const query = selected
    .map((token) => token.value)
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .trim()

  const components: KeywordComponents = {
    primary: selectedMap.get('primary'),
    secondary: selectedMap.get('secondary'),
    country: selectedMap.get('country'),
    year: selectedMap.has('year') ? Number(selectedMap.get('year')) : undefined,
    region: 'global',
  }

  return {
    query,
    components,
  }
}

export function buildComboQueries(count: number, options: GenerateComboOptions = {}): Promise<KeywordCombo[]> {
  const rng = options.rng ?? Math.random
  const tasks = Array.from({ length: Math.max(1, count) }, () => generateKeywordCombo({ region: options.region, rng }))
  return Promise.all(tasks)
}

export function buildKeywordLabel(combo: KeywordCombo): string {
  const parts = [combo.components.primary, combo.components.secondary, combo.components.country]
  if (combo.components.year) parts.push(String(combo.components.year))
  return parts.filter(Boolean).join(' • ')
}

export function formatComboDebug(combo: KeywordCombo): string {
  const { components } = combo
  const segments = [
    components.primary ? `primary:${components.primary}` : null,
    components.secondary ? `secondary:${components.secondary}` : null,
    components.country ? `country:${components.country}` : null,
    components.year ? `year:${components.year}` : null,
  ].filter(Boolean)
  return segments.join(' | ')
}
