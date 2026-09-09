export function youtubeMuted(muted: unknown, volume: unknown): boolean | null {
  if (
    typeof muted !== 'boolean' ||
    typeof volume !== 'number' ||
    !Number.isFinite(volume)
  ) {
    return null
  }
  return muted || volume <= 0
}

export function safeMediaUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined
  } catch {
    return undefined
  }
}

export function providerVideo(
  value: string,
): { provider: 'youtube' | 'dailymotion'; id: string } | null {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    let id: string | null | undefined

    if (host === 'youtu.be') {
      id = url.pathname.split('/')[1]
    } else if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)) {
      id =
        url.searchParams.get('v') ||
        (/^\/(embed|shorts|live)\//.test(url.pathname)
          ? url.pathname.split('/')[2]
          : null)
    }
    if (id && /^[\w-]{11}$/.test(id)) return { provider: 'youtube', id }

    if (['dailymotion.com', 'geo.dailymotion.com', 'dai.ly'].includes(host)) {
      id =
        host === 'dai.ly'
          ? url.pathname.split('/')[1]
          : url.searchParams.get('video') ||
            url.pathname.match(/\/video\/([a-zA-Z0-9]+)/)?.[1]
      if (id && /^[a-zA-Z0-9]+$/.test(id)) return { provider: 'dailymotion', id }
    }
  } catch {
    // Unsupported URL.
  }
  return null
}
