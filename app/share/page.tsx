/* app/share/page.tsx */
import LogoAnimated from '@/components/LogoAnimated'

export const metadata = { title: 'Random · Share', description: 'Random share card' }

export default function SharePage({ searchParams }: { searchParams: Record<string, string> }) {
  const title = decodeURIComponent(searchParams.title || 'Random')
  const url = decodeURIComponent(searchParams.url || 'https://gorandom.fun')
  const img = searchParams.img ? decodeURIComponent(searchParams.img) : null

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: '#111', color: '#fff' }}>
      <div className="w-full max-w-[900px] rounded-3xl p-6 md:p-10"
        style={{ background: '#222', boxShadow: '0 12px 40px rgba(0,0,0,.45)' }}>
        <div className="flex items-center justify-center mb-4">
          <LogoAnimated trigger={0} toSecond={false} heightDesktop={26} heightMobile={30} gapDesktop={6} gapMobile={6} />
        </div>

        {img && (
          <div className="mb-6 flex justify-center">
            {/* preview si fourni */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img} alt="" className="max-h-[380px] rounded-xl shadow-lg" />
          </div>
        )}

        <h1 className="text-2xl md:text-3xl font-semibold text-center mb-4">{title}</h1>

        <div className="flex justify-center">
          <a
            href={url}
            className="px-6 py-3 rounded-full"
            style={{ background: '#e11d48', color: '#fff', fontWeight: 700 }}
          >
            Visit content
          </a>
        </div>
      </div>
    </main>
  )
}
