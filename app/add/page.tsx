'use client'

import Link from 'next/link'

import MonoIcon from '@/components/MonoIcon'
import { DEFAULT_THEME } from '@/lib/theme'

export default function AddPage() {
  const theme = DEFAULT_THEME

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12"
      style={{ backgroundColor: theme.bg, color: theme.cream }}
    >
      <div className="w-full max-w-lg text-center space-y-6">
        <div className="flex justify-center">
          <MonoIcon src="/icons/plus.svg" color={theme.cream} size={56} />
        </div>
        <h1 className="text-4xl font-extrabold uppercase tracking-tight">Add</h1>
        <p className="text-lg font-inter opacity-80">
          This space is getting ready. Soon you will be able to submit new gems to shuffle.
        </p>
        <div className="flex justify-center">
          <Link
            href="/"
            className="px-6 py-3 rounded-full font-semibold uppercase tracking-wide"
            style={{ backgroundColor: theme.text, color: theme.cream }}
          >
            Back home
          </Link>
        </div>
      </div>
    </main>
  )
}
