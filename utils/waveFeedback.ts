import type { RandomContentItem } from '@/lib/random/clientTypes'

export type WaveFeedbackAction = 'continue' | 'complete' | 'exit' | 'like'

export function reportWaveFeedback(
  anchor: RandomContentItem | null | undefined,
  candidate: RandomContentItem | null | undefined,
  action: WaveFeedbackAction,
  shownAt: number,
) {
  if (typeof window === 'undefined' || !anchor?._id || !candidate?._id) return
  const payload = {
    anchorId: anchor._id,
    candidateId: candidate._id,
    action,
    dwellMs: shownAt > 0 ? Math.max(0, Date.now() - shownAt) : 0,
  }
  try {
    void fetch('/api/feedback/wave', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    /* Learning must never delay or block Wave navigation. */
  }
}
