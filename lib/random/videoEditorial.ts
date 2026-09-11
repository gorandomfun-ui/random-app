export const ROUTINE_NEWS_RADIO_REGEX = /(?:\b(news|newscast|breaking news|news bulletin|news update|headlines|weather forecast|press conference|radio|podcast|talk show|full episode|journal t[eé]l[eé]vis[eé]|journal de [0-9]{1,2}h|actualit[eé]s|infos|m[eé]t[eé]o|conf[eé]rence de presse|[eé]mission radio|d[eé]bat politique|noticias|informativo|rueda de prensa|programa de radio|nachrichten|pressekonferenz|radiosendung|telegiornale|notizie|conferenza stampa|journaal|nieuws|persconferentie)\b|ニュース|記者会見|ラジオ)/i

export const FUN_TREND_REGEX = /\b(fun|funny|hilarious|comedy|comedian|parody|satire|sketch|meme|blooper|fail|prank|absurd|weird|strange|viral|wtf|insolite|dr[oô]le|humour|com[eé]die|parodie|b[eê]tisier|gag|divertido|gracioso|comedia|parodia|lustig|kom[oö]die|witzig|divertente)\b/i

export const YOUTUBE_NEWS_CATEGORY_ID = '25'
export const ROUTINE_NEWS_RADIO_DAILY_LIMIT = 2
export const VIDEO_EDITORIAL_TEXT_FIELDS = ['title', 'text', 'description', 'channelTitle', 'tags', 'keywords'] as const

type TrendEditorialInput = {
  title?: string | null
  description?: string | null
  channelTitle?: string | null
  categoryId?: string | null
  liveBroadcastContent?: string | null
}

function trendEditorialText(input: TrendEditorialInput): string {
  return [input.title, input.description, input.channelTitle].filter(Boolean).join(' ')
}

export function isRoutineTrend(input: TrendEditorialInput): boolean {
  const text = trendEditorialText(input)
  return (
    input.categoryId === YOUTUBE_NEWS_CATEGORY_ID ||
    input.liveBroadcastContent === 'live' ||
    input.liveBroadcastContent === 'upcoming' ||
    ROUTINE_NEWS_RADIO_REGEX.test(text)
  )
}

export function isFunTrend(input: TrendEditorialInput): boolean {
  return FUN_TREND_REGEX.test(trendEditorialText(input))
}

/** Ordinary news/radio/live programming is capped on ingest and excluded from curated discovery. */
export function isOrdinaryRoutineVideo(input: TrendEditorialInput): boolean {
  return isRoutineTrend(input) && !isFunTrend(input)
}

export function shouldKeepFunTrend(input: TrendEditorialInput): boolean {
  return !isOrdinaryRoutineVideo(input)
}

/** Mongo equivalent of shouldKeepFunTrend. Shared by the legacy pool, Pool Cool and Wave. */
export function routineVideoSelectionMatch(): Record<string, unknown> {
  const routineFree = {
    $and: [
      { $nor: VIDEO_EDITORIAL_TEXT_FIELDS.map((field) => ({ [field]: ROUTINE_NEWS_RADIO_REGEX })) },
      { categoryId: { $ne: YOUTUBE_NEWS_CATEGORY_ID } },
      { liveBroadcastContent: { $nin: ['live', 'upcoming'] } },
    ],
  }
  const humorousException = {
    $or: VIDEO_EDITORIAL_TEXT_FIELDS.map((field) => ({ [field]: FUN_TREND_REGEX })),
  }
  return { $or: [routineFree, humorousException] }
}
