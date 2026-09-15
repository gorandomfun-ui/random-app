import type { SourceMetadata } from './types'

/** Provider permalink evidence is separate from search queries and from CDN filenames. */
export function providerPageWords(source: Pick<SourceMetadata, 'provider' | 'pageUrl'>): string[] {
  if (!source.pageUrl || !['giphy', 'tenor'].includes(source.provider ?? '')) return []
  try {
    const url = new URL(source.pageUrl)
    if (url.protocol !== 'https:' || url.username || url.password) return []
    const host = url.hostname.replace(/^www\./, '')
    if (host !== `${source.provider}.com`) return []
    const match = source.provider === 'tenor'
      ? url.pathname.match(/^\/view\/(.+)-(?:gif-)?\d+\/?$/)
      : url.pathname.match(/^\/(?:gifs|stickers)\/(.+)-[A-Za-z0-9]+\/?$/)
    if (!match) return []
    return decodeURIComponent(match[1]).replace(/([a-z])([A-Z])/g, '$1 $2').split(/[-_\s]+/u)
      .filter(word => word.length >= 2).slice(0, 24)
  } catch { return [] }
}

const REACTION = new Set(('gif gifs reaction reactions shocked happy sad funny fun smile laughing laugh crying cry ' +
  'stan twt meme memes edit love yes no dance dancing face mood tutorial animated animation sticker stickers').split(' '))
export function permalinkSubject(source: SourceMetadata): string | undefined {
  const words = providerPageWords(source)
  const prefix: string[] = []
  for (const word of words) {
    if (REACTION.has(word.toLowerCase())) break
    if (prefix.some(previous => previous.toLowerCase().startsWith(word.toLowerCase()))) {
      // Slugs sometimes repeat an abbreviated name: “full-name-short-name-reaction”.
      // A repeated prefix supports the word boundary; it is not a celebrity dictionary.
      if (prefix.length === 1 && prefix[0].length > word.length + 2) {
        return `${word} ${prefix[0].slice(word.length)}`
      }
      break
    }
    prefix.push(word)
    if (prefix.length >= 4) break
  }
  return prefix.length ? prefix.join(' ') : undefined
}

/** Strip presentation wrappers, not words inside titles of works or artists. */
export function subjectTitle(value: string): string {
  return value.replace(/^\s*(?:\d{4}\s*[-–—:]\s*)+/u, '')
    .replace(/^\s*(?:\[(?:MV|PV|HD|4K|HQ|AMV)\]|【(?:MV|PV|HD|4K|HQ|AMV)】)\s*/giu, '')
    .trim()
}
