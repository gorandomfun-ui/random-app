import type { ToneScore } from '../tone/analyze'
import {
  deriveToneFromSegments,
  summarizeSignals,
} from '../tone/analyze'

export type ToneAugmentation = {
  score: ToneScore
  tone: 'positive' | 'neutral' | 'negative'
  toneConfidence: number
  toneSignals: string[]
  toneTagHints: string[]
}

export function flattenToneSegments(parts: Array<string | string[] | null | undefined>): string[] {
  const segments: string[] = []
  for (const part of parts) {
    if (!part) continue
    if (Array.isArray(part)) {
      const joined = part.filter(Boolean).join(' ')
      if (joined.trim()) segments.push(joined)
    } else if (typeof part === 'string' && part.trim()) {
      segments.push(part)
    }
  }
  return segments
}

export function deriveToneAugmentation(segments: readonly string[]): ToneAugmentation | null {
  if (!segments.length) return null
  const result = deriveToneFromSegments(segments)
  const summarized = summarizeSignals(result.signals)
  const toneSignals = Array.from(new Set([...summarized.positive, ...summarized.negative]))
  const hints = new Set<string>()

  hints.add(`tone ${result.classification.tone}`)

  if (result.classification.confidence >= 0.65) {
    hints.add('tone strong')
  } else if (result.classification.confidence >= 0.35) {
    hints.add('tone medium')
  }

  const positiveHints = summarized.positive.slice(0, 6)
  const negativeHints = summarized.negative.slice(0, 6)

  for (const hint of positiveHints) {
    if (hint) hints.add(hint)
  }
  for (const hint of negativeHints) {
    if (hint) hints.add(hint)
  }

  const toneConfidence = Number(result.classification.confidence.toFixed(2))

  return {
    score: result.score,
    tone: result.classification.tone,
    toneConfidence,
    toneSignals,
    toneTagHints: Array.from(hints),
  }
}

function sanitizeTagValue(value: string): string | null {
  if (!value) return null
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!normalized || normalized.length < 2) return null
  return normalized
}

export function mergeToneHintsIntoTags(
  existing: string[],
  hints?: string[] | null,
  limit = 14,
): string[] {
  const tags: string[] = []
  const seen = new Set<string>()
  const push = (raw: string | null | undefined) => {
    if (!raw) return
    const sanitized = sanitizeTagValue(raw)
    if (!sanitized || seen.has(sanitized)) return
    seen.add(sanitized)
    tags.push(sanitized)
  }

  for (const tag of existing) push(tag)
  if (hints) {
    for (const hint of hints) push(hint)
  }

  return tags.slice(0, limit)
}

export function mergeToneSignalsIntoKeywords(
  existing: string[],
  signals?: string[] | null,
  limit = 16,
): string[] {
  const keywords: string[] = []
  const seen = new Set<string>()

  const push = (value: string | null | undefined) => {
    if (!value) return
    const normalized = value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((part) => part.length >= 3 && part.length <= 18)
    for (const part of normalized) {
      if (seen.has(part)) continue
      seen.add(part)
      keywords.push(part)
      if (keywords.length >= limit) return
    }
  }

  for (const word of existing) push(word)
  if (signals) {
    for (const signal of signals) {
      if (keywords.length >= limit) break
      push(signal)
    }
  }

  return keywords.slice(0, limit)
}
