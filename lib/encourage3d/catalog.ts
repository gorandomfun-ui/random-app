export type Encourage3DFinish = 'color' | 'silver' | 'gold'
export type Encourage3DAnimation = 'burst' | 'rise' | 'swing' | 'orbit' | 'impact'
export type Encourage3DAssetKind = 'model' | 'image'

export type Encourage3DAsset = {
  id: string
  src: string
  kind: Encourage3DAssetKind
  rank: number
  points: number
}

export type Encourage3DCompanion = Encourage3DAsset & {
  maxInstances: number
}

export type Encourage3DEvent = {
  id: string
  main: Encourage3DAsset | null
  companions: Encourage3DCompanion[]
  companionCount: number
  finish: Encourage3DFinish
  animation: Encourage3DAnimation
  message: string
  points: number
  intensity: number
}

export type Encourage3DScheduleState = {
  version: 2
  startedAt: number
  actions: number
  lastShownAt: number
  lastShownDraw: number
  nextEligibleAt: number
  nextEligibleDraw: number
  shown: number
}

type ProductionContext = {
  draws: number
  score: number
  messages: readonly string[]
  previousMainId?: string | null
}

type ScheduleContext = ProductionContext & {
  now: number
}

const MAIN_ASSETS: Encourage3DAsset[] = [
  {
    id: 'rocket',
    src: '/encourage/runtime/default/main/rocket__main__r1__p1.glb',
    kind: 'model',
    rank: 1,
    points: 1,
  },
  {
    id: 'cup',
    src: '/encourage/runtime/default/main/cup__main__r2__p1.glb',
    kind: 'model',
    rank: 2,
    points: 1,
  },
  {
    id: 'diamond',
    src: '/encourage/runtime/default/main/diamond__main__r2__p2.glb',
    kind: 'model',
    rank: 2,
    points: 2,
  },
  {
    id: 'crown',
    src: '/encourage/runtime/default/main/crown__main__r5__p4.glb',
    kind: 'model',
    rank: 5,
    points: 4,
  },
  { id: 'dice', src: '/encourage/glossy/3.webp', kind: 'image', rank: 1, points: 1 },
  { id: 'burst', src: '/encourage/glossy/6.webp', kind: 'image', rank: 3, points: 2 },
  { id: 'ladder', src: '/encourage/glossy/7.webp', kind: 'image', rank: 1, points: 1 },
  { id: 'lightning', src: '/encourage/glossy/8.webp', kind: 'image', rank: 1, points: 1 },
  { id: 'compass', src: '/encourage/glossy/9.webp', kind: 'image', rank: 2, points: 2 },
  { id: 'magnifier', src: '/encourage/glossy/10.webp', kind: 'image', rank: 1, points: 1 },
  { id: 'flashlight', src: '/encourage/glossy/11.webp', kind: 'image', rank: 1, points: 1 },
  { id: 'pickaxe', src: '/encourage/glossy/12.webp', kind: 'image', rank: 3, points: 2 },
  { id: 'camera', src: '/encourage/glossy/13.webp', kind: 'image', rank: 2, points: 2 },
  { id: 'key', src: '/encourage/glossy/14.webp', kind: 'image', rank: 2, points: 2 },
  { id: 'cards', src: '/encourage/glossy/15.webp', kind: 'image', rank: 2, points: 2 },
  { id: 'coins', src: '/encourage/glossy/16.webp', kind: 'image', rank: 4, points: 3 },
  { id: 'weather', src: '/encourage/glossy/17.webp', kind: 'image', rank: 1, points: 1 },
  { id: 'prismatic-lightning', src: '/encourage/glossy/18.webp', kind: 'image', rank: 3, points: 2 },
  { id: 'spiral', src: '/encourage/glossy/19.webp', kind: 'image', rank: 3, points: 2 },
  { id: 'door', src: '/encourage/glossy/20.webp', kind: 'image', rank: 2, points: 2 },
  { id: 'shooting-star-a', src: '/encourage/glossy/21.webp', kind: 'image', rank: 1, points: 1 },
  { id: 'shooting-star-b', src: '/encourage/glossy/22.webp', kind: 'image', rank: 1, points: 1 },
  { id: 'globe', src: '/encourage/glossy/23.webp', kind: 'image', rank: 2, points: 2 },
  { id: 'smile', src: '/encourage/glossy/24.webp', kind: 'image', rank: 1, points: 1 },
  { id: 'shuffle', src: '/encourage/glossy/25.webp', kind: 'image', rank: 1, points: 1 },
  { id: 'star-platform', src: '/encourage/glossy/26.webp', kind: 'image', rank: 4, points: 3 },
  { id: 'unicorn', src: '/encourage/glossy/27.webp', kind: 'image', rank: 2, points: 2 },
  { id: 'star-cluster', src: '/encourage/glossy/28.webp', kind: 'image', rank: 1, points: 1 },
]

const COMPANIONS: Encourage3DCompanion[] = [
  {
    id: 'sparkle',
    src: '/encourage/runtime/default/companions/sparkle__companion__r1__p1__solo-attach__multi-4.glb',
    kind: 'model',
    rank: 1,
    points: 1,
    maxInstances: 4,
  },
  {
    id: 'star',
    src: '/encourage/runtime/default/companions/star__companion__r1__p1__solo-attach__multi-4.glb',
    kind: 'model',
    rank: 1,
    points: 1,
    maxInstances: 4,
  },
  {
    id: 'flash',
    src: '/encourage/runtime/default/companions/flash__companion__r1__p1__solo-attach__multi-4.glb',
    kind: 'model',
    rank: 1,
    points: 1,
    maxInstances: 4,
  },
  {
    id: 'shine',
    src: '/encourage/runtime/default/companions/shine__companion__r1__p1__solo-attach__multi-1.glb',
    kind: 'model',
    rank: 1,
    points: 1,
    maxInstances: 1,
  },
]

const ANIMATIONS: Encourage3DAnimation[] = ['burst', 'rise', 'swing', 'orbit', 'impact']
const DEFAULT_MESSAGE = 'Keep exploring'
const ENCOURAGEMENT_INTERVAL = 20
const PRELOAD_LEAD_DRAWS = 8
const WINDOW_RADIUS = 4
const WINDOW_FORCE_AFTER = 10

function randomInt(min: number, max: number, random: () => number): number {
  return Math.floor(random() * (max - min + 1)) + min
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))]
}

function pickMessage(messages: readonly string[], random: () => number): string {
  return messages.length ? pick(messages, random) : DEFAULT_MESSAGE
}

function shuffledCompanions(random: () => number): Encourage3DCompanion[] {
  const companions = [...COMPANIONS]
  for (let index = companions.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = companions[index]
    companions[index] = companions[swapIndex]
    companions[swapIndex] = current
  }
  return companions
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function unlockedRank(draws: number, score: number): number {
  if (draws >= 360 || score >= 440) return 5
  if (draws >= 240 || score >= 290) return 4
  if (draws >= 120 || score >= 145) return 3
  if (draws >= 40 || score >= 48) return 2
  return 1
}

function productionFinish(draws: number, score: number, random: () => number): Encourage3DFinish {
  const roll = random()
  const progress = clamp01(Math.max(draws / 500, score / 620))
  const goldChance = draws >= 320 || score >= 390 ? 0.012 + progress * 0.045 : 0
  const silverChance = draws >= 80 || score >= 95 ? 0.055 + progress * 0.125 : 0
  if (roll < goldChance) return 'gold'
  if (roll < goldChance + silverChance) return 'silver'
  return 'color'
}

function pickProductionMain(
  context: ProductionContext,
  finish: Encourage3DFinish,
  random: () => number,
): Encourage3DAsset {
  const rank = unlockedRank(context.draws, context.score)
  let eligible = MAIN_ASSETS.filter((asset) => asset.kind === 'model' && asset.rank <= rank)

  // The crown remains an exceptional late-progression reward.
  if (finish === 'gold' && rank >= 5 && random() < 0.38) {
    return MAIN_ASSETS.find((asset) => asset.id === 'crown') as Encourage3DAsset
  }
  if (finish !== 'gold' || rank < 5) {
    eligible = eligible.filter((asset) => asset.id !== 'crown')
  }
  const alternatives = eligible.filter((asset) => asset.id !== context.previousMainId)
  eligible = alternatives.length ? alternatives : eligible
  const advancedPool = eligible.filter((asset) => asset.rank >= Math.max(1, rank - 1))
  const progress = clamp01(context.draws / 500)
  if (advancedPool.length && random() < 0.3 + progress * 0.3) {
    return pick(advancedPool, random)
  }
  return pick(eligible, random)
}

function eventPoints(
  main: Encourage3DAsset | null,
  companions: Encourage3DCompanion[],
  companionCount: number,
  finish: Encourage3DFinish,
): number {
  const companionPoints = Array.from({ length: companionCount }).reduce<number>(
    (total, _, index) => total + companions[index % companions.length].points,
    0,
  )
  const multiplier = finish === 'gold' ? 3 : finish === 'silver' ? 2 : 1
  return ((main?.points ?? 0) + companionPoints) * multiplier
}

export function createTestEncourage3DEvent(
  step: number,
  sequence: number,
  messages: readonly string[],
  previousMainId?: string | null,
): Encourage3DEvent {
  const testRank = step >= 23 ? 5 : step >= 16 ? 4 : step >= 8 ? 3 : step >= 3 ? 2 : 1
  const companionOnly = sequence > 0 && sequence % 6 === 0
  const eligible = MAIN_ASSETS.filter((asset) => asset.kind === 'model' && asset.rank <= testRank)
  let main = companionOnly ? null : eligible[sequence % eligible.length]

  if (main && eligible.length > 1 && main.id === previousMainId) {
    main = eligible[(sequence + 1) % eligible.length]
  }

  const companionCount = companionOnly
    ? 3 + (Math.floor(sequence / 6) % 3)
    : Math.min(3, 1 + (sequence % 3))
  const companions = sequence % 2 === 0 ? COMPANIONS : [...COMPANIONS].reverse()
  const finish: Encourage3DFinish = sequence > 0 && sequence % 31 === 0
    ? 'gold'
    : sequence > 0 && sequence % 13 === 0
      ? 'silver'
      : 'color'
  const appliedFinish = main ? finish : 'color'

  return {
    id: `encourage-3d-test-${Date.now()}-${sequence}`,
    main,
    companions,
    companionCount,
    finish: appliedFinish,
    animation: ANIMATIONS[sequence % ANIMATIONS.length],
    message: messages.length ? messages[sequence % messages.length] : DEFAULT_MESSAGE,
    points: eventPoints(main, companions, companionCount, appliedFinish),
    intensity: clamp01(step / 25),
  }
}

export function createProductionEncourage3DEvent(
  context: ProductionContext,
  random: () => number = Math.random,
): Encourage3DEvent {
  const companionOnly = random() < 0.18
  const finish = companionOnly ? 'color' : productionFinish(context.draws, context.score, random)
  const main = companionOnly ? null : pickProductionMain(context, finish, random)
  const companions = shuffledCompanions(random)
  const companionCount = companionOnly ? randomInt(2, 4, random) : pick([1, 2, 2, 3, 3, 4], random)

  return {
    id: `encourage-3d-${Date.now()}-${context.draws}`,
    main,
    companions,
    companionCount,
    finish,
    animation: pick(ANIMATIONS, random),
    message: pickMessage(context.messages, random),
    points: eventPoints(main, companions, companionCount, finish),
    intensity: clamp01(Math.max(context.draws / 500, context.score / 620)),
  }
}

function nextWindowStart(draws: number, random: () => number): number {
  const nextMilestone = (Math.floor(draws / ENCOURAGEMENT_INTERVAL) + 1) * ENCOURAGEMENT_INTERVAL
  let target = nextMilestone + randomInt(-3, 3, random)
  if (target < draws + PRELOAD_LEAD_DRAWS) target += ENCOURAGEMENT_INTERVAL
  return Math.max(draws + 1, target - WINDOW_RADIUS)
}

export function createEncourage3DSchedule(
  now: number,
  draws: number,
  random: () => number = Math.random,
): Encourage3DScheduleState {
  return {
    version: 2,
    startedAt: now,
    actions: draws,
    lastShownAt: 0,
    lastShownDraw: draws,
    nextEligibleAt: 0,
    nextEligibleDraw: nextWindowStart(draws, random),
    shown: 0,
  }
}

export function parseEncourage3DSchedule(value: unknown): Encourage3DScheduleState | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<Encourage3DScheduleState>
  const numbers = [
    candidate.startedAt,
    candidate.actions,
    candidate.lastShownAt,
    candidate.lastShownDraw,
    candidate.nextEligibleAt,
    candidate.nextEligibleDraw,
    candidate.shown,
  ]
  if (!numbers.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) return null
  const actions = Math.max(0, Math.round(candidate.actions as number))
  const isCurrentVersion = candidate.version === 2
  return {
    version: 2,
    startedAt: candidate.startedAt as number,
    actions,
    lastShownAt: candidate.lastShownAt as number,
    lastShownDraw: Math.max(0, Math.round(candidate.lastShownDraw as number)),
    nextEligibleAt: 0,
    nextEligibleDraw: isCurrentVersion
      ? Math.max(0, Math.round(candidate.nextEligibleDraw as number))
      : nextWindowStart(actions, () => 0.5),
    shown: Math.max(0, Math.round(candidate.shown as number)),
  }
}

export function shouldPreloadProductionEncourage3D(
  schedule: Encourage3DScheduleState,
  draws: number,
): boolean {
  return draws >= schedule.nextEligibleDraw - PRELOAD_LEAD_DRAWS
}

export function advanceProductionEncourage3DSchedule(
  current: Encourage3DScheduleState,
  context: ScheduleContext,
  random: () => number = Math.random,
  preparedEvent: Encourage3DEvent | null = null,
): { state: Encourage3DScheduleState; event: Encourage3DEvent | null } {
  const updated = {
    ...current,
    actions: Math.max(current.actions, context.draws),
  }
  if (
    context.draws < current.nextEligibleDraw
  ) {
    return { state: updated, event: null }
  }

  const eligibleDraws = Math.max(0, context.draws - current.nextEligibleDraw)
  const probabilities = [0.03, 0.05, 0.08, 0.12, 0.18, 0.25, 0.35, 0.5, 0.65, 0.82]
  const probability = eligibleDraws >= WINDOW_FORCE_AFTER
    ? 1
    : probabilities[Math.min(probabilities.length - 1, eligibleDraws)]

  if (random() >= probability) return { state: updated, event: null }

  const shown = current.shown + 1
  const event = preparedEvent ?? createProductionEncourage3DEvent(context, random)
  return {
    event,
    state: {
      ...updated,
      version: 2,
      lastShownAt: context.now,
      lastShownDraw: context.draws,
      nextEligibleAt: 0,
      nextEligibleDraw: nextWindowStart(context.draws, random),
      shown,
    },
  }
}
