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
  /** On a computer, a story cannot be posted: the card is saved, the text copied, the site opened. */
  saveImage: string
  copyText: string
  copied: string
  /** "Open Instagram", "Open TikTok". */
  open: string
  /** Under the QR code: the phone takes over. */
  scanToShare: string
  /** On the phone, arrived by the QR code: what to tap. */
  tapToPost: string
  back: string
}

export const APP_SHARE: Record<ShareLocale, AppShareWording> = {
  en: { slogan: 'Come explore. Only random discovery.', messages: 'Messages', saveImage: 'Save the image', copyText: 'Copy the text', copied: 'Copied!', open: 'Open', scanToShare: 'Scan to share from your phone', tapToPost: 'Tap to post your story', back: 'Back' },
  fr: { slogan: 'Viens explorer. Rien que de la découverte au hasard.', messages: 'Messages', saveImage: 'Enregistrer l’image', copyText: 'Copier le texte', copied: 'Copié !', open: 'Ouvrir', scanToShare: 'Scanne pour partager depuis ton téléphone', tapToPost: 'Appuie pour publier ta story', back: 'Retour' },
  de: { slogan: 'Komm entdecken. Nur Zufallsfunde.', messages: 'Nachrichten', saveImage: 'Bild speichern', copyText: 'Text kopieren', copied: 'Kopiert!', open: 'Öffnen', scanToShare: 'Scannen und vom Handy aus teilen', tapToPost: 'Tippen, um deine Story zu posten', back: 'Zurück' },
  es: { slogan: 'Ven a explorar. Solo descubrimiento al azar.', messages: 'Mensajes', saveImage: 'Guardar la imagen', copyText: 'Copiar el texto', copied: '¡Copiado!', open: 'Abrir', scanToShare: 'Escanea para compartir desde tu móvil', tapToPost: 'Toca para publicar tu historia', back: 'Volver' },
  jp: { slogan: '探しに来て。あるのは偶然の発見だけ。', messages: 'メッセージ', saveImage: '画像を保存', copyText: 'テキストをコピー', copied: 'コピーしました！', open: '開く', scanToShare: 'スキャンしてスマホから共有', tapToPost: 'タップしてストーリーを投稿', back: '戻る' },
}

/** The places that take an image rather than a link: a story, posted from a phone. */
export type StoryDestination = 'instagram' | 'tiktok'
export const STORY_SITES: Record<StoryDestination, string> = { instagram: 'https://www.instagram.com/', tiktok: 'https://www.tiktok.com/upload' }
export const STORY_NAMES: Record<StoryDestination, string> = { instagram: 'Instagram', tiktok: 'TikTok' }

export function storyDestinationOf(value: string | null | undefined): StoryDestination | null {
  return value === 'instagram' || value === 'tiktok' ? value : null
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

/** The home with the share panel already open on a story destination: what a computer's QR code hands the phone. */
export function appHandoverUrl(origin: string, locale: ShareLocale, destination: StoryDestination): string {
  return `${appShareUrl(origin, locale)}&share=${destination}`
}

/** The QR code of a handover, drawn by the app itself. */
export function appQrUrl(origin: string, target: string): string {
  return `${trimOrigin(origin)}/api/share/qr?to=${encodeURIComponent(target)}`
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
