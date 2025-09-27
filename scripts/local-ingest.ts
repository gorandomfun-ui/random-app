// Run with: npx tsx scripts/local-ingest.ts

import { pathToFileURL } from 'node:url'
import { generateKeywordCombo, buildKeywordLabel } from '../lib/ingest/keywords/combo'
import { QuotaManager, type QuotaUsage } from '../lib/ingest/local/quota'

type IngestResult = {
  ok?: boolean
  inserted?: number
  updated?: number
  unique?: number
  scanned?: number
  requested?: number
  providerCounts?: Record<string, number>
  warnings?: unknown
}

export type Category = 'videos' | 'images' | 'web' | 'facts' | 'jokes' | 'quotes'
export type LogLevel = 'info' | 'warn' | 'error'

export type LogEvent = {
  timestamp: string
  category: Category | 'system'
  level: LogLevel
  message: string
  detail?: unknown
}

export type Logger = (event: LogEvent) => void

export type ComboRecord = {
  label: string
  query: string
  inserted: number
  updated: number
  unique: number
  scanned: number
}

type StaticRecord = {
  description: string
  inserted: number
  updated: number
  unique: number
  scanned: number
}

type LogEntry = {
  timestamp: string
  level: LogLevel
  message: string
  detail?: unknown
}

export type CategorySummary = {
  name: Category
  status: 'completed' | 'skipped' | 'failed'
  startedAt: string
  finishedAt: string
  durationMs: number
  reason?: string
  combosExecuted?: number
  requestsExecuted?: number
  totals?: {
    scanned: number
    unique: number
    inserted: number
    updated: number
  }
  history?: ComboRecord[]
  records?: StaticRecord[]
  logs: LogEntry[]
  error?: string
}

export type RunSummary = {
  startedAt: string
  finishedAt: string
  durationMs: number
  dryRun: boolean
  categories: CategorySummary[]
  quota: Record<string, QuotaUsage>
  logs: LogEvent[]
}

export type RunIngestOptions = {
  categories?: Category[]
  dryRun?: boolean
  maxCombos?: number | null
  sleepMs?: number
  logger?: Logger
  env?: NodeJS.ProcessEnv
  cliOptions?: CliOptions
}

export type CliOptions = {
  categories: Set<Category>
  dryRun: boolean
  maxCombos: number | null
  sleepMs: number
}

export const ALL_CATEGORIES: Category[] = ['videos', 'images', 'web', 'facts', 'jokes', 'quotes']
const DEFAULT_YT_DURATIONS = ['short', 'standard'] as const

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function getEnvNumber(name: string, fallback: number, env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[name]
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return fallback
  return value
}

class IngestClient {
  private readonly host: string
  private readonly key: string
  private readonly bypassToken?: string
  private readonly bypassCookie?: string
  private readonly cookieJar: string[] = []

  constructor(host: string, key: string, bypassToken?: string, bypassCookie?: string) {
    this.host = host
    this.key = key
    this.bypassToken = bypassToken
    this.bypassCookie = bypassCookie
  }

  private async ensureBypassCookie(): Promise<void> {
    if (!this.bypassToken) return
    if (this.cookieJar.length) return

    if (this.bypassCookie) {
      const head = this.bypassCookie.split(';')[0]
      if (head) this.cookieJar.push(head)
    }

    this.cookieJar.push(`__vercel_protection_bypass=${this.bypassToken}`)

    if (!this.bypassCookie) {
      try {
        const probeUrl = new URL(this.host)
        probeUrl.searchParams.set('x-vercel-set-bypass-cookie', 'true')
        probeUrl.searchParams.set('x-vercel-protection-bypass', this.bypassToken)
        const res = await fetch(probeUrl.toString(), { redirect: 'manual' })
        const rawCookies = (res.headers as unknown as { raw?: () => Record<string, string[]> }).raw?.()?.['set-cookie'] || []
        for (const entry of rawCookies) {
          const token = entry.split(';')[0]
          if (token && token.toLowerCase().startsWith('vercel-bypass=')) {
            this.cookieJar.push(token)
          }
        }
      } catch (error) {
        console.warn('⚠️ Unable to auto-fetch bypass cookie:', error)
      }
    }
  }

  async call(path: string, init?: RequestInit): Promise<IngestResult> {
    await this.ensureBypassCookie()
    const url = new URL(path, this.host).toString()
    const headers: HeadersInit = {
      'x-admin-ingest-key': this.key,
    }
    if (this.cookieJar.length) {
      headers.Cookie = this.cookieJar.join('; ')
    }
    const response = await fetch(url, { ...init, headers })
    const text = await response.text()
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}) → ${url}: ${typeof body === 'string' ? body : JSON.stringify(body)}`)
    }
    return (body || {}) as IngestResult
  }
}

type VideoIngestOptions = {
  client: IngestClient
  quota: QuotaManager
  cli: CliOptions
  logger?: Logger
  env: NodeJS.ProcessEnv
}

type Totals = { inserted: number; updated: number; unique: number; scanned: number }

class VideoIngestor {
  private readonly category: Category = 'videos'
  private readonly comboHistory: ComboRecord[] = []
  private readonly logs: LogEntry[] = []
  private readonly durations: string

  constructor(private readonly options: VideoIngestOptions) {
    this.durations = this.resolveDurations()
  }

  private resolveDurations(): string {
    const list = this.options.env.LOCAL_VIDEOS_DURATIONS
    if (!list) return DEFAULT_YT_DURATIONS.join(',')
    const tokens = list.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean)
    if (!tokens.length) return DEFAULT_YT_DURATIONS.join(',')
    return Array.from(new Set(tokens)).join(',')
  }

  private emit(level: LogLevel, message: string, detail?: unknown) {
    const entry: LogEntry = { level, message, detail, timestamp: new Date().toISOString() }
    this.logs.push(entry)
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
    if (detail !== undefined) fn(message, detail)
    else fn(message)
    this.options.logger?.({ category: this.category, level, message, detail, timestamp: entry.timestamp })
  }

  private durationsArray(): string[] {
    return this.durations.split(',').map((part) => part.trim()).filter(Boolean)
  }

  async run(): Promise<CategorySummary> {
    const startedAt = Date.now()
    const totals: Totals = { inserted: 0, updated: 0, unique: 0, scanned: 0 }
    let combosRun = 0
    const durationTokens = this.durationsArray()
    const durationCount = durationTokens.length || DEFAULT_YT_DURATIONS.length
    const costPerCombo = this.computeCost(durationCount)
    const per = getEnvNumber('LOCAL_VIDEOS_PER_PAGE', 10, this.options.env)
    const days = getEnvNumber('LOCAL_VIDEOS_DAYS', 365, this.options.env)
    const sampleSize = getEnvNumber('LOCAL_VIDEOS_SAMPLE', 6, this.options.env)

    try {
      while ((!this.options.cli.maxCombos || combosRun < (this.options.cli.maxCombos ?? 0)) && this.options.quota.canConsume('youtube', costPerCombo)) {
        const combo = await generateKeywordCombo()
        const query = combo.query
        const label = buildKeywordLabel(combo) || '(empty)'

        if (!query) {
          this.emit('warn', '⚠️  Videos → skipping empty combo')
          continue
        }

        if (!this.options.quota.consume('youtube', costPerCombo)) {
          this.emit('info', `⏹️  Videos → quota threshold reached before executing combo ${label}`)
          break
        }

        this.emit('info', `▶️  Videos → ${label}`)

        const params = new URLSearchParams({
          mode: 'search',
          per: String(per),
          pages: '1',
          days: String(days),
          durations: this.durations,
          sample: String(sampleSize),
          dry: this.options.cli.dryRun ? '1' : '0',
          q: query,
        })

        try {
          const result = await this.options.client.call(`/api/ingest/videos?${params.toString()}`)
          const inserted = result?.inserted ?? 0
          const updated = result?.updated ?? 0
          const unique = result?.unique ?? 0
          const scanned = result?.scanned ?? 0

          totals.inserted += inserted
          totals.updated += updated
          totals.unique += unique
          totals.scanned += scanned

          this.comboHistory.push({ label, query, inserted, updated, unique, scanned })
          this.emit('info', `   → scanned:${scanned} unique:${unique} inserted:${inserted} updated:${updated}`)
        } catch (error) {
          this.emit('error', `❌  Videos → ingest failed for ${label}`, error instanceof Error ? error.message : error)
          throw error
        }

        combosRun += 1
        if (this.options.cli.sleepMs > 0) {
          await sleep(this.options.cli.sleepMs)
        }
      }

      this.emit('info', `✔️  Videos → combos executed: ${combosRun}`)

      const finishedAt = Date.now()
      return {
        name: this.category,
        status: 'completed',
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date(finishedAt).toISOString(),
        durationMs: finishedAt - startedAt,
        combosExecuted: combosRun,
        totals,
        history: this.comboHistory.slice(),
        logs: this.logs.slice(),
      }
    } catch (error) {
      const finishedAt = Date.now()
      const message = error instanceof Error ? error.message : String(error)
      const summary: CategorySummary = {
        name: this.category,
        status: 'failed',
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date(finishedAt).toISOString(),
        durationMs: finishedAt - startedAt,
        combosExecuted: combosRun,
        totals,
        logs: this.logs.slice(),
        error: message,
      }
      return summary
    }
  }

  private computeCost(durationCount: number): number {
    const searches = Math.max(1, durationCount)
    return searches * 100 + 1
  }
}

type ComboIngestOptions = {
  client: IngestClient
  quota: QuotaManager
  cli: CliOptions
  quotaKey: 'images' | 'web'
  category: Category
  label: string
  endpoint: string
  paramsBuilder: (query: string, dryRun: boolean) => URLSearchParams
  costPerCall: number
  logger?: Logger
}

class ComboIngestor {
  private readonly logs: LogEntry[] = []
  private readonly history: ComboRecord[] = []

  constructor(private readonly options: ComboIngestOptions) {}

  private emit(level: LogLevel, message: string, detail?: unknown) {
    const entry: LogEntry = { level, message, detail, timestamp: new Date().toISOString() }
    this.logs.push(entry)
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
    if (detail !== undefined) fn(message, detail)
    else fn(message)
    this.options.logger?.({ category: this.options.category, level, message, detail, timestamp: entry.timestamp })
  }

  async run(): Promise<CategorySummary> {
    const startedAt = Date.now()
    const quotaUsage = this.options.quota.getUsage(this.options.quotaKey)
    if (!quotaUsage) {
      this.emit('info', `ℹ️  ${this.options.label} → no quota configured, skipping`)
      const timestamp = new Date(startedAt).toISOString()
      return {
        name: this.options.category,
        status: 'skipped',
        reason: 'No quota configured',
        startedAt: timestamp,
        finishedAt: timestamp,
        durationMs: 0,
        logs: this.logs.slice(),
      }
    }

    let combosRun = 0
    const totals: Totals = { inserted: 0, updated: 0, unique: 0, scanned: 0 }

    try {
      while ((!this.options.cli.maxCombos || combosRun < (this.options.cli.maxCombos ?? 0)) && this.options.quota.canConsume(this.options.quotaKey, this.options.costPerCall)) {
        const combo = await generateKeywordCombo()
        const query = combo.query
        const label = buildKeywordLabel(combo) || '(empty)'

        if (!query) {
          this.emit('warn', `⚠️  ${this.options.label} → skipping empty combo`)
          continue
        }

        if (!this.options.quota.consume(this.options.quotaKey, this.options.costPerCall)) {
          this.emit('info', `⏹️  ${this.options.label} → quota threshold reached before executing combo ${label}`)
          break
        }

        this.emit('info', `▶️  ${this.options.label} → ${label}`)
        const params = this.options.paramsBuilder(query, this.options.cli.dryRun)

        try {
          const result = await this.options.client.call(`${this.options.endpoint}?${params.toString()}`)
          const inserted = result?.inserted ?? 0
          const updated = result?.updated ?? 0
          const unique = result?.unique ?? 0
          const scanned = result?.scanned ?? 0

          totals.inserted += inserted
          totals.updated += updated
          totals.unique += unique
          totals.scanned += scanned

          this.history.push({ label, query, inserted, updated, unique, scanned })
          this.emit('info', `   → scanned:${scanned} unique:${unique} inserted:${inserted} updated:${updated}`)
        } catch (error) {
          this.emit('error', `❌  ${this.options.label} → ingest failed for ${label}`, error instanceof Error ? error.message : error)
          throw error
        }

        combosRun += 1
        if (this.options.cli.sleepMs > 0) {
          await sleep(this.options.cli.sleepMs)
        }
      }

      this.emit('info', `✔️  ${this.options.label} → combos executed: ${combosRun}`)

      const finishedAt = Date.now()
      return {
        name: this.options.category,
        status: 'completed',
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date(finishedAt).toISOString(),
        durationMs: finishedAt - startedAt,
        combosExecuted: combosRun,
        totals,
        history: this.history.slice(),
        logs: this.logs.slice(),
      }
    } catch (error) {
      const finishedAt = Date.now()
      const message = error instanceof Error ? error.message : String(error)
      return {
        name: this.options.category,
        status: 'failed',
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date(finishedAt).toISOString(),
        durationMs: finishedAt - startedAt,
        combosExecuted: combosRun,
        totals,
        logs: this.logs.slice(),
        error: message,
      }
    }
  }
}

type StaticIngestOptions = {
  client: IngestClient
  quota: QuotaManager
  cli: CliOptions
  quotaKey: 'facts' | 'jokes' | 'quotes'
  category: Category
  label: string
  requests: Array<() => { path: string; description: string; cost: number }>
  supportsDryRun: boolean
  logger?: Logger
}

class StaticIngestor {
  private readonly logs: LogEntry[] = []
  private readonly records: StaticRecord[] = []

  constructor(private readonly options: StaticIngestOptions) {}

  private emit(level: LogLevel, message: string, detail?: unknown) {
    const entry: LogEntry = { level, message, detail, timestamp: new Date().toISOString() }
    this.logs.push(entry)
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
    if (detail !== undefined) fn(message, detail)
    else fn(message)
    this.options.logger?.({ category: this.options.category, level, message, detail, timestamp: entry.timestamp })
  }

  async run(): Promise<CategorySummary> {
    const startedAt = Date.now()
    const quotaUsage = this.options.quota.getUsage(this.options.quotaKey)
    if (!quotaUsage) {
      this.emit('info', `ℹ️  ${this.options.label} → no quota configured, skipping`)
      const timestamp = new Date(startedAt).toISOString()
      return {
        name: this.options.category,
        status: 'skipped',
        reason: 'No quota configured',
        startedAt: timestamp,
        finishedAt: timestamp,
        durationMs: 0,
        logs: this.logs.slice(),
      }
    }

    if (this.options.cli.dryRun && !this.options.supportsDryRun) {
      this.emit('info', `ℹ️  ${this.options.label} → skipping (dry-run unsupported by endpoint)`)
      const timestamp = new Date(startedAt).toISOString()
      return {
        name: this.options.category,
        status: 'skipped',
        reason: 'Dry-run unsupported',
        startedAt: timestamp,
        finishedAt: timestamp,
        durationMs: 0,
        logs: this.logs.slice(),
      }
    }

    let executed = 0

    try {
      for (const buildRequest of this.options.requests) {
        const { path, description, cost } = buildRequest()
        if (!this.options.quota.canConsume(this.options.quotaKey, cost)) {
          this.emit('info', `⏹️  ${this.options.label} → quota threshold reached before ${description}`)
          break
        }

        this.options.quota.consume(this.options.quotaKey, cost)

        try {
          const result = await this.options.client.call(path)
          const inserted = result?.inserted ?? 0
          const updated = result?.updated ?? 0
          const unique = result?.unique ?? 0
          const scanned = result?.scanned ?? result?.requested ?? 0
          this.records.push({ description, inserted, updated, unique, scanned })
          this.emit('info', `▶️  ${this.options.label} → ${description} → unique:${unique} inserted:${inserted} updated:${updated}`)
        } catch (error) {
          this.emit('error', `❌  ${this.options.label} → failed during ${description}`, error instanceof Error ? error.message : error)
          throw error
        }

        executed += 1
        if (this.options.cli.sleepMs > 0) {
          await sleep(this.options.cli.sleepMs)
        }
      }

      if (!this.records.length) {
        this.emit('info', `ℹ️  ${this.options.label} → no requests executed`)
      } else {
        this.emit('info', `✔️  ${this.options.label} → requests executed: ${this.records.length}`)
      }

      const totals: Totals = this.records.reduce(
        (acc, entry) => {
          acc.inserted += entry.inserted
          acc.updated += entry.updated
          acc.unique += entry.unique
          acc.scanned += entry.scanned
          return acc
        },
        { inserted: 0, updated: 0, unique: 0, scanned: 0 },
      )

      const finishedAt = Date.now()
      return {
        name: this.options.category,
        status: 'completed',
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date(finishedAt).toISOString(),
        durationMs: finishedAt - startedAt,
        requestsExecuted: executed,
        totals,
        records: this.records.slice(),
        logs: this.logs.slice(),
      }
    } catch (error) {
      const totals: Totals = this.records.reduce(
        (acc, entry) => {
          acc.inserted += entry.inserted
          acc.updated += entry.updated
          acc.unique += entry.unique
          acc.scanned += entry.scanned
          return acc
        },
        { inserted: 0, updated: 0, unique: 0, scanned: 0 },
      )
      const finishedAt = Date.now()
      const message = error instanceof Error ? error.message : String(error)
      return {
        name: this.options.category,
        status: 'failed',
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date(finishedAt).toISOString(),
        durationMs: finishedAt - startedAt,
        requestsExecuted: executed,
        totals,
        records: this.records.slice(),
        logs: this.logs.slice(),
        error: message,
      }
    }
  }
}

function buildDefaultCliOptions(env: NodeJS.ProcessEnv = process.env): CliOptions {
  return {
    categories: new Set(ALL_CATEGORIES),
    dryRun: false,
    maxCombos: null,
    sleepMs: getEnvNumber('LOCAL_COMBO_SLEEP_MS', 350, env),
  }
}

export function parseCliArgs(args: string[], env: NodeJS.ProcessEnv = process.env): CliOptions {
  const categories = new Set<Category>()
  let categoriesSpecified = false
  let dryRun = false
  let maxCombos: number | null = null
  let sleepMs = getEnvNumber('LOCAL_COMBO_SLEEP_MS', 350, env)

  const addCategory = (value: string) => {
    if ((ALL_CATEGORIES as readonly string[]).includes(value)) {
      categories.add(value as Category)
      categoriesSpecified = true
    }
  }

  for (let i = 0; i < args.length; i++) {
    const token = args[i]
    if (token === '--dry' || token === '--preview') {
      dryRun = true
    } else if (token.startsWith('--only=')) {
      const values = token.split('=')[1]
      values.split(',').map((v) => v.trim().toLowerCase()).forEach(addCategory)
    } else if (token === '--only') {
      const next = args[i + 1] || ''
      next.split(',').map((v) => v.trim().toLowerCase()).forEach(addCategory)
      i += 1
    } else if (token.startsWith('--categories=')) {
      const values = token.split('=')[1]
      values.split(',').map((v) => v.trim().toLowerCase()).forEach(addCategory)
    } else if (token === '--videos' || token === '--images' || token === '--web' || token === '--facts' || token === '--jokes' || token === '--quotes') {
      addCategory(token.replace('--', ''))
    } else if (token === '--all') {
      ALL_CATEGORIES.forEach((cat) => categories.add(cat))
      categoriesSpecified = true
    } else if (token.startsWith('--max=')) {
      const value = Number(token.split('=')[1])
      if (Number.isFinite(value) && value > 0) {
        maxCombos = Math.floor(value)
      }
    } else if (token === '--max') {
      const next = Number(args[i + 1])
      if (Number.isFinite(next) && next > 0) {
        maxCombos = Math.floor(next)
      }
      i += 1
    } else if (token.startsWith('--sleep=')) {
      const value = Number(token.split('=')[1])
      if (Number.isFinite(value) && value >= 0) sleepMs = value
    } else if (token === '--sleep') {
      const next = Number(args[i + 1])
      if (Number.isFinite(next) && next >= 0) sleepMs = next
      i += 1
    }
  }

  if (!categoriesSpecified) {
    ALL_CATEGORIES.forEach((cat) => categories.add(cat))
  }

  return { categories, dryRun, maxCombos, sleepMs }
}

function loadEnv(env: NodeJS.ProcessEnv = process.env): { host: string; key: string; bypassToken?: string; bypassCookie?: string } {
  const rawHost = env.HOST || ''
  const key = env.ADMIN_INGEST_KEY || env.KEY || ''
  if (!rawHost) {
    throw new Error('Missing HOST environment variable')
  }
  if (!key) {
    throw new Error('Missing ADMIN_INGEST_KEY environment variable')
  }
  const host = /^https?:/i.test(rawHost) ? rawHost : `https://${rawHost}`
  return {
    host,
    key,
    bypassToken: env.VERCEL_BYPASS_TOKEN,
    bypassCookie: env.VERCEL_BYPASS_COOKIE,
  }
}

export async function runIngest(options: RunIngestOptions = {}): Promise<RunSummary> {
  const env = options.env ?? process.env
  const baseCli = options.cliOptions ?? buildDefaultCliOptions(env)
  const categories = new Set<Category>(options.categories ?? Array.from(baseCli.categories))
  if (!categories.size) {
    ALL_CATEGORIES.forEach((cat) => categories.add(cat))
  }
  const cli: CliOptions = {
    categories,
    dryRun: options.dryRun ?? baseCli.dryRun,
    maxCombos: options.maxCombos ?? baseCli.maxCombos,
    sleepMs: options.sleepMs ?? baseCli.sleepMs,
  }

  const aggregatedLogs: LogEvent[] = []
  const emit: Logger = (event) => {
    aggregatedLogs.push(event)
    options.logger?.(event)
  }

  const startedAt = Date.now()
  emit({ category: 'system', level: 'info', message: '🚀 Local ingest runner', timestamp: new Date(startedAt).toISOString() })
  emit({ category: 'system', level: 'info', message: `   Categories: ${Array.from(cli.categories).join(', ')}`, timestamp: new Date().toISOString() })
  emit({ category: 'system', level: 'info', message: `   Dry run: ${cli.dryRun}`, timestamp: new Date().toISOString() })
  if (cli.maxCombos) {
    emit({ category: 'system', level: 'info', message: `   Max combos: ${cli.maxCombos}`, timestamp: new Date().toISOString() })
  }

  const envConfig = loadEnv(env)
  const quota = new QuotaManager()

  const selectBudget = (key: string, label: string, envName: string, fallback: number, reserveRatio = 0.2) => {
    const limit = getEnvNumber(envName, fallback, env)
    if (limit <= 0) {
      emit({ category: 'system', level: 'info', message: `ℹ️  ${label} quota disabled (limit ≤ 0) via ${envName}`, timestamp: new Date().toISOString() })
      return
    }
    quota.addBudget(key, { label, limit, reserveRatio })
  }

  if (cli.categories.has('videos')) {
    selectBudget('youtube', 'YouTube Data API', 'YOUTUBE_DAILY_QUOTA', 10000)
  }
  if (cli.categories.has('images')) {
    selectBudget('images', 'Images providers', 'IMAGES_DAILY_CALLS', 400)
  }
  if (cli.categories.has('web')) {
    selectBudget('web', 'Web discovery', 'WEB_DAILY_CALLS', 120)
  }
  if (cli.categories.has('facts')) {
    selectBudget('facts', 'Facts providers', 'FACTS_DAILY_CALLS', 12)
  }
  if (cli.categories.has('jokes')) {
    selectBudget('jokes', 'Jokes providers', 'JOKES_DAILY_CALLS', 6)
  }
  if (cli.categories.has('quotes')) {
    selectBudget('quotes', 'Quotes providers', 'QUOTES_DAILY_CALLS', 4)
  }

  const client = new IngestClient(envConfig.host, envConfig.key, envConfig.bypassToken, envConfig.bypassCookie)
  const categorySummaries: CategorySummary[] = []

  const runCategory = async (name: Category, runner: () => Promise<CategorySummary>) => {
    if (!cli.categories.has(name)) {
      const now = new Date().toISOString()
      categorySummaries.push({
        name,
        status: 'skipped',
        reason: 'Category not selected',
        startedAt: now,
        finishedAt: now,
        durationMs: 0,
        logs: [],
      })
      return
    }
    const summary = await runner()
    categorySummaries.push(summary)
  }

  await runCategory('videos', async () => {
    const ingestor = new VideoIngestor({ client, quota, cli, logger: emit, env })
    return ingestor.run()
  })

  await runCategory('images', async () => {
    const perQuery = getEnvNumber('LOCAL_IMAGES_PER_QUERY', 40, env)
    const providers = (env.LOCAL_IMAGES_PROVIDERS || '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
    const paramsBuilder = (query: string, dryRun: boolean) => {
      const params = new URLSearchParams({
        per: String(perQuery),
        q: query,
        sample: String(getEnvNumber('LOCAL_IMAGES_SAMPLE', 6, env)),
      })
      if (providers.length) params.set('providers', Array.from(new Set(providers)).join(','))
      if (dryRun) params.set('dry', '1')
      return params
    }
    const ingestor = new ComboIngestor({
      client,
      quota,
      cli,
      quotaKey: 'images',
      category: 'images',
      label: 'Images',
      endpoint: '/api/ingest/images',
      paramsBuilder,
      costPerCall: getEnvNumber('LOCAL_IMAGES_COST_PER_CALL', 1, env),
      logger: emit,
    })
    return ingestor.run()
  })

  await runCategory('web', async () => {
    const per = getEnvNumber('LOCAL_WEB_PER', 2, env)
    const pages = getEnvNumber('LOCAL_WEB_PAGES', 1, env)
    const limit = getEnvNumber('LOCAL_WEB_LIMIT', Math.max(12, per * pages * 2), env)
    const providers = (env.LOCAL_WEB_PROVIDERS || '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
    const paramsBuilder = (query: string, dryRun: boolean) => {
      const params = new URLSearchParams({
        per: String(per),
        pages: String(pages),
        limit: String(limit),
        q: query,
      })
      if (providers.length) params.set('providers', Array.from(new Set(providers)).join(','))
      if (dryRun) params.set('dry', '1')
      return params
    }
    const ingestor = new ComboIngestor({
      client,
      quota,
      cli,
      quotaKey: 'web',
      category: 'web',
      label: 'Web',
      endpoint: '/api/ingest/web',
      paramsBuilder,
      costPerCall: getEnvNumber('LOCAL_WEB_COST_PER_CALL', 1, env),
      logger: emit,
    })
    return ingestor.run()
  })

  await runCategory('facts', async () => {
    const calls = Math.max(1, Math.floor(getEnvNumber('LOCAL_FACTS_CALLS', 4, env)))
    const amount = Math.max(10, Math.floor(getEnvNumber('LOCAL_FACTS_AMOUNT', 200, env)))
    const sites = env.LOCAL_FACTS_SITES || 'awesomefacts,useless,numbers,cat,meow,dog,urban,factslides,interestingfacts,thefactsite'
    const requests = Array.from({ length: calls }, (_, index) => () => ({
      path: `/api/ingest/facts?n=${amount}&sites=${encodeURIComponent(sites)}`,
      description: `batch ${index + 1}/${calls} (n=${amount})`,
      cost: getEnvNumber('LOCAL_FACTS_COST_PER_CALL', 1, env),
    }))
    const ingestor = new StaticIngestor({
      client,
      quota,
      cli,
      quotaKey: 'facts',
      category: 'facts',
      label: 'Facts',
      requests,
      supportsDryRun: false,
      logger: emit,
    })
    return ingestor.run()
  })

  await runCategory('jokes', async () => {
    const calls = Math.max(1, Math.floor(getEnvNumber('LOCAL_JOKES_CALLS', 1, env)))
    const limit = Math.max(20, Math.floor(getEnvNumber('LOCAL_JOKES_LIMIT', 800, env)))
    const sources = env.LOCAL_JOKES_SOURCES || 'dataset,funnyquotes,official,icanhaz,jokeapi,beano,goodhousekeeping,pioneerwoman,jokesoftheday'
    const requests = Array.from({ length: calls }, (_, index) => () => {
      const params = new URLSearchParams({
        limit: String(limit),
        sources,
      })
      if (cli.dryRun) params.set('dryRun', '1')
      return {
        path: `/api/ingest/jokes?${params.toString()}`,
        description: `batch ${index + 1}/${calls} (limit=${limit})`,
        cost: getEnvNumber('LOCAL_JOKES_COST_PER_CALL', 1, env),
      }
    })
    const ingestor = new StaticIngestor({
      client,
      quota,
      cli,
      quotaKey: 'jokes',
      category: 'jokes',
      label: 'Jokes',
      requests,
      supportsDryRun: true,
      logger: emit,
    })
    return ingestor.run()
  })

  await runCategory('quotes', async () => {
    const calls = Math.max(1, Math.floor(getEnvNumber('LOCAL_QUOTES_CALLS', 1, env)))
    const pages = Math.max(1, Math.floor(getEnvNumber('LOCAL_QUOTES_PAGES', 30, env)))
    const sites = env.LOCAL_QUOTES_SITES || 'toscrape,typefit,passiton,zenquotes,github-db,github-programming,github-famous'
    const requests = Array.from({ length: calls }, (_, index) => () => ({
      path: `/api/ingest/quotes?pages=${pages}&sites=${encodeURIComponent(sites)}`,
      description: `batch ${index + 1}/${calls} (pages=${pages})`,
      cost: getEnvNumber('LOCAL_QUOTES_COST_PER_CALL', 1, env),
    }))
    const ingestor = new StaticIngestor({
      client,
      quota,
      cli,
      quotaKey: 'quotes',
      category: 'quotes',
      label: 'Quotes',
      requests,
      supportsDryRun: false,
      logger: emit,
    })
    return ingestor.run()
  })

  const finishedAt = Date.now()
  emit({ category: 'system', level: 'info', message: '🎯 All tasks completed', timestamp: new Date(finishedAt).toISOString() })

  return {
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: finishedAt - startedAt,
    dryRun: cli.dryRun,
    categories: categorySummaries,
    quota: quota.getUsageSnapshot(),
    logs: aggregatedLogs,
  }
}

async function runCli(): Promise<void> {
  const cliOptions = parseCliArgs(process.argv.slice(2))
  const summary = await runIngest({ cliOptions })

  let hasFailure = false
  for (const cat of summary.categories) {
    const header = `[${cat.name}] ${cat.status.toUpperCase()} (${(cat.durationMs / 1000).toFixed(1)}s)`
    if (cat.status === 'failed') {
      hasFailure = true
      console.error('\n' + header)
      if (cat.error) console.error('  Error:', cat.error)
    } else {
      console.log('\n' + header)
    }
    if (cat.reason) {
      console.log('  Reason:', cat.reason)
    }
    if (cat.totals) {
      console.log(`  Totals → scanned:${cat.totals.scanned} unique:${cat.totals.unique} inserted:${cat.totals.inserted} updated:${cat.totals.updated}`)
    }
    if (cat.combosExecuted != null) {
      console.log(`  Combos executed: ${cat.combosExecuted}`)
    }
    if (cat.requestsExecuted != null) {
      console.log(`  Requests executed: ${cat.requestsExecuted}`)
    }
  }

  console.log(`\nDuration: ${(summary.durationMs / 1000).toFixed(1)}s`)
  process.exitCode = hasFailure ? 1 : 0
}

const isDirect = (() => {
  const entry = Array.isArray(process.argv) ? process.argv[1] || '' : ''
  if (!entry) return false
  return /local-ingest(\.\w+)?$/i.test(entry)
})()

if (isDirect) {
  runCli().catch((error) => {
    console.error('💥 Local ingest failed', error)
    process.exitCode = 1
  })
}
