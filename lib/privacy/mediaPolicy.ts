/** Provider policy, independent of advertising consent. No network request here. */
export type ExternalPlayer = 'youtube' | 'dailymotion' | 'other'

export type MediaAccessInput = {
  player: ExternalPlayer
  source: string
  mediaConsent: boolean
  standardDailymotion: boolean
  standardPlaybackEnabled: boolean
  browserChecked: boolean
  hasTcfApi: boolean
}

/** Accept only inputs that the audited adapter rebuilds as a standard Dailymotion iframe. */
export function isStandardDailymotionSource(source: string): boolean {
  try {
    const url = new URL(source)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
    if (url.hostname === 'dai.ly') return /^\/[a-zA-Z0-9]+\/?$/.test(url.pathname)
    if (!['dailymotion.com', 'www.dailymotion.com'].includes(url.hostname)) return false
    return /^\/(?:embed\/)?video\/[a-zA-Z0-9]+(?:_[^/]*)?\/?$/.test(url.pathname)
  } catch {
    return false
  }
}

export function canLoadExternalPlayer(input: MediaAccessInput): boolean {
  if (input.mediaConsent) return true
  return (
    input.player === 'dailymotion' &&
    input.standardDailymotion &&
    input.standardPlaybackEnabled &&
    input.browserChecked &&
    !input.hasTcfApi &&
    isStandardDailymotionSource(input.source)
  )
}

/** Mirrors the RandomExperience dispatcher; never trust a Dailymotion label alone. */
export function randomPlayerKind(item: {
  url: string
  provider?: string | null
}): ExternalPlayer | null {
  const provider = (item.provider || '').toLowerCase()
  if (provider.includes('youtube') || /youtu\.?be/.test(item.url)) return 'youtube'
  if (provider.includes('dailymotion') || /dailymotion\.com|dai\.ly/.test(item.url)) {
    return 'dailymotion'
  }
  return null
}
