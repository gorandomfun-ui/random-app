/**
 * Sharing the app itself, from the home.
 *
 * Nothing of a content travels: the invitation in the visitor's language,
 * the link to the home, and a branded card for the places that take an
 * image rather than a link (Instagram, TikTok). Each destination gets the
 * form it understands — a compose intent for X and WhatsApp, an `sms:` link
 * for Messages, a file for a story — and the wording stays on the app.
 */

import type { ShareLocale } from './presentation'

export type AppShareWording = {
  /** What the card says and what travels with the link. */
  slogan: string
  /** The Messages button, in the language of the phone's own app. */
  messages: string
  /** On a computer, where a story cannot be opened: what just happened. */
  savedAndCopied: string
}

export const APP_SHARE: Record<ShareLocale, AppShareWording> = {
  en: { slogan: 'Come explore. Only random discovery.', messages: 'Messages', savedAndCopied: 'Image saved, link copied. Paste it in your story.' },
  fr: { slogan: 'Viens explorer. Rien que de la découverte au hasard.', messages: 'Messages', savedAndCopied: 'Image enregistrée, lien copié. Colle-le dans ta story.' },
  de: { slogan: 'Komm entdecken. Nur Zufallsfunde.', messages: 'Nachrichten', savedAndCopied: 'Bild gespeichert, Link kopiert. Füg ihn in deine Story ein.' },
  es: { slogan: 'Ven a explorar. Solo descubrimiento al azar.', messages: 'Mensajes', savedAndCopied: 'Imagen guardada y enlace copiado. Pégalo en tu historia.' },
  jp: { slogan: '探しに来て。あるのは偶然の発見だけ。', messages: 'メッセージ', savedAndCopied: '画像を保存し、リンクをコピーしました。ストーリーに貼ってね。' },
}

export type CardFormat = 'story' | 'og'
/** A story for Instagram and TikTok; a link preview for everything that unfurls a URL. */
export const CARD_SIZES: Record<CardFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  og: { width: 1200, height: 630 },
}

const trimOrigin = (origin: string) => origin.replace(/\/$/, '')

/** The home, with the language the sharer was in: the link preview is built in that language. */
export function appShareUrl(origin: string, locale: ShareLocale): string {
  return `${trimOrigin(origin)}/?lang=${locale}`
}

export function appCardUrl(origin: string, locale: ShareLocale, format: CardFormat, themeIndex?: number): string {
  const params = new URLSearchParams({ lang: locale, format })
  if (typeof themeIndex === 'number' && Number.isInteger(themeIndex) && themeIndex >= 0) params.set('theme', String(themeIndex))
  return `${trimOrigin(origin)}/api/share/app?${params.toString()}`
}

export type Platform = 'ios' | 'other'

/** iOS opens Messages with `sms:&body=`; every other phone with `sms:?body=`. */
export function platformOf(userAgent: string | null | undefined): Platform {
  return /iPad|iPhone|iPod/i.test(userAgent ?? '') ? 'ios' : 'other'
}

export type AppShareLinks = {
  url: string
  text: string
  x: string
  whatsapp: string
  messages: string
  card: Record<CardFormat, string>
}

export function appShareLinks(origin: string, locale: ShareLocale, platform: Platform = 'other', themeIndex?: number): AppShareLinks {
  const url = appShareUrl(origin, locale)
  const text = APP_SHARE[locale].slogan
  const body = encodeURIComponent(`${text} ${url}`)
  return {
    url,
    text,
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    whatsapp: `https://api.whatsapp.com/send?text=${body}`,
    messages: platform === 'ios' ? `sms:&body=${body}` : `sms:?body=${body}`,
    card: { story: appCardUrl(origin, locale, 'story', themeIndex), og: appCardUrl(origin, locale, 'og', themeIndex) },
  }
}
