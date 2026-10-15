/**
 * The Instagram API with Instagram Login (graph.instagram.com), for one
 * account, the curator's: a container per slide, its status, the publish
 * call, the permalink, the first comment, the quota. The token comes from
 * the environment and never leaves the server. Every call takes the fetch
 * it should use, so the tests hand it a pretend API.
 */

export const IG_BASE = 'https://graph.instagram.com/v23.0'

export type IgFetch = (url: string, init?: RequestInit) => Promise<Response>

export type IgConfig = { token: string; accountId: string }

export function igConfig(): IgConfig | null {
  const token = (process.env.INSTAGRAM_ACCESS_TOKEN ?? '').trim()
  const accountId = (process.env.INSTAGRAM_ACCOUNT_ID ?? '').trim()
  return token.length > 20 && /^\d{3,30}$/.test(accountId) ? { token, accountId } : null
}

export class IgError extends Error {
  constructor(message: string, readonly status: number, readonly code?: number, readonly subcode?: number) { super(message) }
}

async function call<T>(fetchImpl: IgFetch, url: string, init?: RequestInit): Promise<T> {
  const response = await fetchImpl(url, init)
  const body = (await response.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string } } & T
  if (!response.ok || body.error) {
    const e = body.error ?? {}
    throw new IgError(e.error_user_msg || e.message || `Instagram a répondu ${response.status}`, response.status, e.code, e.error_subcode)
  }
  return body
}

const form = (fields: Record<string, string>) => new URLSearchParams(fields)

export type IgKind = 'image' | 'video'
export type IgFormat = 'post' | 'carousel' | 'reel' | 'story'

/** The account behind the token: its id and name, a way to tell the token still works. */
export function igMe(fetchImpl: IgFetch, token: string): Promise<{ user_id?: string; id?: string; username?: string; account_type?: string }> {
  return call(fetchImpl, `${IG_BASE}/me?fields=user_id,username,account_type&access_token=${encodeURIComponent(token)}`)
}

/** A new long-lived token, valid sixty days from now; the one in use must be at least a day old and not expired. */
export function igRefreshToken(fetchImpl: IgFetch, token: string): Promise<{ access_token: string; expires_in: number }> {
  return call(fetchImpl, `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`)
}

export function igPublishingLimit(fetchImpl: IgFetch, config: IgConfig): Promise<{ data?: Array<{ quota_usage?: number; config?: { quota_total?: number; quota_duration?: number } }> }> {
  return call(fetchImpl, `${IG_BASE}/${config.accountId}/content_publishing_limit?fields=quota_usage,config&access_token=${encodeURIComponent(config.token)}`)
}

/**
 * One container: a picture or a clip at a public address, as a feed post, a
 * reel, a story, or a carousel's child.
 */
export async function igCreateContainer(fetchImpl: IgFetch, config: IgConfig, input: { kind: IgKind; url: string; format: IgFormat; caption?: string; child?: boolean }): Promise<string> {
  const fields: Record<string, string> = { access_token: config.token }
  if (input.kind === 'image') fields.image_url = input.url; else fields.video_url = input.url
  if (input.format === 'story') fields.media_type = 'STORIES'
  else if (input.kind === 'video') fields.media_type = 'REELS'
  if (input.child) fields.is_carousel_item = 'true'
  if (input.caption && !input.child && input.format !== 'story') fields.caption = input.caption
  const body = await call<{ id?: string }>(fetchImpl, `${IG_BASE}/${config.accountId}/media`, { method: 'POST', body: form(fields) })
  if (!body.id) throw new IgError('Instagram n’a pas rendu d’identifiant de conteneur', 502)
  return body.id
}

/** The carousel itself, over its children's containers. */
export async function igCreateCarousel(fetchImpl: IgFetch, config: IgConfig, children: string[], caption: string): Promise<string> {
  const body = await call<{ id?: string }>(fetchImpl, `${IG_BASE}/${config.accountId}/media`, { method: 'POST', body: form({ access_token: config.token, media_type: 'CAROUSEL', children: children.join(','), caption }) })
  if (!body.id) throw new IgError('Instagram n’a pas rendu d’identifiant de carrousel', 502)
  return body.id
}

export type IgStatus = 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED'

export async function igContainerStatus(fetchImpl: IgFetch, config: IgConfig, containerId: string): Promise<{ status: IgStatus; detail: string }> {
  const body = await call<{ status_code?: string; status?: string }>(fetchImpl, `${IG_BASE}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(config.token)}`)
  return { status: (body.status_code as IgStatus) ?? 'IN_PROGRESS', detail: body.status ?? '' }
}

export async function igPublish(fetchImpl: IgFetch, config: IgConfig, containerId: string): Promise<string> {
  const body = await call<{ id?: string }>(fetchImpl, `${IG_BASE}/${config.accountId}/media_publish`, { method: 'POST', body: form({ access_token: config.token, creation_id: containerId }) })
  if (!body.id) throw new IgError('Instagram n’a pas rendu d’identifiant de publication', 502)
  return body.id
}

export async function igPermalink(fetchImpl: IgFetch, config: IgConfig, mediaId: string): Promise<string | null> {
  try {
    const body = await call<{ permalink?: string }>(fetchImpl, `${IG_BASE}/${mediaId}?fields=id,permalink&access_token=${encodeURIComponent(config.token)}`)
    return body.permalink ?? null
  } catch { return null }
}

/** The first comment under the post: the source's link, in clear. */
export async function igComment(fetchImpl: IgFetch, config: IgConfig, mediaId: string, message: string): Promise<boolean> {
  try {
    await call(fetchImpl, `${IG_BASE}/${mediaId}/comments`, { method: 'POST', body: form({ access_token: config.token, message }) })
    return true
  } catch { return false }
}
