import { hash } from './random'
import type { SourceMetadata } from './types'

/** Bounded deterministic fingerprint; no network, model or visitor data. */
export function sourceRevision(source: SourceMetadata): string {
  const value = JSON.stringify([
    (source.title ?? '').slice(0, 500), (source.description ?? '').slice(0, 3500),
    (source.entities ?? []).slice(0, 12), source.primarySubject ?? null,
    source.category ?? null, source.language ?? null, Boolean(source.legacyUnverified),
  ])
  return `${hash(value)}:${hash([...value].reverse().join(''))}`
}
