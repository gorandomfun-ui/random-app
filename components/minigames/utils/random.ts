export function createSeededRng(seed: string) {
  let value = 0
  for (let i = 0; i < seed.length; i += 1) {
    value = (value * 31 + seed.charCodeAt(i)) >>> 0
  }
  if (value === 0) value = 0x12345678
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 0xffffffff
  }
}

export function pickFrom<T>(rng: () => number, list: readonly T[]): T {
  if (!list.length) throw new Error('Cannot pick from empty list')
  const idx = Math.floor(rng() * list.length)
  return list[idx]
}
