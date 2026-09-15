import type { QuotaConfig } from './exploration'

/** Same day/window on GitHub and Vercel, including US daylight-saving changes. */
export function youtubeQuotaWindow(now: number) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const value = (type: string) => parts.find(p => p.type === type)!.value
  return { day: `${value('year')}-${value('month')}-${value('day')}`, afternoon: Number(value('hour')) >= 12 }
}

/** Cumulative envelopes, not a fresh allocation on each run/retry. No quota refund. */
export function youtubeBudget(config: QuotaConfig, bucket: 'search' | 'other', now: number, discovery: boolean) {
  const daily = bucket === 'search' ? config.searchDailyLimit : config.otherDailyLimit
  const reserve = bucket === 'search' ? config.searchBaseReserve : config.otherBaseReserve
  const extra = bucket === 'search' ? Math.min(daily - reserve, config.extraSearchLimit) : daily - reserve
  const base = discovery ? daily - extra : daily
  const window = youtubeQuotaWindow(now)
  const release = (limit: number) => config.pacing && !window.afternoon ? Math.floor(limit / 2) : limit
  // Retro has its own search envelope. Trends need only a few videos.list calls.
  const protectedDaily = !config.pacing ? 0 : bucket === 'search' ? Math.floor(base * .2) : Math.min(8, base)
  return { day: window.day, stage: config.pacing && !window.afternoon ? 'first-half' : 'full-day',
    daily, released: release(daily), base: release(base), extra: release(extra),
    editorial: release(extra > 0 ? Math.max(1, Math.floor(extra * .5)) : 0),
    protectedCounter: bucket === 'search' ? 'retro' as const : 'trends' as const,
    protectedReleased: release(protectedDaily) }
}
