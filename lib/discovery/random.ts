export type Rng = () => number
export function hash(text: string): number {
  let h = 2166136261
  for (const char of text) { h ^= char.codePointAt(0) ?? 0; h = Math.imul(h, 16777619) }
  return h >>> 0
}
export function seeded(seed: number): Rng {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}
export function shuffled<T>(items: readonly T[], random: Rng): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
export function weighted<T>(items: readonly T[], weight: (item: T) => number, random: Rng): T | null {
  const weights = items.map(x => { const w = weight(x); return Number.isFinite(w) ? Math.max(0, w) : 0 })
  const sum = weights.reduce((a, b) => a + b, 0)
  if (!sum) return null
  let cursor = random() * sum
  for (let i = 0; i < items.length; i++) { cursor -= weights[i]; if (cursor < 0) return items[i] }
  return items[items.length - 1] ?? null
}
/** A reproducible shuffled bag. Restoring a session does not change its next ticket. */
export function bagValue<T>(seed: number, name: string, index: number, bag: readonly T[]): T {
  if (!bag.length || index < 0 || !Number.isSafeInteger(index)) throw new Error('Invalid bag')
  return shuffled(bag, seeded(hash(`${seed}:${name}:${Math.floor(index / bag.length)}`)))[index % bag.length]
}
