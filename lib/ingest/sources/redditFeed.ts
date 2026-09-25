/**
 * The key to Reddit, when there is one.
 *
 * Measured on the ingestion server on 25 September: the plain JSON answers 403
 * to a datacentre address, and the feed of the same page answers 200 but only
 * two times out of eight, even spaced seven seconds apart. Unauthenticated
 * reading is not a road.
 *
 * With a client identifier and secret — a free "script" application, declared
 * once — Reddit hands out a token and a real allowance. The line then reads the
 * ordinary JSON through it. Without them it falls back to the feed and takes
 * what it can.
 */
let token: { value: string; until: number } | null = null

async function redditToken(): Promise<string | null> {
  const id = (process.env.REDDIT_CLIENT_ID || '').trim()
  const secret = (process.env.REDDIT_CLIENT_SECRET || '').trim()
  if (!id || !secret) return null
  if (token && token.until > Date.now() + 60_000) return token.value
  try {
    const response = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(9000),
    })
    if (!response.ok) return null
    const payload = (await response.json()) as { access_token?: string; expires_in?: number }
    if (!payload.access_token) return null
    token = { value: payload.access_token, until: Date.now() + (payload.expires_in ?? 3600) * 1000 }
    return token.value
  } catch {
    return null
  }
}

/** The posts of a listing, as the authenticated API gives them. */
async function readJson(sub: string, listing: string, time: string | undefined, limit: number, bearer: string, label: string, warnings?: FetchWarning[]): Promise<Array<{ url: string; title: string; permalink: string }> | null> {
  const params = new URLSearchParams({ limit: String(limit), raw_json: '1' })
  if (listing === 'top' && time) params.set('t', time)
  try {
    const response = await fetch(`https://oauth.reddit.com/r/${encodeURIComponent(sub)}/${listing}?${params}`, {
      headers: { Authorization: `Bearer ${bearer}`, 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(9000),
      cache: 'no-store',
    })
    if (!response.ok) {
      warnings?.push({ label, status: response.status, statusText: response.statusText })
      if (response.status === 401) token = null
      return null
    }
    const payload = (await response.json()) as { data?: { children?: Array<{ data?: { url?: string; title?: string; permalink?: string } }> } }
    return (payload.data?.children ?? []).map((child) => ({
      url: String(child?.data?.url || ''),
      title: String(child?.data?.title || ''),
      permalink: child?.data?.permalink ? `https://www.reddit.com${child.data.permalink}` : '',
    }))
  } catch (error) {
    warnings?.push({ label, message: error instanceof Error ? error.message : 'reddit unreachable' })
    return null
  }
}

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
const USER_AGENT = 'web:gorandom.fun:1.0 (+https://www.gorandom.fun)'

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

  // The authenticated road first, when the key is there.
  const bearer = await redditToken();
  if (bearer) {
    const posts = await readJson(sub, listing, time, safeLimit, bearer, label, warnings);
    if (posts) {
      const found: RawVideo[] = [];
      const known = new Set<string>();
      for (const post of posts) {
        const videoId = youtubeIdFromUrl(post.url);
        if (!videoId || known.has(videoId)) continue;
        known.add(videoId);
        found.push({
          videoId,
          url: `https://youtu.be/${videoId}`,
          provider: 'reddit-youtube',
          title: post.title,
          thumb: youtubeThumb(videoId),
          source: { name: 'Reddit', url: post.permalink || `https://www.reddit.com/r/${sub}` },
          contextQueries: [`reddit:${sub}`, `reddit:${sub}:${listing}${time ? `:${time}` : ''}`],
        });
      }
      options?.onCursor?.(null);
      return found;
    }
  }

  const url = `https://www.reddit.com/r/${encodeURIComponent(sub)}/${listing}/.rss?${params.toString()}`;

  let xml = '';
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/atom+xml,application/xml' },
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

