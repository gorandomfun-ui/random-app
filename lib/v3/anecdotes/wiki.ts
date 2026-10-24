/**
 * Wikipedia's API, read politely: one request at a time, a second and a tenth apart counted from the end of the
 * previous answer, named by our User-Agent, `maxlag` honoured, a busy answer waited out. `action=parse` renders the
 * archive page with its templates already turned into text — what lib/v3/anecdotes/parse.ts reads.
 */

import { WIKI_HOST, type AnecdoteLang, type WikiPage } from './parse'

export const USER_AGENT = 'RandomIngest/1.0 (+https://www.gorandom.fun)'
/** At most one request a second (Wikimedia's rule for a client without an account), one in flight at a time. */
export const MIN_GAP_MS = 1100
const ATTEMPTS = 5
/** A year of French anecdotes is a page of one and a half megabytes. */
const TIMEOUT_MS = 60_000

export type WikiClient = {
  /** The page as rendered, or null when it does not exist (an English month not archived yet). */
  page(lang: AnecdoteLang, title: string): Promise<WikiPage | null>
  /** The titles under a prefix in a namespace, redirects left out. */
  titles(lang: AnecdoteLang, namespace: number, prefix: string): Promise<string[]>
  /** What was asked so far: requests sent and bytes received. */
  stats(): { requests: number; bytes: number }
}

type ApiAnswer = {
  error?: { code?: string; info?: string }
  parse?: { title?: string; text?: string }
  query?: { allpages?: Array<{ title?: string }> }
  continue?: { apcontinue?: string }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function wikiClient(options: { http?: typeof fetch; gapMs?: number; wait?: (ms: number) => Promise<void>; log?: (text: string) => void } = {}): WikiClient {
  const http = options.http ?? fetch
  const gapMs = options.gapMs ?? MIN_GAP_MS
  const wait = options.wait ?? sleep
  const log = options.log ?? (() => undefined)
  const counted = { requests: 0, bytes: 0 }
  let lastAnswerAt = 0
  // Every call waits for the one before it: never two requests at once, whoever asks.
  let queue: Promise<unknown> = Promise.resolve()

  async function call(lang: AnecdoteLang, params: Record<string, string>): Promise<ApiAnswer | null> {
    const url = new URL(`https://${WIKI_HOST[lang]}/w/api.php`)
    for (const [key, value] of Object.entries({ format: 'json', formatversion: '2', maxlag: '5', ...params })) url.searchParams.set(key, value)
    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      const gap = lastAnswerAt + gapMs - Date.now()
      if (gap > 0) await wait(gap)
      counted.requests += 1
      let response: Response
      let body: string
      try {
        response = await http(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) })
        body = await response.text()
      } catch (error) {
        lastAnswerAt = Date.now()
        log(`${WIKI_HOST[lang]} : réseau (${message(error)}), essai ${attempt}`)
        await wait(5000 * attempt)
        continue
      }
      lastAnswerAt = Date.now()
      counted.bytes += Buffer.byteLength(body)
      const retryAfterMs = (Number(response.headers.get('retry-after')) || 5 * attempt) * 1000
      if (response.status === 429 || response.status >= 500) {
        log(`${WIKI_HOST[lang]} : HTTP ${response.status}, attente de ${retryAfterMs / 1000} s`)
        await wait(retryAfterMs)
        continue
      }
      let answer: ApiAnswer
      try {
        answer = JSON.parse(body) as ApiAnswer
      } catch {
        throw new Error(`${WIKI_HOST[lang]} : réponse illisible (HTTP ${response.status})`)
      }
      if (answer.error?.code === 'maxlag') {
        await wait(retryAfterMs)
        continue
      }
      if (answer.error?.code === 'missingtitle') return null
      if (answer.error) throw new Error(`${WIKI_HOST[lang]} : ${answer.error.code} (${answer.error.info ?? ''})`)
      return answer
    }
    throw new Error(`${WIKI_HOST[lang]} : abandon après ${ATTEMPTS} essais`)
  }

  function queued<T>(task: () => Promise<T>): Promise<T> {
    const next = queue.then(task, task)
    queue = next.catch(() => undefined)
    return next
  }

  return {
    page: (lang, title) =>
      queued(async () => {
        const answer = await call(lang, {
          action: 'parse',
          page: title,
          prop: 'text',
          redirects: '1',
          disablelimitreport: '1',
          disableeditsection: '1',
          disabletoc: '1',
        })
        if (!answer?.parse?.text) return null
        return { title: answer.parse.title ?? title, html: answer.parse.text }
      }),
    titles: (lang, namespace, prefix) =>
      queued(async () => {
        const titles: string[] = []
        let from: string | undefined
        do {
          const answer = await call(lang, {
            action: 'query',
            list: 'allpages',
            apnamespace: String(namespace),
            apprefix: prefix,
            apfilterredir: 'nonredirects',
            aplimit: '500',
            ...(from ? { apcontinue: from } : {}),
          })
          for (const page of answer?.query?.allpages ?? []) if (page.title) titles.push(page.title)
          from = answer?.continue?.apcontinue
        } while (from)
        return titles
      }),
    stats: () => ({ ...counted }),
  }
}
