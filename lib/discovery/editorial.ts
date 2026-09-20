import type { Candidate, Profile } from './types'
import { relation } from './waves'

export type OwnerReference = { contentKey: string; ownerId: string; active: boolean;
  familyId: string; profile: Profile; type: 'video' | 'image'; version: number; itemId?: string;
  publicLikeCounted?: boolean; updatedAt?: Date; rand?: number;
  explorationScheduledAt?: Date; explorationRotation?: Partial<Record<'youtube' | 'dailymotion', number>>;
  explorationState?: 'scheduled' | 'needs-metadata' | 'needs-subject' | 'waiting' | 'done'; profileRefreshedAt?: Date;
  /** The like plan: which turn comes next, which tasks the last turn created, and why it stopped. */
  explorationPlanTurn?: number; explorationLastTaskIds?: string[]; explorationLastLabel?: string;
  explorationDone?: 'exhausted' | 'dry'; explorationDoneAt?: Date }
/** Offline assignment. References are explicitly owner-scoped and only original likes are seeds. */
export function assignEditorial<T>(items: Candidate<T>[], references: OwnerReference[], ownerId: string) {
  if (!ownerId) throw new Error('Owner identity required')
  const active = references.filter(r => r.ownerId === ownerId && r.active)
  const counts: Record<string, number> = {}
  for (const r of active) counts[r.familyId] = (counts[r.familyId] ?? 0) + 1
  const candidates = items.map(item => {
    if (item.type !== 'video' && item.type !== 'image' || item.stock) return { ...item, editorialFamilies: [], directEditorialReference: false }
    // Direct likes remain valid. Inferred neighbours require trustworthy, specific evidence.
    const related = active.filter(r => r.contentKey === item.key ||
      (r.profile.metadataQuality !== 'unverified' && item.profile.metadataQuality !== 'unverified' &&
        (relation(r.profile, item.profile)?.score ?? 0) >= .87))
    return { ...item, editorialFamilies: [...new Set(related.map(r => r.familyId))],
      directEditorialReference: active.some(r => r.contentKey === item.key) }
  })
  return { candidates, referenceCounts: counts }
}
