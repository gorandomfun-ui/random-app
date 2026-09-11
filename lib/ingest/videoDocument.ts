import { buildTagList, mergeKeywordSources } from './extract'
import { deriveToneAugmentation, flattenToneSegments } from './tone'
import { videoDiscoveryFields } from './discoveryMetadata'
import type { RawVideo, VideoDocument } from './videos'

function looksLikeHttpUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function buildVideoDocument(raw: RawVideo): VideoDocument | null {
  const candidates = [
    raw.provider,
    raw.apiTags,
    raw.channelTitle,
  ];
  const toneSegments = flattenToneSegments([
    raw.provider,
    raw.source?.name,
    raw.title,
    raw.description,
    raw.channelTitle,
    raw.apiTags,
  ]);
  const tone = deriveToneAugmentation(toneSegments);
  const tags = buildTagList([...candidates, tone?.toneTagHints], 14);
  const keywords = mergeKeywordSources([
    raw.title,
    raw.description,
    raw.channelTitle,
    tone?.toneSignals.join(' '),
  ], 16);

  if (!raw.videoId || !looksLikeHttpUrl(raw.url)) return null;
  // Sparse metadata is unknown, not invalid. Keep these items available for exploration.

  return {
    type: 'video',
    videoId: raw.videoId,
    url: raw.url,
    provider: raw.provider,
    title: raw.title,
    thumb: raw.thumb,
    source: raw.source,
    description: raw.description,
    channelId: raw.channelId,
    channelTitle: raw.channelTitle,
    duration: raw.duration,
    categoryId: raw.categoryId,
    liveBroadcastContent: raw.liveBroadcastContent,
    editorialRoutine: raw.editorialRoutine,
    editorialRoutineIngestedAt: raw.editorialRoutineIngestedAt,
    ...videoDiscoveryFields(raw),
    tags,
    keywords,
    tone: tone?.tone,
    toneConfidence: tone?.toneConfidence,
    toneSignals: tone?.toneSignals,
  };
}
