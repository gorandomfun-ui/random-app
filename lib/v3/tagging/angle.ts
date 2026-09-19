/**
 * Deciding how an item treats its subject, without any AI.
 *
 * Keyword tables and a few blunt signals. When nothing matches the answer is
 * `other` — an honest shrug rather than a guess. Phase 5's optional AI pass
 * can refine those later.
 */

import type { Angle, ItemType } from '../types'
import { containsAlias } from './normalize'

/** Multilingual cues, in the five languages the site serves plus common ones. */
const ANGLE_KEYWORDS: Partial<Record<Angle, string[]>> = {
  'official-clip': [
    'official video', 'official music video', 'official clip', 'clip officiel', 'videoclip',
    'lyric video', 'official audio', 'visualizer', 'vídeo oficial', 'offizielles video',
    'ミュージックビデオ', 'MV',
  ],
  'live-concert': [
    'live', 'en concert', 'concert', 'live performance', 'live at', 'live in', 'en vivo',
    'au zenith', 'tournee', 'tour', 'festival', 'unplugged', 'session live',
    'コンサート', 'ライブ',
  ],
  'amateur-cover': [
    'cover', 'reprise', 'reprend', 'chante', 'karaoke', 'karaoké', 'tribute band',
    'groupe hommage', 'dans ma chambre', 'bedroom', 'versión', 'gecovert',
    '歌ってみた', '弾いてみた',
  ],
  'fan-footage': [
    'fancam', 'fan cam', 'filme par un fan', 'filmé', 'bootleg', 'en cachette',
    'audience recording', 'captation amateur', 'vu du public', 'from the crowd',
  ],
  'home-video': [
    'home video', 'home movie', 'video de famille', 'vidéo de famille', 'vidéo personnelle',
    'super 8', 'camescope', 'caméscope', 'vhs familial', 'ホームビデオ',
  ],
  'local-event': [
    'fete', 'fête', 'fete du village', 'kermesse', 'bal', 'mariage', 'village',
    'festival local', 'comice', 'ducasse', 'braderie', 'carnaval', 'fiesta del pueblo',
    'dorffest', 'school', 'ecole', 'école', 'recital', 'récital',
  ],
  'mainstream-report': [
    'reportage', 'journal televise', 'journal télévisé', 'jt de', 'news report',
    'noticias', 'tagesschau', 'telediario', 'info', 'actualites', 'actualités',
    'ニュース',
  ],
  interview: ['interview', 'entretien', 'entrevista', 'itw', 'questions a', 'インタビュー'],
  'tv-archive': [
    'archive', 'archives', 'ina', 'vhs', 'rediffusion', 'retro tv', 'émission de',
    'emission de', 'plateau tv', 'アーカイブ',
  ],
  'parody-sketch': [
    'parody', 'parodie', 'parodia', 'sketch', 'imitation', 'pastiche', 'detournement',
    'détournement', 'spoof', 'パロディ', 'コント',
  ],
  tutorial: [
    'tutorial', 'tutoriel', 'tuto', 'how to', 'comment faire', 'diy', 'anleitung',
    'como hacer', 'apprendre', 'チュートリアル', '作り方',
  ],
  reaction: ['reaction', 'réaction', 'reacciona', 'react to', 'first time hearing', 'リアクション'],
  compilation: [
    'compilation', 'best of', 'top 10', 'top 5', 'les meilleurs', 'recopilacion',
    'zusammenschnitt', 'まとめ',
  ],
  gameplay: [
    'gameplay', 'let s play', 'lets play', 'playthrough', 'speedrun', 'walkthrough',
    'no commentary', '実況プレイ',
  ],
  'travel-vlog': [
    'road trip', 'roadtrip', 'travel vlog', 'carnet de voyage', 'walking tour',
    'city walk', 'vlog voyage', 'visite de', '旅', '散歩',
  ],
  documentary: [
    'documentaire', 'documentary', 'documental', 'dokumentation', 'reportage long',
    'enquete', 'enquête', 'ドキュメンタリー',
  ],
  'episode-extract': [
    'episode', 'épisode', 'extrait', 'scene', 'scène', 'clip from', 'saison',
    'temporada', 'staffel', 'エピソード',
  ],
  'fan-art': ['fan art', 'fanart', 'dessin', 'drawing', 'speedpaint', 'illustration', '似顔絵'],
}

/** Channel names that mean the upload is an official release. */
const OFFICIAL_CHANNEL = /(?:vevo|- topic|officiel|official)$/iu

/** Below this, a "cover" is an amateur one rather than a released recording. */
const AMATEUR_VIEW_CEILING = 1_000

export type AngleInput = {
  type: ItemType
  /** Facts stored as a quiz carry their question in `quiz`, not the title. */
  variant?: string | null
  title?: string | null
  description?: string | null
  channelTitle?: string | null
  viewCount?: number | null
  /** Set for GIFs so they are not confused with photographs. */
  isAnimated?: boolean
}

/** Non-video types carry their angle in the type itself. */
function angleFromType(input: AngleInput): Angle | null {
  // 4,293 of the 6,171 "facts" are quiz questions; calling them text-fact hid
  // them from the one angle the Wave could have used them for.
  if (input.variant === 'quiz') return 'quiz'
  if (input.type === 'quote') return 'text-quote'
  if (input.type === 'joke') return 'text-joke'
  if (input.type === 'fact') return 'text-fact'
  if (input.type === 'web') return 'website'
  if (input.type === 'image') return input.isAnimated ? 'meme-gif' : 'photo-image'
  return null
}

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => containsAlias(text, keyword))
}

/**
 * Order matters: the most specific reading wins. An official channel beats a
 * "live" in the title, and a low-view cover beats a generic "concert".
 */
export function detectAngle(input: AngleInput): Angle {
  const fromType = angleFromType(input)
  if (fromType) return fromType

  const text = `${input.title ?? ''} ${(input.description ?? '').slice(0, 300)}`
  const channel = input.channelTitle ?? ''

  const officialChannel = OFFICIAL_CHANNEL.test(channel.trim())
  if (officialChannel && matchesAny(text, ANGLE_KEYWORDS['official-clip'] ?? [])) return 'official-clip'
  if (officialChannel && matchesAny(text, ANGLE_KEYWORDS['live-concert'] ?? [])) return 'live-concert'

  const looksLikeCover = matchesAny(text, ANGLE_KEYWORDS['amateur-cover'] ?? [])
  const fewViews = typeof input.viewCount === 'number' && input.viewCount < AMATEUR_VIEW_CEILING
  if (looksLikeCover && (fewViews || !officialChannel)) return 'amateur-cover'

  for (const angle of PRIORITY) {
    if (matchesAny(text, ANGLE_KEYWORDS[angle] ?? [])) return angle
  }

  if (officialChannel) return 'official-clip'
  return 'other'
}

/**
 * Checked in this order so a narrow cue is not swallowed by a broad one:
 * "fête du village" should win over "festival", "documentaire" over "épisode".
 */
const PRIORITY: Angle[] = [
  'fan-footage',
  'home-video',
  'local-event',
  'tv-archive',
  'parody-sketch',
  'gameplay',
  'tutorial',
  'reaction',
  'travel-vlog',
  'documentary',
  'interview',
  'mainstream-report',
  'compilation',
  'fan-art',
  'official-clip',
  'live-concert',
  'episode-extract',
]
