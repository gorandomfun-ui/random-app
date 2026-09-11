/** Small, deterministic run policy. Counts refer to INSERTS, never candidates or enrichment. */
export function integerSetting(value, fallback, min, max) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback
}

export function videoRunPolicy(env = process.env) {
  const multiplier = integerSetting(env.DAILY_AUTO_VIDEO_MULTIPLIER, 2, 1, 3)
  const baseline = integerSetting(env.DAILY_AUTO_MIN_VIDEO_INSERTED, 1200, 0, 5000)
  const oldChunks = integerSetting(env.DAILY_AUTO_MAX_VIDEO_CHUNKS, 40, 1, 120)
  const legacyMinutes = integerSetting(env.DAILY_AUTO_MAX_RUNTIME_MINUTES, 150, 1, 330)
  const ceilingMinutes = integerSetting(env.DAILY_AUTO_RUNTIME_CEILING_MINUTES, 30, 5, 60)
  return {
    multiplier, baseline, target: baseline * multiplier,
    maxChunks: Math.min(120, oldChunks * multiplier),
    maxRuntimeMs: Math.min(legacyMinutes, ceilingMinutes) * 60000,
    per: multiplier > 1 ? 50 : 22,
  }
}

export function runStopReason({ inserted, target, chunks, maxChunks, elapsed, maxRuntimeMs, emptyStreak }) {
  if (inserted >= target) return 'target-reached'
  if (elapsed >= maxRuntimeMs) return 'time-budget'
  if (chunks >= maxChunks) return 'chunk-budget'
  if (emptyStreak >= 8) return 'sources-exhausted'
  return null
}
