export type Encourage3DFinish = 'color' | 'silver' | 'gold'
export type Encourage3DAnimation = 'burst' | 'rise' | 'swing' | 'orbit' | 'impact'

export type Encourage3DAsset = {
  id: string
  src: string
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
}

export type Encourage3DScheduleState = {
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
    rank: 1,
    points: 1,
  },
  {
    id: 'cup',
    src: '/encourage/runtime/default/main/cup__main__r2__p1.glb',
    rank: 2,
    points: 1,
  },
  {
    id: 'diamond',
    src: '/encourage/runtime/default/main/diamond__main__r2__p2.glb',
    rank: 2,
    points: 2,
  },
  {
    id: 'crown',
    src: '/encourage/runtime/default/main/crown__main__r5__p4.glb',
    rank: 5,
    points: 4,
  },
]

const COMPANIONS: Encourage3DCompanion[] = [
  {
    id: 'sparkle',
    src: '/encourage/runtime/default/companions/sparkle__companion__r1__p1__solo-attach__multi-4.glb',
    rank: 1,
    points: 1,
    maxInstances: 4,
  },
  {
    id: 'star',
    src: '/encourage/runtime/default/companions/star__companion__r1__p1__solo-attach__multi-4.glb',
    rank: 1,
    points: 1,
    maxInstances: 4,
  },
]

const ANIMATIONS: Encourage3DAnimation[] = ['burst', 'rise', 'swing', 'orbit', 'impact']
const MAX_PRODUCTION_APPEARANCES = 2
const DEFAULT_MESSAGE = 'Keep exploring'

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
  return random() < 0.5 ? COMPANIONS : [...COMPANIONS].reverse()
}

function unlockedRank(draws: number, score: number): number {
  if (draws >= 140 || score >= 180) return 5
  if (draws >= 70 || score >= 80) return 3
  if (draws >= 16 || score >= 20) return 2
  return 1
}

function productionFinish(draws: number, score: number, random: () => number): Encourage3DFinish {
  const roll = random()
  if ((draws >= 120 || score >= 150) && roll < 0.006) return 'gold'
  if ((draws >= 42 || score >= 45) && roll < 0.06) return 'silver'
  return 'color'
}

function pickProductionMain(
  context: ProductionContext,
  finish: Encourage3DFinish,
  random: () => number,
): Encourage3DAsset {
  const rank = unlockedRank(context.draws, context.score)
  let eligible = MAIN_ASSETS.filter((asset) => asset.rank <= rank)

  // Even after rank five unlocks, the crown only appears as exceptional gold.
  if (finish !== 'gold' || random() >= 0.08) {
    eligible = eligible.filter((asset) => asset.id !== 'crown')
  }
  const alternatives = eligible.filter((asset) => asset.id !== context.previousMainId)
  return pick(alternatives.length ? alternatives : eligible, random)
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
  const testRank = step >= 23 ? 5 : step >= 8 ? 3 : step >= 3 ? 2 : 1
  const companionOnly = sequence > 0 && sequence % 6 === 0
  const eligible = MAIN_ASSETS.filter((asset) => asset.rank <= testRank)
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
  }
}

export function createProductionEncourage3DEvent(
  context: ProductionContext,
  random: () => number = Math.random,
): Encourage3DEvent {
  const companionOnly = random() < 0.22
  const finish = companionOnly ? 'color' : productionFinish(context.draws, context.score, random)
  const main = companionOnly ? null : pickProductionMain(context, finish, random)
  const companions = shuffledCompanions(random)
  const companionCount = companionOnly ? randomInt(3, 5, random) : randomInt(1, 3, random)

  return {
    id: `encourage-3d-${Date.now()}-${context.draws}`,
    main,
    companions,
    companionCount,
    finish,
    animation: pick(ANIMATIONS, random),
    message: pickMessage(context.messages, random),
    points: eventPoints(main, companions, companionCount, finish),
  }
}

export function createEncourage3DSchedule(
  now: number,
  draws: number,
  random: () => number = Math.random,
): Encourage3DScheduleState {
  return {
    startedAt: now,
    actions: draws,
    lastShownAt: 0,
    lastShownDraw: draws,
    nextEligibleAt: now + randomInt(120, 300, random) * 1000,
    nextEligibleDraw: draws + randomInt(15, 28, random),
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
  return {
    startedAt: candidate.startedAt as number,
    actions: Math.max(0, Math.round(candidate.actions as number)),
    lastShownAt: candidate.lastShownAt as number,
    lastShownDraw: Math.max(0, Math.round(candidate.lastShownDraw as number)),
    nextEligibleAt: candidate.nextEligibleAt as number,
    nextEligibleDraw: Math.max(0, Math.round(candidate.nextEligibleDraw as number)),
    shown: Math.max(0, Math.min(MAX_PRODUCTION_APPEARANCES, Math.round(candidate.shown as number))),
  }
}

export function advanceProductionEncourage3DSchedule(
  current: Encourage3DScheduleState,
  context: ScheduleContext,
  random: () => number = Math.random,
): { state: Encourage3DScheduleState; event: Encourage3DEvent | null } {
  const updated = {
    ...current,
    actions: Math.max(current.actions, context.draws),
  }
  if (
    current.shown >= MAX_PRODUCTION_APPEARANCES
    || context.draws < current.nextEligibleDraw
    || context.now < current.nextEligibleAt
  ) {
    return { state: updated, event: null }
  }

  const eligibleDraws = Math.max(0, context.draws - current.nextEligibleDraw)
  const activeMinutes = Math.max(0, (context.now - current.startedAt) / 60_000)
  const scoreSignal = Math.min(0.025, Math.max(0, context.score) / 5000)
  const probability = Math.min(
    0.18,
    0.04 + Math.min(0.085, eligibleDraws * 0.008) + Math.min(0.03, activeMinutes * 0.003) + scoreSignal,
  )

  if (random() >= probability) return { state: updated, event: null }

  const shown = current.shown + 1
  const event = createProductionEncourage3DEvent(context, random)
  return {
    event,
    state: {
      ...updated,
      lastShownAt: context.now,
      lastShownDraw: context.draws,
      nextEligibleAt: context.now + randomInt(300, 600, random) * 1000,
      nextEligibleDraw: context.draws + randomInt(29 + shown * 3, 50 + shown * 8, random),
      shown,
    },
  }
}
