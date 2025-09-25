export type FetchOptions = RequestInit & { timeoutMs?: number }

export const DEFAULT_INGEST_HEADERS: HeadersInit = {
  'User-Agent': 'RandomAppBot/1.0 (+https://random.app)',
}

function mergeHeaders(headers?: HeadersInit): Headers {
  const merged = new Headers(DEFAULT_INGEST_HEADERS)
  if (headers) {
    const extra = new Headers(headers)
    extra.forEach((value, key) => merged.set(key, value))
  }
  return merged
}

export async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  options: FetchOptions = {},
): Promise<Response | null> {
  const { timeoutMs = 10000, headers, signal, ...rest } = options
  const controller = !signal && typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null

  try {
    const response = await fetch(input, {
      ...rest,
      headers: mergeHeaders(headers),
      signal: controller ? controller.signal : signal,
    })
    return response
  } catch (error) {
    if ((error as { name?: string } | null)?.name === 'AbortError') return null
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function fetchJson<T = unknown>(
  url: string,
  options: FetchOptions = {},
): Promise<T | null> {
  const res = await fetchWithTimeout(url, options)
  if (!res?.ok) return null
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function fetchText(
  url: string,
  options: FetchOptions = {},
): Promise<string | null> {
  const res = await fetchWithTimeout(url, options)
  if (!res?.ok) return null
  try {
    return await res.text()
  } catch {
    return null
  }
}
