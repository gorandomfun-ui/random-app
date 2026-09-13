export type CurationLikePlan = {
  changed: boolean
  likeDelta: -1 | 0 | 1
  publicLikeCounted: boolean | undefined
}

export function planCurationLikeMutation({
  wasActive,
  nextActive,
  syncPublicLike,
  locallyLiked,
  publicLikeCounted,
}: {
  wasActive: boolean
  nextActive: boolean
  syncPublicLike: boolean
  locallyLiked: boolean
  publicLikeCounted: boolean | undefined
}): CurationLikePlan {
  const changed = wasActive !== nextActive
  if (!syncPublicLike || !changed) {
    return { changed, likeDelta: 0, publicLikeCounted }
  }
  if (nextActive) {
    return { changed, likeDelta: locallyLiked ? 0 : 1, publicLikeCounted: true }
  }
  return {
    changed,
    likeDelta: publicLikeCounted === false ? 0 : -1,
    publicLikeCounted: false,
  }
}
