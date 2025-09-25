export const runtime = 'nodejs';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ingestVideos } from '@/lib/ingest/videos';

function parseList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseInteger(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export async function GET(req: NextRequest) {
  const isCron = Boolean(req.headers.get('x-vercel-cron'));
  const providedKey = (req.nextUrl.searchParams.get('key') || req.headers.get('x-admin-ingest-key') || '').trim();
  const expectedKey = (process.env.ADMIN_INGEST_KEY || '').trim();
  if (!isCron && (!expectedKey || providedKey !== expectedKey)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = req.nextUrl;
    const modeParam = (url.searchParams.get('mode') || 'search').toLowerCase();
    const mode = modeParam === 'playlist' ? 'playlist' : modeParam === 'channel' ? 'channel' : 'search';
    const queries = parseList(url.searchParams.get('q'));
    const per = parseInteger(url.searchParams.get('per'), 20, 1, 50);
    const pages = parseInteger(url.searchParams.get('pages'), 1, 1, 5);
    const days = parseInteger(url.searchParams.get('days'), 120, 1, 365);
    const includeArchive = (url.searchParams.get('archive') || '1') !== '0';

    const playlistId = url.searchParams.get('playlistId') || undefined;
    const channelId = url.searchParams.get('channelId') || undefined;
    const manualIds = parseList(url.searchParams.get('ids'));

    const redditEnabled = (url.searchParams.get('reddit') || '0') === '1';
    const redditSub = url.searchParams.get('sub') || 'funnyvideos';
    const redditLimit = parseInteger(url.searchParams.get('limit'), 40, 5, 100);
    const reddit = redditEnabled ? { sub: redditSub, limit: redditLimit } : null;

    const result = await ingestVideos({
      mode,
      queries,
      per,
      pages,
      days,
      playlistId,
      channelId,
      includeArchive,
      reddit,
      manualIds,
    });

    return NextResponse.json({
      ok: true,
      mode,
      queries,
      playlistId,
      channelId,
      reddit,
      includeArchive,
      ...result,
    });
  } catch (error: unknown) {
    console.error('[ingest:videos]', error);
    const message = error instanceof Error ? error.message : 'ingest failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
