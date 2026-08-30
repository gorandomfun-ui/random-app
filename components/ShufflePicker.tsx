'use client'

import type { ItemType } from '../lib/random/types'
import { useI18n } from '../providers/I18nProvider'
type Theme = { bg: string; deep: string; cream: string; text: string }

type Props = {
  open: boolean
  onClose: () => void
  selected?: ItemType[]           // ← optionnel
  onChange?: (next: ItemType[]) => void // ← optionnel + no-op
  theme: Theme
}

const ALL: ItemType[] = ['image', 'video', 'quote', 'joke', 'fact', 'web']
const TEXT_TYPES: ItemType[] = ['quote', 'joke', 'fact']
type PickerOption = 'all' | 'image' | 'video' | 'web' | 'other'
const OPTIONS: PickerOption[] = ['all', 'image', 'video', 'web', 'other']

export default function ShufflePicker({
  open,
  onClose,
  selected = ALL,
  onChange = () => {},
  theme,
}: Props) {
  const { t } = useI18n()

  if (!open) return null

  const selSet = new Set(selected)
  const allSelected = selSet.size === ALL.length

  function optionTypes(value: Exclude<PickerOption, 'all'>): ItemType[] {
    if (value === 'other') return TEXT_TYPES
    return [value]
  }

  function commit(nextSet: Set<ItemType>) {
    if (typeof onChange === 'function') {
      const next = ALL.filter(t => nextSet.has(t))
      onChange(next)
    }
  }

  function handleToggle(value: PickerOption, checked: boolean) {
    if (value === 'all') {
      if (!checked) return
      commit(new Set(ALL))
      return
    }

    const values = optionTypes(value)

    if (allSelected) {
      commit(new Set(values))
      return
    }

    const next = new Set(selSet)
    if (checked) {
      values.forEach((type) => next.add(type))
    } else {
      values.forEach((type) => next.delete(type))
    }
    if (!next.size) {
      values.forEach((type) => next.add(type))
    }
    commit(next)
  }

  function isChecked(value: PickerOption) {
    if (value === 'all') return allSelected
    if (value === 'other') return TEXT_TYPES.some((type) => selSet.has(type))
    return selSet.has(value)
  }

  function optionLabel(value: PickerOption): string {
    if (value === 'all') return t('shuffle.all', 'All')
    if (value === 'image') return t('nav.images', 'Images')
    if (value === 'video') return t('nav.videos', 'Videos')
    if (value === 'web') return t('nav.web', 'Web')
    return t('nav.other', 'Other')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,.55)' }}>
      <div
        className="w-[min(92vw,560px)] rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: theme.text, color: theme.cream }}
        role="dialog"
        aria-modal="true"
        aria-label="Shuffle picker"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/20">
          <h3 className="font-inter font-bold">Shuffle picker</h3>
          <button onClick={onClose} className="text-2xl leading-none" aria-label="Close">×</button>
        </div>

        <div className="p-5 flex flex-col gap-3">
          {OPTIONS.map((option) => {
            const label = optionLabel(option)
            const checked = isChecked(option)
            const controlBorder = checked ? theme.cream : 'rgba(255,255,255,0.55)'
            return (
              <label
                key={option}
                className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 border focus-within:ring-2 focus-within:ring-white/60 focus-within:ring-offset-2 focus-within:ring-offset-transparent"
                style={{
                  borderColor: checked ? theme.cream : 'rgba(255,255,255,0.35)',
                  background: 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={(event) => handleToggle(option, event.target.checked)}
                />

                <span style={{ textTransform: 'capitalize', color: theme.cream }}>{label}</span>

                <span
                  aria-hidden
                  className="flex items-center justify-center rounded-full"
                  style={{
                    width: '26px',
                    height: '26px',
                    border: `2px solid ${controlBorder}`,
                    backgroundColor: checked ? theme.cream : 'transparent',
                    color: checked ? theme.text : theme.cream,
                    transition: 'transform 160ms ease, background-color 160ms ease, border-color 160ms ease',
                    transform: checked ? 'scale(1)' : 'scale(0.88)',
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 12 12"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{
                      opacity: checked ? 1 : 0,
                      transition: 'opacity 120ms ease',
                    }}
                  >
                    <path
                      d="M2 6l2.5 2.5L10 3"
                      stroke={checked ? theme.text : theme.cream}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </label>
            )
          })}
        </div>
      </div>
    </div>
  )
}
