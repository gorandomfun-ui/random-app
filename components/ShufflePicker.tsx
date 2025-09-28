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
  const allSelected = selSet.size === ALL.length

  function commit(nextSet: Set<ItemType>) {
    if (typeof onChange === 'function') {
      const next = ALL.filter(t => nextSet.has(t))
      onChange(next)
    }
  }

  function handleToggle(value: ItemType | 'all', checked: boolean) {
    if (value === 'all') {
      if (!checked) return
      commit(new Set(ALL))
      return
    }

    if (allSelected) {
      commit(new Set([value]))
      return
    }

    const next = new Set(selSet)
    if (checked) {
      next.add(value)
    } else {
      next.delete(value)
    }
    if (!next.size) {
      next.add(value)
    }
    commit(next)
  }

  function isChecked(value: ItemType | 'all') {
    if (value === 'all') return allSelected
    return selSet.has(value)
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

        <div className="p-5 flex flex-col gap-3">
          {['all', ...ALL].map((option) => {
            const label = option === 'all' ? 'All' : option
            const capitalized = label.charAt(0).toUpperCase() + label.slice(1)
            const checked = isChecked(option as ItemType | 'all')
            return (
              <label
                key={option}
                className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 border"
                style={{ borderColor: checked ? theme.cream : 'rgba(255,255,255,0.35)', background: 'transparent' }}
              >
                <span style={{ textTransform: 'capitalize', color: theme.cream }}>{capitalized}</span>
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-white"
                  checked={checked}
                  onChange={(event) => handleToggle(option as ItemType | 'all', event.target.checked)}
                />
              </label>
            )
          })}
        </div>
      </div>
    </div>
  )
}
