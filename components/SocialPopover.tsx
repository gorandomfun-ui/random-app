'use client'

import { useEffect, useRef, useState } from 'react'

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
        <img src="/icons/social.svg" className="h-5 w-5" alt="" />
        <span className="font-inter font-semibold">social</span>
      </button>

      {open && (
        <div
          className="absolute bottom-full mb-2 left-0 w-[260px] rounded-xl border shadow-2xl text-sm overflow-hidden z-50 text-white"
          style={{ backgroundColor: theme.deep, borderColor: 'rgba(255,255,255,.25)' }}
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
                <a className="block px-3 py-2 hover:bg-white/10" href={href} target="_blank" rel="noreferrer">{label}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  )
}
