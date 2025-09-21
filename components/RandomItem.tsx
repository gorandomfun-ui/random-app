'use client'
import React from 'react'
import { useI18n } from '../providers/I18nProvider'

type Theme = { bg: string; deep: string; cream: string; text: string }

type Item = {
  type: 'image' | 'quote' | 'fact' | 'joke' | 'video' | 'web'
  lang?: 'en' | 'fr' | 'de' | 'jp'
  text?: string
  author?: string
  url?: string
  thumbUrl?: string
  width?: number
  height?: number
  source?: { name?: string; url?: string }
  tags?: string[]
}

export default function RandomItem({ item, theme }: { item: Item; theme: Theme }) {
  // On reste tolérant côté TS : certains projets exposent useI18n différemment
  const i18n = useI18n() as any
  const t: (k: string) => string = i18n?.t ?? ((k: string) => k)

  const key = (() => {
    switch (item.type) {
      case 'image': return 'nav.images'
      case 'video': return 'nav.videos'
      case 'web':   return 'nav.web'
      case 'quote': return 'nav.quotes'
      case 'joke':  return 'nav.jokes'
      case 'fact':  return 'nav.facts'
      default:      return 'nav.web'
    }
  })()

  const fallbackMap: Record<string,string> = {
    'nav.images':'images',
    'nav.videos':'videos',
    'nav.web':'web',
    'nav.quotes':'quotes',
    'nav.jokes':'funny jokes',
    'nav.facts':'facts',
  }

  // t(key) -> si non trouvé, on tombe sur la clé ; on remplace par fallback simple
  const label = t(key)
  const prettyLabel = label === key ? (fallbackMap[key] ?? key) : label

  return (
    <div className="w-full">
      {/* En-tête catégorie */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2" style={{ color: theme.text }}>
          <span className="font-inter font-semibold text-sm md:text-base">
            {prettyLabel}
          </span>
        </div>
      </div>

      {/* Contenu */}
      {item.type === 'image' && item.url && (
        <div className="w-full rounded-xl overflow-hidden">
          <img src={item.url} alt="" className="w-full h-auto block" />
        </div>
      )}

      {item.type === 'quote' && (
        <div className="px-2 md:px-4">
          <p
            className="text-lg md:text-2xl font-tomorrow font-bold leading-snug"
            style={{ color: theme.cream }}
          >
            “{item.text}”
          </p>
          {item.author && (
            <p className="mt-2 font-inter italic opacity-80" style={{ color: theme.cream }}>
              — {item.author}
            </p>
          )}
        </div>
      )}

      {item.type === 'fact' && (
        <div className="px-2 md:px-4">
          <p
            className="text-base md:text-lg font-tomorrow font-bold leading-snug"
            style={{ color: theme.cream }}
          >
            {item.text}
          </p>
        </div>
      )}

      {/* Source en bas */}
      {item.source?.name && (
        <div className="mt-4 text-center font-inter italic opacity-80">
          {item.source?.url ? (
            <a href={item.source.url} target="_blank" rel="noreferrer" className="underline">
              {item.source.name}
            </a>
          ) : (
            <span>{item.source.name}</span>
          )}
        </div>
      )}
    </div>
  )
}
