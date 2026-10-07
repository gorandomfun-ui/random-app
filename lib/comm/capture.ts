/**
 * The capture mode: the player alone on the screen, without its controls,
 * started at the chosen second, covered for the first seconds while the
 * player's own title and logo fade, then filmed. Pure helpers here; the page
 * drives the browser.
 */

import { providerVideo } from '@/lib/players/state'
import { DAILYMOTION_PLAYERS } from '@/lib/players/dailymotionPlayer'

/** "1:23", "83", "1:02:03" → seconds; nothing readable → 0. */
export function parseStartSeconds(value: string): number {
  const trimmed = value.trim()
  if (!trimmed) return 0
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  const parts = trimmed.split(':').map((part) => Number(part))
  if (parts.some((part) => !Number.isInteger(part) || part < 0) || parts.length > 3) return 0
  return parts.reduce((total, part) => total * 60 + part, 0)
}

export function formatSeconds(total: number): string {
  const seconds = Math.max(0, Math.floor(total))
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

export type CaptureEmbed = { provider: 'youtube' | 'dailymotion'; src: string } | null

/**
 * The player address for the capture: autoplay with sound, no controls, no
 * subtitles, no keyboard, no related videos, at the chosen second.
 */
export function captureEmbedUrl(url: string, provider: string, startSec: number, origin: string): CaptureEmbed {
  const found = providerVideo(url) ?? (provider.toLowerCase().includes('youtube') ? null : null)
  if (!found) return null
  const start = Math.max(0, Math.floor(startSec))
  if (found.provider === 'youtube') {
    const params = new URLSearchParams({ autoplay: '1', mute: '0', controls: '0', rel: '0', playsinline: '1', modestbranding: '1', iv_load_policy: '3', cc_load_policy: '0', disablekb: '1', fs: '0', enablejsapi: '1', start: String(start) })
    if (origin) params.set('origin', origin)
    return { provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(found.id)}?${params.toString()}` }
  }
  const params = new URLSearchParams({ video: found.id, autoplay: 'true', startTime: String(start) })
  return { provider: 'dailymotion', src: `https://geo.dailymotion.com/player/${DAILYMOTION_PLAYERS.sound}.html?${params.toString()}` }
}

/** The recorder format the browser offers, mp4 first (no conversion later), else WebM. */
export function pickRecorderType(isSupported: (type: string) => boolean): string | null {
  for (const type of ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) {
    if (isSupported(type)) return type
  }
  return null
}

/** How long the cover stays: the time the player needs to hide its own title and buttons. */
export const COVER_SECONDS: Record<'youtube' | 'dailymotion', number> = { youtube: 4, dailymotion: 4 }
