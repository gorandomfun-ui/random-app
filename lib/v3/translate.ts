/**
 * A short text into English through MyMemory's free service (5,000 characters a day without an account, 17 October): the
 * titles and categories of the few Bilibili videos the owner likes, so their look-alikes are searched in English too
 * (lib/v3/ingest/lines/lookalike.ts). The translation is only a search: the little AI judges what comes back. Null on any
 * failure or once the day's characters are spent.
 */
export async function toEnglish(text: string, from: string, request: typeof fetch = fetch): Promise<string | null> {
  const q = text.replace(/\s+/g, ' ').trim().slice(0, 450)
  if (!q) return null
  try {
    const response = await request(`https://api.mymemory.translated.net/get?${new URLSearchParams({ q, langpair: `${from}|en` })}`, { signal: AbortSignal.timeout(15_000) })
    if (!response.ok) return null
    const body = (await response.json()) as { responseStatus?: number | string; quotaFinished?: boolean; responseData?: { translatedText?: string } }
    const out = (body.responseData?.translatedText ?? '').replace(/\s+/g, ' ').trim()
    if (Number(body.responseStatus) !== 200 || body.quotaFinished || !out || /MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(out)) return null
    return out
  } catch {
    return null
  }
}
