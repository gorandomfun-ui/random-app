import AadsFooterSlot from '@/components/AadsFooterSlot'

export const metadata = {
  title: 'A-Ads Test — Banner Mobile',
  robots: {
    index: false,
    follow: false,
  },
}

export default function AdsTestBannerMobilePage() {
  return (
    <div className="min-h-screen w-full bg-neutral-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-6 py-10 text-center">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-neutral-500">Internal test</p>
          <h1 className="mt-2 text-2xl font-semibold">A-Ads — Banner Mobile 320×100</h1>
        </div>
        <div className="w-full rounded-3xl border border-white/10 bg-neutral-900/40 p-6">
          <div className="flex items-center justify-center" style={{ width: 320, height: 100 }}>
            <AadsFooterSlot variant="mobile" label="Advertisement" refreshTarget={null} />
          </div>
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
