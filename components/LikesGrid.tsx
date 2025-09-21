'use client'

import { LikeItem, removeLike } from '../utils/likes'
import { useEffect, useMemo, useState } from 'react'

type Props = {
  items: LikeItem[]
  onDelete?: () => void
}

/** Palette fallback si l'item n'a pas de theme sauvegardé */
const PALETTE = [
  { bg:'#f8c021', deep:'#ff3500', cream:'#FEFBE8', text:'#ff3500' },
  { bg:'#ff7a3b', deep:'#b90045', cream:'#fff7e2', text:'#b90045' },
  { bg:'#347ad9', deep:'#0013a4', cream:'#fff6ee', text:'#0013a4' },
  { bg:'#ff3500', deep:'#ffc300', cream:'#eefdf3', text:'#ffc300' },
  { bg:'#00d440', deep:'#007861', cream:'#f7efff', text:'#007861' },
  { bg:'#7706b2', deep:'#4ecc7f', cream:'#f6fbff', text:'#4ecc7f' },
]

/** colonnes effectives en fonction des breakpoints de la grille */
function getCols(w: number) {
  if (w >= 1280) return 6 // xl
  if (w >= 1024) return 4 // lg
  if (w >= 768)  return 3 // md
  return 2 // base
}

/** construit un tableau d'index de couleurs qui évite voisin gauche / voisin haut */
function makeColorIndices(n: number, cols: number, paletteLen: number) {
  const out: number[] = []
  // point de départ pseudo-aléatoire pour éviter des motifs trop réguliers
  let seed = Math.floor(Math.random() * paletteLen)

  for (let i = 0; i < n; i++) {
    // proposition initiale
    let idx = (seed + i) % paletteLen

    // contraintes : pas la même que gauche ni haut
    const left = i % cols ? out[i - 1] : -1
    const up   = i - cols >= 0 ? out[i - cols] : -1

    // si conflit, on décale dans la palette jusqu’à trouver ok
    let tries = 0
    while ((idx === left || idx === up) && tries < paletteLen) {
      idx = (idx + 1) % paletteLen
      tries++
    }
    out.push(idx)
  }
  return out
}

export default function LikesGrid({ items, onDelete }: Props) {
  // assez de tuiles pour "remplir" la page (ajuste si tu veux)
  const MIN_TILES_MOBILE = 12   // ~6 lignes * 2 colonnes
  const MIN_TILES_DESKTOP = 24  // ajoute un peu sur grand écran

  // largeur pour connaître le nb de colonnes courant
  const [vw, setVw] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1200)
  useEffect(() => {
    const onR = () => setVw(window.innerWidth)
    window.addEventListener('resize', onR)
    return () => window.removeEventListener('resize', onR)
  }, [])

  const cols = getCols(vw)
  const minTiles = vw >= 768 ? MIN_TILES_DESKTOP : MIN_TILES_MOBILE
  const placeholders = Math.max(0, minTiles - items.length)

  // indices de couleurs pour les items + placeholders, avec contraintes (gauche/haut)
  const colorIdx = useMemo(() => {
    const total = items.length + placeholders
    return makeColorIndices(total, cols, PALETTE.length)
  }, [items.length, placeholders, cols])

  return (
    <div
      className="
        grid gap-0
        grid-cols-2
        md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6
      "
    >
      {items.map((it, idx) => (
        <Tile
          key={it.id}
          it={it}
          paletteIdx={colorIdx[idx] ?? (idx % PALETTE.length)}
          onDelete={onDelete}
        />
      ))}

      {/* tuiles vides colorées pour “boucher les trous” */}
      {Array.from({ length: placeholders }).map((_, i) => {
        const p = PALETTE[colorIdx[items.length + i] ?? ((items.length + i) % PALETTE.length)]
        return (
          <div
            key={`ph-${i}`}
            className="relative"
            style={{ background: p.bg, color: p.cream, aspectRatio: '1 / 1' }}
          />
        )
      })}
    </div>
  )
}

function Tile({ it, paletteIdx, onDelete }: { it: LikeItem; paletteIdx: number; onDelete?: () => void }) {
  const t = it.theme || PALETTE[paletteIdx]
  const isText = it.type === 'quote' || it.type === 'joke' || it.type === 'fact'
  const displayImg = it.ogImage || it.thumbUrl

  const open = () => { if (it.url) window.open(it.url, '_blank', 'noopener,noreferrer') }

  return (
    <div className="relative" style={{ background: t.bg, color: t.cream, aspectRatio: '1 / 1' }}>
      <button className="w-full h-full flex items-center justify-center p-3" onClick={open}>
        {isText ? (
          <div className="text-center px-2">
            <div className="text-[10px] uppercase tracking-wide opacity-80 mb-1">{it.type}</div>
            <div className="font-tomorrow font-bold text-[15px] leading-snug line-clamp-6">
              {it.text || it.title || it.url}
            </div>
          </div>
        ) : displayImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displayImg!} alt="" className="w-full h-full object-cover" />
        ) : it.type === 'video' ? (
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: t.deep }}>
              ▶
            </div>
            <div className="mt-2 text-[11px] opacity-85 line-clamp-2 text-center px-2">
              {it.title || it.url}
            </div>
          </div>
        ) : (
          <div className="text-center text-sm px-2">{it.title || it.url}</div>
        )}
      </button>

      {/* petite croix pour retirer sans casser la grille */}
      <button
        aria-label="Remove like"
        className="absolute right-1 top-1 w-6 h-6 rounded-md text-[14px] leading-[22px] text-center"
        style={{ background: 'rgba(0,0,0,.35)', color: t.cream }}
        onClick={(e) => {
          e.stopPropagation()
          removeLike(it.id)
          onDelete?.()
        }}
      >
        ×
      </button>
    </div>
  )
}
