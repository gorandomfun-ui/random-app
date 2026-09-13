import type { Candidate, Profile } from './types'
import { relation } from './waves'

export type OwnerReference = { contentKey: string; ownerId: string; active: boolean;
  familyId: string; profile: Profile; type: 'video' | 'image'; version: number; itemId?: string;
  publicLikeCounted?: boolean; updatedAt?: Date; rand?: number }
/** Offline assignment. References are explicitly owner-scoped and only original likes are seeds. */
export function assignEditorial<T>(items: Candidate<T>[], references: OwnerReference[], ownerId: string) {
  if (!ownerId) throw new Error('Owner identity required')
  const active = references.filter(r => r.ownerId === ownerId && r.active)
  const counts: Record<string, number> = {}
  for (const r of active) counts[r.familyId] = (counts[r.familyId] ?? 0) + 1
  const candidates = items.map(item => {
    if (item.type !== 'video' && item.type !== 'image' || item.stock) return { ...item, editorialFamilies: [], directEditorialReference: false }
    const related = active.filter(r => r.contentKey === item.key || relation(r.profile, item.profile))
    return { ...item, editorialFamilies: [...new Set(related.map(r => r.familyId))],
      directEditorialReference: active.some(r => r.contentKey === item.key) }
  })
  return { candidates, referenceCounts: counts }
}
