/**
 * What a community is sharing, read through its feed.
 *
 * Reddit answers 403 to its own JSON from a datacentre address — measured on
 * the ingestion server, every listing, with or without an honest name. The feed
 * of the same page answers 200. So the feed is the door.
 *
 * Nothing here touches the database, which is what makes it testable.
 */

// Types only: erased at build time, so this file never drags the database in.
import type { FetchWarning, RawVideo, RedditListingOptions } from '../videos'

const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`

/** The YouTube identifier inside a link, whatever shape the link takes. */
function youtubeIdFromUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(parsed.hostname)) return '';
    const id = parsed.hostname.endsWith('youtu.be')
      ? parsed.pathname.split('/').filter(Boolean)[0] || ''
      : parsed.searchParams.get('v') || (/^\/(embed|shorts|live)\//.test(parsed.pathname) ? parsed.pathname.split('/')[2] : '') || '';
    return /^[\w-]{11}$/.test(id) ? id : '';
  } catch {
    return '';
  }
}

/** The text of one XML tag, tags stripped, entities undone. */
function xmlText(block: string, tag: string): string {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
  if (!match) return '';
  return match[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * What a community is sharing, read through its feed.
 *
 * Reddit answers 403 to its own JSON from a datacentre address — measured from
 * the ingestion server, every listing, with or without an honest name. The feed
 * of the same page answers 200. So the feed is the door, and the posts are read
 * from its XML. It carries about twenty-five entries and no cursor; the videos
 * already held are recognised on insert, so a repeat costs nothing.
 */
export async function redditYouTube(
  sub: string,
  limit: number,
  warnings?: FetchWarning[],
  options?: RedditListingOptions,
): Promise<RawVideo[]> {
  const listing = options?.listing || 'hot';
  const time = options?.time;
  const safeLimit = Math.min(100, Math.max(5, limit));
  const params = new URLSearchParams({ limit: String(safeLimit) });
  if (listing === 'top' && time) params.set('t', time);
  const label = time ? `reddit:${sub}:${listing}:${time}` : `reddit:${sub}:${listing}`;
  const url = `https://www.reddit.com/r/${encodeURIComponent(sub)}/${listing}/.rss?${params.toString()}`;

  let xml = '';
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'web:gorandom.fun:1.0 (+https://www.gorandom.fun)', Accept: 'application/atom+xml,application/xml' },
      signal: AbortSignal.timeout(9000),
      cache: 'no-store',
    });
    if (!response.ok) {
      warnings?.push({ label, status: response.status, statusText: response.statusText });
      return [];
    }
    xml = await response.text();
  } catch (error) {
    warnings?.push({ label, message: error instanceof Error ? error.message : 'feed unreachable' });
    return [];
  }

  const out: RawVideo[] = [];
  const seen = new Set<string>();
  for (const entry of xml.split(/<entry[\s>]/i).slice(1)) {
    // The post's own page, and every link its body carries: the video is in one of them.
    const permalink = /<link[^>]*href="([^"]+)"/i.exec(entry)?.[1] || '';
    const candidates = [...entry.matchAll(/href="([^"]+)"/gi)].map((match) => match[1].replace(/&amp;/g, '&'));
    const videoId = candidates.map(youtubeIdFromUrl).find(Boolean) || '';
    if (!videoId || seen.has(videoId)) continue;
    seen.add(videoId);
    const context = [`reddit:${sub}`, `reddit:${sub}:${listing}${time ? `:${time}` : ''}`];
    out.push({
      videoId,
      url: `https://youtu.be/${videoId}`,
      provider: 'reddit-youtube',
      title: xmlText(entry, 'title'),
      thumb: youtubeThumb(videoId),
      source: { name: 'Reddit', url: permalink || `https://www.reddit.com/r/${sub}` },
      contextQueries: context,
    });
  }
  // The feed carries no cursor; nothing to remember between passes.
  options?.onCursor?.(null);
  return out;
}

