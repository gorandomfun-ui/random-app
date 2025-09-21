// app/fonts.ts
import { Inter_Tight, Tomorrow } from 'next/font/google'

export const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['400','700','900'],
  variable: '--font-inter-tight',
  display: 'swap',
})

export const tomorrow = Tomorrow({
  subsets: ['latin'],
  weight: ['700','900'],
  variable: '--font-tomorrow',
  display: 'swap',
})
