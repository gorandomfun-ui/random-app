import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MiniGameRuntimeProps } from '../definitions'
import { normalizeLevel, scaleLevel } from '@/lib/minigames/progression'
import { createSeededRng } from '../utils/random'
import { useI18n } from '@/providers/I18nProvider'
import { formatI18n } from '@/lib/i18n/format'

function hslToCss(h: number, s: number, l: number) {
  return `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`
}

export default function ColorOffByOneGame({ level, seed, onComplete, theme }: MiniGameRuntimeProps) {
  const { t } = useI18n()
  const baseKey = 'minigames.games.color-off-by-one'
  const normalized = normalizeLevel(level, 18)
  const rounds = Math.min(4, 2 + Math.floor(normalized / 4))
  const gridSize = Math.min(5, 3 + Math.floor(normalized / 4))
  const tileCount = gridSize * gridSize
  const tileSize = Math.max(34, 108 - normalized * 4 - (gridSize - 3) * 6)

  const rngRef = useRef<() => number>(() => Math.random())
  const [round, setRound] = useState(1)
  const [tiles, setTiles] = useState<string[]>([])
  const [targetIndex, setTargetIndex] = useState(0)
  const lookLabel = t(`${baseKey}.status.look`, 'Repère la nuance différente.')
  const harderLabel = t(`${baseKey}.status.harder`, 'Encore plus subtil…')
  const winMessage = t(`${baseKey}.messages.win`, 'Œil de lynx !')
  const failMessage = t(`${baseKey}.messages.fail`, 'Ce n’était pas la bonne nuance.')
  const hudTemplate = t(`${baseKey}.hud.round`, 'Round {round}/{total}')
  const ariaTemplate = t(`${baseKey}.aria.tile`, 'Case {index}')
  const detailRoundLabel = t(`${baseKey}.details.round`, 'Round')
  const detailDifferenceLabel = t(`${baseKey}.details.difference`, 'Différence')

  const [status, setStatus] = useState(lookLabel)
  const [difference, setDifference] = useState(scaleLevel(normalized, 16, 3, 18))
  const endedRef = useRef(false)

  const buildTiles = useCallback(
    (diff: number) => {
      const rng = rngRef.current
      const baseHue = rng() * 360
      const baseSat = 40 + rng() * 50
      const baseLight = 45 + rng() * 25
      const baseColor = hslToCss(baseHue, baseSat, baseLight)
      const oddIndex = Math.floor(rng() * tileCount)
      const oddHue = (baseHue + (rng() > 0.5 ? diff : -diff) + 360) % 360
      const oddLight = Math.max(20, Math.min(80, baseLight + (rng() > 0.5 ? diff : -diff)))
      const oddColor = hslToCss(oddHue, baseSat, oddLight)
      const palette: string[] = Array.from({ length: tileCount }, (_, idx) => (idx === oddIndex ? oddColor : baseColor))
      setTiles(palette)
      setTargetIndex(oddIndex)
    },
    [tileCount],
  )

  const finalize = useCallback(
    (won: boolean, message?: string) => {
      if (endedRef.current) return
      endedRef.current = true
      onComplete({
        outcome: won ? 'win' : 'lose',
        message,
        details: [
          { label: detailRoundLabel, value: `${round} / ${rounds}` },
          { label: detailDifferenceLabel, value: `${difference.toFixed(1)}` },
        ],
      })
    },
    [detailDifferenceLabel, detailRoundLabel, difference, onComplete, round, rounds],
  )

  useEffect(() => {
    rngRef.current = createSeededRng(`${seed}-${level}-color`)
    endedRef.current = false
    setRound(1)
    const initialDiff = scaleLevel(normalized, 16, 3, 18)
    setDifference(initialDiff)
    buildTiles(initialDiff)
    setStatus(lookLabel)
    return () => {
      endedRef.current = true
    }
  }, [buildTiles, level, lookLabel, normalized, seed])

  const advanceRound = () => {
    if (round >= rounds) {
      finalize(true, winMessage)
      return
    }
    const nextRound = round + 1
    setRound(nextRound)
    const nextDiff = Math.max(0.8, difference * 0.65)
    setDifference(nextDiff)
    buildTiles(nextDiff)
    setStatus(harderLabel)
  }

  const handlePick = (index: number) => {
    if (endedRef.current) return
    if (index === targetIndex) {
      advanceRound()
    } else {
      finalize(false, failMessage)
    }
  }

  const gridStyle = useMemo(
    () => ({
      display: 'grid',
      gridTemplateColumns: `repeat(${gridSize}, ${tileSize}px)`,
      gap: '10px',
    }),
    [gridSize, tileSize],
  )

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      <div className="text-sm font-inter opacity-80" style={{ color: theme.cream }}>
        {status}
      </div>
      <div style={gridStyle}>
        {tiles.map((color, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handlePick(idx)}
            style={{
              width: `${tileSize}px`,
              height: `${tileSize}px`,
              borderRadius: '18px',
              border: 'none',
              backgroundColor: color,
              cursor: 'pointer',
            }}
            aria-label={formatI18n(ariaTemplate, { index: idx + 1 })}
          />
        ))}
      </div>
      <div className="text-xs font-inter uppercase tracking-[0.18em] opacity-70" style={{ color: theme.cream }}>
        {formatI18n(hudTemplate, { round, total: rounds })}
      </div>
    </div>
  )
}
