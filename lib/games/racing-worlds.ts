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
/** How each world's roads go: more hills and hairpins in the mountains, long straights and sweepers in the desert, flat streets in the city. */
export const WORLD_ROADS: Record<RacingWorld, { hills: number; straights: number; hairpins: number; sweepers: number }> = {
  coast: { hills: 1, straights: 1, hairpins: 1, sweepers: 1 },
  mountain: { hills: 1.6, straights: 0.6, hairpins: 1.8, sweepers: 0.8 },
  desert: { hills: 0.8, straights: 1.7, hairpins: 0.5, sweepers: 1.6 },
  city: { hills: 0.3, straights: 1.5, hairpins: 0.7, sweepers: 0.7 },
}

/**
 * Each level's character, so that no two levels running drive or look the
 * same: flowing sweepers to begin with; a sprint of long straights broken
 * by sharp bends; hills and blind crests; twisty S bends and chicanes; a
 * long run through the rock; hairpins; at the last level, all of it.
 */
export type RacingCharacter = 'flowing' | 'sprint' | 'hills' | 'twisty' | 'tunnel' | 'hairpins' | 'all'
export const RACING_CHARACTERS: readonly RacingCharacter[] = ['flowing', 'sprint', 'hills', 'twisty', 'tunnel', 'hairpins', 'sprint', 'hills', 'twisty', 'tunnel', 'hairpins', 'hills', 'sprint', 'twisty', 'hairpins', 'all']
/** How much more (or less) often each shape of road comes in a level of each character; a shape weighed 3 or more comes from that level on, whatever the level. */
export const CHARACTER_SHAPES: Record<RacingCharacter, Partial<Record<'straight' | 'sweeper' | 's' | 'chicane' | 'hairpin' | 'crest' | 'bend', number>>> = {
  flowing: { sweeper: 2.5, s: 0.5, chicane: 0, hairpin: 0, crest: 0 },
  sprint: { straight: 3.5, sweeper: 1.3, bend: 0.5, s: 0.3, chicane: 1.2, hairpin: 0.4, crest: 0.5 },
  hills: { crest: 4, straight: 1.4, sweeper: 1.2, bend: 0.7, s: 0.6, chicane: 0.4, hairpin: 0.4 },
  twisty: { s: 3.5, chicane: 3, bend: 1.4, straight: 0.3, sweeper: 0.5, crest: 0.6 },
  tunnel: {},
  hairpins: { hairpin: 4, bend: 1.6, s: 1.2, straight: 0.4, sweeper: 0.5 },
  all: {},
}
/** The kind of road each character of level shows most of, in each world: where it starts, where the road comes back to most. */
export const FEATURED_ZONE: Record<RacingWorld, Record<RacingCharacter, RacingZone>> = {
  coast: { flowing: 'beach', sprint: 'causeway', hills: 'beach', twisty: 'promenade', tunnel: 'cliff', hairpins: 'cliff', all: 'beach' },
  mountain: { flowing: 'forest', sprint: 'lake', hills: 'forest', twisty: 'village', tunnel: 'gorge', hairpins: 'gorge', all: 'forest' },
  desert: { flowing: 'dunes', sprint: 'dunes', hills: 'mesa', twisty: 'canyon', tunnel: 'mesa', hairpins: 'canyon', all: 'dunes' },
  city: { flowing: 'avenue', sprint: 'bridge', hills: 'park', twisty: 'downtown', tunnel: 'downtown', hairpins: 'downtown', all: 'avenue' },
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
