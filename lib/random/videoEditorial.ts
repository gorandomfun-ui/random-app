export const ROUTINE_NEWS_RADIO_REGEX = /(?:\b(news|newscast|breaking news|news bulletin|news update|headlines|weather forecast|press conference|radio|podcast|talk show|full episode|journal t[eé]l[eé]vis[eé]|journal de [0-9]{1,2}h|actualit[eé]s|infos|m[eé]t[eé]o|conf[eé]rence de presse|[eé]mission radio|d[eé]bat politique|noticias|informativo|rueda de prensa|programa de radio|nachrichten|pressekonferenz|radiosendung|telegiornale|notizie|conferenza stampa|journaal|nieuws|persconferentie)\b|ニュース|記者会見|ラジオ)/i

export const FUN_TREND_REGEX = /\b(fun|funny|hilarious|comedy|comedian|parody|satire|sketch|meme|blooper|fail|prank|absurd|weird|strange|viral|wtf|insolite|dr[oô]le|humour|com[eé]die|parodie|b[eê]tisier|gag|divertido|gracioso|comedia|parodia|lustig|kom[oö]die|witzig|divertente)\b/i

export const YOUTUBE_NEWS_CATEGORY_ID = '25'

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

export function shouldKeepFunTrend(input: TrendEditorialInput): boolean {
  return !isRoutineTrend(input) || isFunTrend(input)
}
