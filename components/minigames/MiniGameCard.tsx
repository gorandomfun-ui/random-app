import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { MiniGameItem } from '@/lib/random/clientTypes'
import {
  getMiniGameDefinition,
  type MiniGameDefinition,
  type MiniGameResult,
} from './definitions'

type Theme = { bg: string; deep: string; cream: string; text: string }

type ViewState = 'intro' | 'running' | 'result'

function buildCardStyle(theme: Theme): CSSProperties {
  return {
    borderRadius: '26px',
    border: `1px solid ${theme.cream}33`,
    backgroundColor: 'rgba(12, 12, 10, 0.26)',
    boxShadow: '0 18px 36px rgba(2, 2, 2, 0.28)',
    padding: '22px 20px 24px',
    color: theme.cream,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  }
}

const buttonBaseStyle: CSSProperties = {
  minWidth: '140px',
  padding: '10px 22px',
  borderRadius: '999px',
  fontSize: '14px',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  border: 'none',
  cursor: 'pointer',
}

const subtleButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  backgroundColor: 'rgba(255, 255, 255, 0.12)',
  color: '#FFFFFF',
}

export default function MiniGameCard({ item, theme }: { item: MiniGameItem; theme: Theme }) {
  const definition = useMemo<MiniGameDefinition | null>(
    () => getMiniGameDefinition(item.gameId) ?? null,
    [item.gameId],
  )

  const [state, setState] = useState<ViewState>('intro')
  const [result, setResult] = useState<MiniGameResult | null>(null)
  const [runToken, setRunToken] = useState(0)

  useEffect(() => {
    setState('intro')
    setResult(null)
    setRunToken((token) => token + 1)
  }, [item.gameId, item.level, item.seed])

  const startGame = useCallback(() => {
    setResult(null)
    setRunToken((token) => token + 1)
    setState('running')
  }, [])

  const replayGame = useCallback(() => {
    setResult(null)
    setRunToken((token) => token + 1)
    setState('running')
  }, [])

  const showIntro = useCallback(() => {
    setResult(null)
    setState('intro')
  }, [])

  const onComplete = useCallback((payload: MiniGameResult) => {
    setResult(payload)
    setState('result')
  }, [])

  if (!definition) {
    return (
      <div className="flex h-full w-full items-center justify-center text-center px-6">
        <p className="text-sm font-inter opacity-70" style={{ color: theme.cream }}>
          Mini-jeu indisponible pour le moment.
        </p>
      </div>
    )
  }

  const cardStyle = buildCardStyle(theme)
  const headerStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '12px',
  }

  const levelBadgeStyle: CSSProperties = {
    borderRadius: '999px',
    padding: '6px 14px',
    border: `1px solid ${theme.cream}4d`,
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: theme.cream,
  }

  const introStyle: CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    justifyContent: 'space-between',
  }

  const runtimeWrapperStyle: CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  }

  const resultStyle: CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    textAlign: 'center',
  }

  const primaryButtonStyle: CSSProperties = {
    ...buttonBaseStyle,
    backgroundColor: theme.text,
    color: theme.cream,
    boxShadow: '0 8px 18px rgba(0, 0, 0, 0.35)',
  }

  const instructionListStyle: CSSProperties = {
    display: 'grid',
    gap: '10px',
    padding: 0,
    margin: 0,
    listStyle: 'none',
  }

  const instructionItemStyle: CSSProperties = {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: '14px',
    padding: '10px 14px',
    fontSize: '13px',
    lineHeight: 1.5,
    fontFamily: "var(--font-inter-tight), 'Inter Tight', sans-serif",
  }

  const detailsStyle: CSSProperties = {
    display: 'grid',
    gap: '8px',
    width: '100%',
    maxWidth: '360px',
  }

  const detailRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    borderRadius: '12px',
    padding: '10px 12px',
    fontSize: '13px',
    fontFamily: "var(--font-inter-tight), 'Inter Tight', sans-serif",
  }

  return (
    <div className="mini-game-card" style={cardStyle}>
      <header style={headerStyle}>
        <div>
          <p
            className="text-xs font-inter opacity-70 uppercase tracking-[0.12em]"
            style={{ color: theme.cream }}
          >
            Mini-game
          </p>
          <h3
            className="text-xl md:text-2xl font-tomorrow font-bold"
            style={{ color: theme.cream, letterSpacing: '.04em' }}
          >
            {definition.name}
          </h3>
          <p className="mt-1 text-sm font-inter opacity-80" style={{ color: theme.cream }}>
            {definition.tagline}
          </p>
        </div>
        <span style={levelBadgeStyle}>Niveau {item.level}</span>
      </header>

      {state === 'intro' ? (
        <div style={introStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p className="text-sm font-inter opacity-85" style={{ color: theme.cream }}>
              Prêt ? Voici les règles :
            </p>
            <ul style={instructionListStyle}>
              {(definition.instructions.length ? definition.instructions : ['Amuse-toi et reste concentré.']).map(
                (line, idx) => (
                  <li key={`${definition.id}-rule-${idx}`} style={instructionItemStyle}>
                    {line}
                  </li>
                )
              )}
            </ul>
          </div>
          <div className="flex justify-center">
            <button type="button" onClick={startGame} style={primaryButtonStyle}>
              Start
            </button>
          </div>
        </div>
      ) : null}

      {state === 'running' ? (
        <div style={runtimeWrapperStyle}>
          <definition.Component
            key={`${definition.id}-${runToken}`}
            level={item.level}
            seed={item.seed}
            onComplete={onComplete}
            theme={theme}
          />
        </div>
      ) : null}

      {state === 'result' && result ? (
        <div style={resultStyle}>
          <p
            className="text-3xl font-tomorrow font-bold tracking-[0.08em]"
            style={{ color: result.outcome === 'win' ? theme.cream : '#FF7A7A' }}
          >
            {result.outcome === 'win' ? 'Gagné !' : 'Perdu'}
          </p>
          {result.message ? (
            <p className="text-sm font-inter opacity-85 max-w-md" style={{ color: theme.cream }}>
              {result.message}
            </p>
          ) : null}
          {result.details && result.details.length ? (
            <div style={detailsStyle}>
              {result.details.map((detail, idx) => (
                <div key={`${definition.id}-detail-${idx}`} style={detailRowStyle}>
                  <span className="opacity-75">{detail.label}</span>
                  <span className="font-semibold">{detail.value}</span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-10">
            <button type="button" onClick={replayGame} style={primaryButtonStyle}>
              Rejouer
            </button>
            <button type="button" onClick={showIntro} style={subtleButtonStyle}>
              Guide
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
