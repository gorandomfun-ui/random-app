type ProgressInput = {
  gamesServed: number
  totalContent: number
}

export function computeMiniGameLevel({ gamesServed, totalContent }: ProgressInput): number {
  const fromGames = gamesServed + 1
  const fromContent = Math.floor(totalContent / 12)
  const combined = fromGames + fromContent
  return Math.max(1, Math.min(99, combined))
}

export function normalizeLevel(level: number, cap = 20): number {
  if (cap <= 1) return 1
  return Math.max(1, Math.min(cap, Math.floor(level)))
}

export function scaleLevel(level: number, min: number, max: number, cap = 20): number {
  if (max <= min) return min
  const normalized = normalizeLevel(level, cap)
  const ratio = (normalized - 1) / (cap - 1)
  return min + ratio * (max - min)
}

export function stepForLevel(level: number, thresholds: number[]): number {
  const normalized = Math.max(1, Math.floor(level))
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (normalized >= thresholds[i]) return i + 1
  }
  return 0
}
