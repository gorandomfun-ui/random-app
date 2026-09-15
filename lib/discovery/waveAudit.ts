/** Session-local diagnostics only: no network, cookies, storage or behaviour scoring. */
export type WaveAuditEntry = {
  at: number; anchorId: string; type: string; stage: 'request' | 'response' | 'cancelled' | 'failed' | 'display';
  elapsedMs?: number; http?: number; ready?: boolean; cause?: string;
  subjectKey?: string | null; sampled?: number; related?: number; queryFailures?: number;
}
const entries: WaveAuditEntry[] = []
declare global { interface Window { randomWaveAudit?: () => WaveAuditEntry[] } }
export function recordWaveAudit(entry: Omit<WaveAuditEntry, 'at'>): void {
  if (typeof window === 'undefined') return
  entries.push({ ...entry, at: Date.now() })
  if (entries.length > 240) entries.splice(0, entries.length - 240)
  window.randomWaveAudit = () => entries.map(x => ({ ...x }))
}
