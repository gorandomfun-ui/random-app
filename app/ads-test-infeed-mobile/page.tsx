import AadsInlineContentAd from '@/components/AadsInlineContentAd'

export const metadata = {
  title: 'A-Ads Test — In-feed Mobile',
  robots: {
    index: false,
    follow: false,
  },
}

export default function AdsTestInfeedMobilePage() {
  return (
    <div className="min-h-screen w-full bg-neutral-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-6 py-10 text-center">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-neutral-500">Internal test</p>
          <h1 className="mt-2 text-2xl font-semibold">A-Ads — In-feed Mobile 300×250</h1>
        </div>
        <div className="w-full">
          <AadsInlineContentAd label="Advertisement" variant="mobile" forceVisible refreshTarget={null} />
        </div>
      </div>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            #cookie-banner,
            #cookie-settings-modal {
              display: none !important;
            }
          `,
        }}
      />
    </div>
  )
}
