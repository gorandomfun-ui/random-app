import type { SharedContentType } from './content'

export type ShareLocale = 'en' | 'fr' | 'de' | 'es' | 'jp'

type SharePresentation = {
  foundOn: string
  randomMore: string
  share: string
  close: string
  copyLink: string
  copied: string
  source: string
  categories: Record<SharedContentType, string>
}

export const SHARE_PRESENTATION: Record<ShareLocale, SharePresentation> = {
  en: {
    foundOn: 'Look what I found on goRANDOM.fun',
    randomMore: 'RANDOM MORE',
    share: 'Share',
    close: 'Close',
    copyLink: 'Copy link',
    copied: 'Copied!',
    source: 'Source',
    categories: { image: 'images', video: 'videos', web: 'web', quote: 'other', joke: 'other', fact: 'other' },
  },
  fr: {
    foundOn: 'Regarde ce que j’ai trouvé sur goRANDOM.fun',
    randomMore: 'ENCORE DU RANDOM',
    share: 'Partager',
    close: 'Fermer',
    copyLink: 'Copier le lien',
    copied: 'Copié !',
    source: 'Source',
    categories: { image: 'images', video: 'vidéos', web: 'web', quote: 'autre', joke: 'autre', fact: 'autre' },
  },
  de: {
    foundOn: 'Schau, was ich auf goRANDOM.fun gefunden habe',
    randomMore: 'MEHR RANDOM',
    share: 'Teilen',
    close: 'Schließen',
    copyLink: 'Link kopieren',
    copied: 'Kopiert!',
    source: 'Quelle',
    categories: { image: 'Bilder', video: 'Videos', web: 'Web', quote: 'Andere', joke: 'Andere', fact: 'Andere' },
  },
  es: {
    foundOn: 'Mira lo que encontré en goRANDOM.fun',
    randomMore: 'MÁS RANDOM',
    share: 'Compartir',
    close: 'Cerrar',
    copyLink: 'Copiar enlace',
    copied: '¡Copiado!',
    source: 'Fuente',
    categories: { image: 'imágenes', video: 'vídeos', web: 'web', quote: 'otros', joke: 'otros', fact: 'otros' },
  },
  jp: {
    foundOn: 'goRANDOM.funでこんなのを見つけたよ',
    randomMore: 'もっとランダム',
    share: '共有',
    close: '閉じる',
    copyLink: 'リンクをコピー',
    copied: 'コピーしました！',
    source: '出典',
    categories: { image: '画像', video: '動画', web: 'ウェブ', quote: 'その他', joke: 'その他', fact: 'その他' },
  },
}

export function normalizeShareLocale(value: string | null | undefined): ShareLocale {
  const primary = (value || 'en').toLowerCase().trim().split(/[-_]/)[0]
  if (primary === 'fr' || primary === 'de' || primary === 'es') return primary
  if (primary === 'ja' || primary === 'jp') return 'jp'
  return 'en'
}
