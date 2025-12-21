'use client'

import Image from 'next/image'

type Orientation = 'horizontal' | 'vertical'

export default function HouseAd({ orientation }: { orientation: Orientation }) {
  if (orientation === 'horizontal') {
    return (
      <a
        href="https://random.app/?utm_source=house-ad"
        target="_blank"
        rel="noreferrer"
        className="flex h-full w-full items-center justify-between rounded-2xl border border-white/10 bg-gradient-to-r from-[#1f1c2c] via-[#2b5876] to-[#4e4376] px-3 text-[11px] text-white"
      >
        <span className="font-semibold tracking-[0.25em] uppercase">Random</span>
        <span className="mx-2 text-xs font-medium opacity-90">House inventory • 320×50</span>
        <span className="rounded-full bg-white/20 px-3 py-1 font-semibold uppercase tracking-wide">Info</span>
      </a>
    )
  }

  return (
    <a
      href="https://random.app/?utm_source=house-ad"
      target="_blank"
      rel="noreferrer"
      className="group flex h-full w-full flex-col items-center justify-center gap-4 rounded-2xl border border-white/15 bg-gradient-to-r from-[#1f1c2c] via-[#2b5876] to-[#4e4376] px-4 py-4 text-white"
    >
      <div className="flex flex-col items-center justify-center gap-2 text-center">
        <span className="text-[10px] uppercase tracking-[0.35em] opacity-70">Random</span>
        <Image src="/logo/R1.svg" alt="Random logo" width={48} height={32} className="h-8 w-auto" />
      </div>
      <div className="flex flex-1 flex-col gap-1 text-center">
        <span className="font-semibold text-sm sm:text-base">Promote your brand here</span>
        <span className="text-xs opacity-80">Contextual reach • House fallback creative</span>
      </div>
      <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold tracking-wide group-hover:bg-white/25">
        Learn more
      </span>
    </a>
  )
}
