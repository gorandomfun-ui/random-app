import AadsInlineContentAd from '@/components/AadsInlineContentAd'

export const metadata = {
  title: 'A-Ads Test — In-feed Desktop',
  robots: {
    index: false,
    follow: false,
  },
}

export default function AdsTestInfeedDesktopPage() {
  return (
    <div className="min-h-screen w-full bg-neutral-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 py-10 text-center">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-neutral-500">Internal test</p>
          <h1 className="mt-2 text-2xl font-semibold">A-Ads — In-feed Desktop 300×250 / 336×280</h1>
        </div>
        <div className="w-full max-w-2xl">
          <AadsInlineContentAd label="Advertisement" variant="desktop" forceVisible refreshTarget={null} />
        </div>
      </div>
      <style jsx global>{`
        #cookie-banner,
        #cookie-settings-modal {
          display: none !important;
        }
      `}</style>
    </div>
  )
}
