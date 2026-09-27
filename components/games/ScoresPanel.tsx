'use client'

/**
 * HIGH SCORE: the ten best of this device, the world's ten best, and the
 * world's two hundred, one tab each. The player's own game is lit when it
 * is there. The world's table is read when its tab opens.
 */

import { X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { topScores, type GameName, type ScoreEntry } from '@/lib/games/scores'
import type { Theme } from '@/lib/theme'
import { useI18n } from '@/providers/I18nProvider'

import { fetchWorld, type WorldRow } from './world'
import { GAME_TITLES } from './share'

type Tab = 'device' | 'world' | 'all'
const pad = (n: number) => String(n).padStart(5, '0')

export default function ScoresPanel({ game, theme, onClose, mine }: { game: GameName; theme: Theme; onClose: () => void; mine?: string[] }) {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('device')
  const [device] = useState<ScoreEntry[]>(() => topScores(game))
  const [world, setWorld] = useState<WorldRow[] | null | undefined>(undefined)

  useEffect(() => {
    if (tab === 'device' || world !== undefined) return
    let live = true
    void fetchWorld(game).then((rows) => { if (live) setWorld(rows) })
    return () => { live = false }
  }, [tab, world, game])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const rows: Array<{ key: string; name: string; score: number; level: number; own: boolean }> =
    tab === 'device'
      ? device.map((e, i) => ({ key: `${e.at}-${i}`, name: e.name, score: e.score, level: e.level, own: Boolean(e.runId && mine?.includes(e.runId)) }))
      : (world ?? []).slice(0, tab === 'world' ? 10 : 200).map((e, i) => ({ key: `${e.runId}-${i}`, name: e.name, score: e.score, level: e.level, own: Boolean(mine?.includes(e.runId)) }))
  const tabs: Array<[Tab, string]> = [['device', t('arcade.tabDevice', 'This device')], ['world', t('arcade.tabWorld', 'World')], ['all', t('arcade.tabAll', 'Top 200')]]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative flex max-h-[80svh] w-full max-w-[380px] flex-col border-2 p-5" style={{ background: '#0a0a14', borderColor: theme.text, color: theme.cream }}>
        <button type="button" aria-label="Close" onClick={onClose} className="absolute right-3 top-3" style={{ color: theme.cream }}>
          <X size={24} />
        </button>
        <h2 className="mb-1 font-tomorrow text-xl font-bold uppercase tracking-[0.12em]" style={{ color: theme.text }}>High score</h2>
        <p className="mb-3 font-tomorrow text-xs uppercase tracking-[0.12em] opacity-70">{GAME_TITLES[game]}</p>
        <div className="mb-3 flex gap-[2px]">
          {tabs.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className="flex-1 px-2 py-2 font-tomorrow text-[11px] font-bold uppercase tracking-[0.06em]"
              style={{ background: tab === id ? theme.text : 'rgba(248,245,230,0.08)', color: theme.cream }}>
              {label}
            </button>
          ))}
        </div>
        <div className="min-h-[120px] overflow-y-auto">
          {tab !== 'device' && world === undefined ? <p className="font-tomorrow text-sm uppercase opacity-70">…</p> : rows.length ? (
            <ol className="flex flex-col gap-1 font-tomorrow text-sm uppercase">
              {rows.map((row, index) => (
                <li key={row.key} className="grid grid-cols-[2.6em_1fr_auto_3.2em] items-center gap-2" style={{ color: row.own ? theme.text : index === 0 ? theme.text : theme.cream, fontWeight: row.own ? 800 : undefined }}>
                  <span className="opacity-70">{index + 1}.</span>
                  <span className="truncate font-bold">{row.name}</span>
                  <span className="font-bold tabular-nums">{pad(row.score)}</span>
                  <span className="text-right text-xs opacity-70">LV {row.level}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="font-tomorrow text-sm uppercase opacity-70">{t('arcade.noScore', 'No score yet')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
