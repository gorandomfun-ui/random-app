'use client'

type Theme = { bg: string; deep: string; cream: string; text: string }

type Item =
  | ({ type: 'image'; url: string; width?: number; height?: number; source?: any; lang?: string })
  | ({ type: 'quote' | 'fact'; text: string; author?: string; lang?: string })
  | (any) // tolérant pour la suite (joke/video/web)

export default function RandomContentRenderer({
  item,
  theme,
}: {
  item: Item | null
  theme: Theme
}) {
  if (!item) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <span className="animate-pulse opacity-80 font-inter">Loading…</span>
      </div>
    )
  }

  if (item.type === 'image' && 'url' in item) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <img
          src={item.url}
          alt="Random"
          className="max-h-[56vh] md:max-h-[64vh] max-w-full object-contain rounded-lg shadow-lg"
          style={{ background: '#0000' }}
        />
      </div>
    )
  }

  if ((item.type === 'quote' || item.type === 'fact') && 'text' in item) {
    return (
      <div className="w-full max-w-3xl mx-auto text-center px-4">
        <p
          className="font-tomorrow font-bold text-xl md:text-3xl leading-snug"
          style={{ color: theme.cream, fontFamily: "'Tomorrow', sans-serif", fontWeight: 700 }}
        >
          {item.text}
        </p>
        {item.type === 'quote' && item.author ? (
          <p className="mt-3 opacity-80 font-inter">— {item.author}</p>
        ) : null}
      </div>
    )
  }

  // Fallback très simple (au cas où)
  return (
    <div className="w-full max-w-3xl mx-auto text-center px-4">
      <pre className="text-xs md:text-sm opacity-80 overflow-auto">{JSON.stringify(item, null, 2)}</pre>
    </div>
  )
}
