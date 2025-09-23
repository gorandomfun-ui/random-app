'use client'

import { useEffect, useRef, useState } from 'react'
import MonoIcon from './MonoIcon'

type Theme = { bg: string; deep: string; cream: string; text: string }

export default function SocialPopover({ theme }: { theme: Theme }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onOut = (e: MouseEvent) => {
      if (!btnRef.current) return
      const root = btnRef.current.parentElement
      if (root && !root.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onOut)
    return () => document.removeEventListener('click', onOut)
  }, [])

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={btnRef}
        className="flex items-center gap-2"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
      >
        <MonoIcon src="/icons/social.svg" color={theme.cream} size={20} />
        <span className="font-inter font-semibold">social</span>
      </button>

      {open && (
        <div
          className="absolute bottom-full mb-2 left-0 w-[260px] rounded-xl border shadow-2xl text-sm overflow-hidden z-50"
          style={{ backgroundColor: theme.deep, borderColor: 'rgba(255,255,255,.25)', color: theme.cream }}
        >
          <ul className="py-2">
            {[
              ['TikTok','https://www.tiktok.com/'],
              ['Instagram','https://www.instagram.com/'],
              ['Threads','https://www.threads.net/'],
              ['X (Twitter)','https://twitter.com/'],
              ['Snapchat','https://www.snapchat.com/'],
            ].map(([label, href]) => (
              <li key={label}>
                <a
                  className="block px-3 py-2 transition"
                  style={{ color: theme.cream }}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.12)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                  onFocus={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.12)' }}
                  onBlur={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  )
}
