import ENCOURAGEMENT_MESSAGES from '@/lib/encourage/messages'

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
  main: Encourage3DAsset
  companions: Encourage3DCompanion[]
  companionCount: number
  finish: Encourage3DFinish
  animation: Encourage3DAnimation
  message: string
  points: number
}

const TEST_MAIN_ASSETS: Encourage3DAsset[] = [
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

const TEST_COMPANIONS: Encourage3DCompanion[] = [
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

const TEST_ANIMATIONS: Encourage3DAnimation[] = ['burst', 'rise', 'swing', 'orbit', 'impact']

function unlockedRankForTestStep(step: number): number {
  if (step >= 23) return 5
  if (step >= 15) return 4
  if (step >= 8) return 3
  if (step >= 3) return 2
  return 1
}

function testFinishForSequence(sequence: number): Encourage3DFinish {
  if (sequence > 0 && sequence % 9 === 0) return 'gold'
  if (sequence > 0 && sequence % 5 === 0) return 'silver'
  return 'color'
}

export function createTestEncourage3DEvent(
  step: number,
  sequence: number,
  previousMainId?: string | null,
): Encourage3DEvent {
  const unlockedRank = unlockedRankForTestStep(step)
  const eligible = TEST_MAIN_ASSETS.filter((asset) => asset.rank <= unlockedRank)
  let main = eligible[sequence % eligible.length]

  if (eligible.length > 1 && main.id === previousMainId) {
    main = eligible[(sequence + 1) % eligible.length]
  }

  const companionCount = Math.min(3, 1 + (sequence % 3))
  const companions = sequence % 2 === 0
    ? TEST_COMPANIONS
    : [...TEST_COMPANIONS].reverse()
  const finish = testFinishForSequence(sequence)
  const multiplier = finish === 'gold' ? 3 : finish === 'silver' ? 2 : 1
  const companionPoints = Array.from({ length: companionCount }).reduce<number>(
    (total, _, index) => total + companions[index % companions.length].points,
    0,
  )

  return {
    id: `encourage-3d-${Date.now()}-${sequence}`,
    main,
    companions,
    companionCount,
    finish,
    animation: TEST_ANIMATIONS[sequence % TEST_ANIMATIONS.length],
    message: ENCOURAGEMENT_MESSAGES[sequence % ENCOURAGEMENT_MESSAGES.length],
    points: (main.points + companionPoints) * multiplier,
  }
}
