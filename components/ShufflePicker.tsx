'use client'

import type { ItemType } from '../lib/random/types'
type Theme = { bg: string; deep: string; cream: string; text: string }

type Props = {
  open: boolean
  onClose: () => void
  selected?: ItemType[]           // ← optionnel
  onChange?: (next: ItemType[]) => void // ← optionnel + no-op
  theme: Theme
}

const ALL: ItemType[] = ['image', 'video', 'quote', 'joke', 'fact', 'web']

export default function ShufflePicker({
  open,
  onClose,
  selected = ALL,
  onChange = () => {},
  theme,
}: Props) {
  if (!open) return null

  const selSet = new Set(selected)

  function commit(nextSet: Set<ItemType>) {
    if (typeof onChange === 'function') {
      const next = ALL.filter(t => nextSet.has(t))
      onChange(next)
    }
  }

  function toggle(t: ItemType) {
    const next = new Set(selSet)
    if (next.has(t)) {
      next.delete(t)
    } else {
      next.add(t)
    }
    commit(next)
  }

  function selectOnly(t: ItemType) {
    commit(new Set([t]))
  }

  function selectAll() {
    commit(new Set(ALL))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,.55)' }}>
      <div
        className="w-[min(92vw,560px)] rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: theme.bg, color: theme.cream }}
        role="dialog"
        aria-modal="true"
        aria-label="Shuffle picker"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/20">
          <h3 className="font-inter font-bold">Shuffle picker</h3>
          <button onClick={onClose} className="text-2xl leading-none" aria-label="Close">×</button>
        </div>

        <div className="p-4 grid grid-cols-2 gap-3">
          {ALL.map(t => {
            const active = selSet.has(t)
            return (
              <button
                key={t}
                onClick={() => toggle(t)}
                className={`px-3 py-2 rounded-xl border transition ${active ? 'opacity-100' : 'opacity-50'}`}
                style={{ borderColor: theme.cream, color: theme.cream, textTransform: 'capitalize' }}
                aria-pressed={active}
              >
                {t}
              </button>
            )
          })}
        </div>

        <div className="px-4 pb-4 flex flex-wrap items-center gap-3">
          <button
            onClick={selectAll}
            className="px-3 py-2 rounded-xl border"
            style={{ borderColor: theme.cream, color: theme.cream }}
          >
            All
          </button>
          {ALL.map(t => (
            <button
              key={'only-' + t}
              onClick={() => selectOnly(t)}
              className="px-3 py-2 rounded-xl border text-sm"
              style={{ borderColor: theme.cream, color: theme.cream, textTransform: 'capitalize' }}
            >
              Only {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
