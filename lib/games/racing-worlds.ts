/**
 * RANDOM RACING's four worlds, as the rules see them: the coast at sunset,
 * the mountains, the desert, the city at night. Each has its kinds of road,
 * its shops, its traffic, its hours; a game draws their order at random —
 * the four in every four levels, shuffled, never the same twice running.
 */

import { seeded } from './engine'

export type RacingWorld = 'coast' | 'mountain' | 'desert' | 'city'
export const RACING_WORLDS: readonly RacingWorld[] = ['coast', 'mountain', 'desert', 'city']

/**
 * The world of each of the sixteen levels for a game (`seed`): four rounds
 * of the four worlds, each round shuffled, the first of a round never the
 * last of the one before.
 */
export function racingWorldOrder(seed: number): RacingWorld[] {
  const rnd = seeded(seed * 2654435761 + 97)
  const out: RacingWorld[] = []
  for (let round = 0; round < 4; round += 1) {
    const four = RACING_WORLDS.slice()
    for (let k = four.length - 1; k > 0; k -= 1) { const j = Math.floor(rnd() * (k + 1)); [four[k], four[j]] = [four[j], four[k]] }
    if (out.length && four[0] === out[out.length - 1]) [four[0], four[3]] = [four[3], four[0]]
    out.push(...four)
  }
  return out
}

/** The kinds of road of each world: the first one is where a level starts and ends. */
export const WORLD_ZONES = {
  coast: ['beach', 'promenade', 'causeway', 'cliff', 'tunnel'],
  mountain: ['forest', 'village', 'lake', 'gorge', 'tunnel'],
  desert: ['dunes', 'town', 'canyon', 'mesa', 'tunnel'],
  city: ['avenue', 'downtown', 'park', 'bridge', 'tunnel'],
} as const
export type RacingZone = (typeof WORLD_ZONES)[RacingWorld][number]
/** The kind of road the start and the finish line are on: where the public and the shops are. */
export const FINISH_ZONE: Record<RacingWorld, RacingZone> = { coast: 'promenade', mountain: 'village', desert: 'town', city: 'avenue' }
/** Where shops line the road: on the land's side, or on both sides (the city's streets). */
export const SHOP_ZONES: Partial<Record<RacingZone, 'right' | 'both'>> = { promenade: 'right', village: 'both', town: 'right', avenue: 'both', downtown: 'both' }
/** The kind of road a tunnel goes out of and back into, for each world. */
export const TUNNEL_FROM: Record<RacingWorld, RacingZone> = { coast: 'cliff', mountain: 'gorge', desert: 'mesa', city: 'downtown' }
/** Kinds of road with a wall of rock on the land's side (and both sides in the canyon). */
export const ROCK_ZONES: ReadonlySet<RacingZone> = new Set(['cliff', 'gorge', 'mesa', 'canyon'])
/** How each world's roads go: more hills and hairpins in the mountains, long straights and sweepers in the desert, flat streets in the city. */
export const WORLD_ROADS: Record<RacingWorld, { hills: number; straights: number; hairpins: number; sweepers: number }> = {
  coast: { hills: 1, straights: 1, hairpins: 1, sweepers: 1 },
  mountain: { hills: 1.6, straights: 0.6, hairpins: 1.8, sweepers: 0.8 },
  desert: { hills: 0.8, straights: 1.7, hairpins: 0.5, sweepers: 1.6 },
  city: { hills: 0.3, straights: 1.5, hairpins: 0.7, sweepers: 0.7 },
}

/**
 * The shops of each world, by their place in `SHOPS` (`racing-town.ts`):
 * the coast's eleven; the mountains' chalets, hotel, ski shop, cable car
 * station, cheese shop, chapel; the desert's adobe, saloon, trading post and
 * the coast's filling station, motel and diner; the city's cinema, tower,
 * club, boutique, café and the coast's hotel, burger stand and arcade.
 */
export const WORLD_SHOPS: Record<RacingWorld, readonly number[]> = {
  coast: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  mountain: [11, 12, 13, 14, 15, 16],
  desert: [17, 18, 19, 7, 4, 3],
  city: [20, 21, 22, 23, 24, 5, 2, 9],
}
/** Each shop's length along the road, in stretches: its front's width at the shops' scale. */
export const SHOP_LENGTHS: readonly number[] = [24, 26, 20, 31, 35, 26, 29, 31, 22, 25, 24, 25, 31, 22, 27, 22, 20, 24, 27, 28, 29, 25, 26, 22, 27]

/** The everyday cars of each world's traffic, the common ones more often. */
export const WORLD_TRAFFIC = {
  coast: ['hatch', 'hatch', 'saloon', 'saloon', 'camper', 'pickup', 'estate', 'estate', 'beetle', 'icecream'],
  mountain: ['estate', 'estate', 'hatch', 'hatch', 'camper', 'beetle', 'saloon', 'pickup'],
  desert: ['pickup', 'pickup', 'camper', 'camper', 'saloon', 'beetle', 'estate'],
  city: ['hatch', 'hatch', 'saloon', 'saloon', 'saloon', 'beetle', 'estate', 'icecream'],
} as const
