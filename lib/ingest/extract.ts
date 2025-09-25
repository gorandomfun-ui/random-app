/* Shared helpers for ingestion (tags & keywords) */

const DEFAULT_STOP_WORDS = new Set([
  'the','and','with','from','that','this','your','our','for','into','over','under','about','just','make','made','making','best','how','what','when','where','why','who','are','was','were','will','can','get','got','been','take','takes','took','first','second','third','day','night','amp','episode','official','new','video','full','hd','challenge','edition','life','hack','hacks','trick','tricks','tip','tips','tutorial','amazing','awesome','incredible','really','very','here','there','have','without','inside','outside','their','them','they','you','yours','give','given','giving','see','seen','look','looking','want','wanted','watch','watching','every','always','never','still','into','out','once','again','another','ever','more','less','thing','things','stuff','maybe','some','someone','something','going','around','back','front','little','big','fun','cool','nice','good','bad','best','love','live','shorts','short','vs','vs.','feat','feat.','feat','and','or','the','a','an'
]);

const TAG_STOP_WORDS = new Set(['', 'gif', 'image', 'photo', 'video']);

function normalizeText(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function tokenizeInternal(text: string): string[] {
  return normalizeText(text)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function extractKeywordsFromText(text: string, limit = 12, stopWords = DEFAULT_STOP_WORDS): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const word of tokenizeInternal(text)) {
    if (word.length < 3 || word.length > 18) continue;
    if (stopWords.has(word)) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    keywords.push(word);
    if (keywords.length >= limit) break;
  }
  return keywords;
}

function sanitizeTag(raw: string): string | null {
  const trimmed = normalizeText(raw).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!trimmed || TAG_STOP_WORDS.has(trimmed) || trimmed.length < 2) return null;
  return trimmed;
}

export function buildTagList(values: Array<string | null | undefined | string[]>, limit = 12): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const entry of values) {
    if (!entry) continue;
    const list = Array.isArray(entry) ? entry : [entry];
    for (const raw of list) {
      if (!raw) continue;
      const tag = sanitizeTag(raw);
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      tags.push(tag);
      if (tags.length >= limit) return tags;
    }
  }
  return tags;
}

export function mergeKeywordSources(parts: Array<string | undefined | null>, limit = 14): string[] {
  const merged = parts.filter(Boolean).join(' ');
  return extractKeywordsFromText(merged, limit);
}

export function expandQueryToTags(queries: string[]): string[] {
  const tags: string[] = [];
  for (const query of queries) {
    if (!query) continue;
    const parts = query.split(/[\s,]+/).filter(Boolean);
    for (const part of parts) tags.push(part);
  }
  return tags;
}
