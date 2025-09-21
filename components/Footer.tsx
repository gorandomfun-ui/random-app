'use client'

import { useState, useRef, useEffect } from 'react'
import SocialPopover from './SocialPopover'

export type Theme = { bg: string; deep: string; cream: string; text: string }

export default function Footer({ theme }: { theme: Theme }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const [above, setAbove] = useState(false)

  useEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const H = 220
    setAbove(r.bottom + H > window.innerHeight - 16)
  }, [open])

  return (
    <footer className="w-full px-4 sm:px-6 py-4 flex items-center justify-between">
      <a href="/privacy" className="flex items-center gap-2 underline" style={{ color: theme.cream }}>
        <span className="text-lg">ℹ️</span> <span>Legal notice.</span>
      </a>

      <div className="relative">
        <button
          ref={btnRef}
          onClick={() => setOpen((s) => !s)}
          className="flex items-center gap-2 underline"
          style={{ color: theme.cream }}
          aria-label="social"
        >
          <span className="text-lg">📶</span> <span>social</span>
        </button>

        {open && (
          <div
            className={`absolute ${above ? 'bottom-full mb-2' : 'top-full mt-2'} right-0`}
            onMouseLeave={() => setOpen(false)}
          >
            <SocialPopover theme={theme} />
          </div>
        )}
      </div>
    </footer>
  )
}
