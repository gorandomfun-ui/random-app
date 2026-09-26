'use client'

/**
 * The glitch behind a game's page, calmer than Random's and in the theme's
 * own colours rather than cyan and magenta: the game's title card blurred
 * and dark, a few slow torn fragments of it, thin bars of signal in shades
 * of the accent, fine scan lines. While a game is under way it fades back
 * further and holds still, so it never pulls the eye from the play.
 */

import { useMemo, type CSSProperties } from 'react'

type Style = CSSProperties & { '--arcade-image': string; '--arcade-accent': string }

export default function ArcadeBackdrop({ image, accent, playing }: { image: string | null; accent: string; playing: boolean }) {
  const style = useMemo<Style>(() => ({ '--arcade-image': image ? `url(${JSON.stringify(image)})` : 'none', '--arcade-accent': accent }), [image, accent])
  const fragments = useMemo(() => Array.from({ length: 9 }, (_, i) => ({
    top: `${8 + ((i * 37) % 84)}%`,
    left: `${((i * 29) % 30) - 10}%`,
    width: `${60 + ((i * 23) % 50)}%`,
    height: i % 3 === 0 ? `${10 + (i % 4) * 4}px` : `${1 + (i % 2)}px`,
    animationDelay: `${-i * 1330}ms`,
  })), [])
  return (
    <div className={`arcade-bg${playing ? ' arcade-bg--playing' : ''}`} style={style} aria-hidden="true">
      <div className="arcade-bg__media" />
      <div className="arcade-bg__fragments">{fragments.map((f, i) => <span key={i} style={f} />)}</div>
      <div className="arcade-bg__signal" />
      <div className="arcade-bg__tone" />
      <div className="arcade-bg__lines" />
      <style jsx>{`
        .arcade-bg { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; background: #070708; transition: opacity 600ms ease; }
        .arcade-bg--playing { opacity: 0.55; }
        .arcade-bg__media { position: absolute; inset: -8%; background-image: var(--arcade-image); background-size: cover; background-position: center; filter: blur(6px) saturate(1.4) brightness(0.3); opacity: 0.7; transform: scale(1.12); animation: arcade-drift 24s steps(8, end) infinite alternate; }
        .arcade-bg__fragments { position: absolute; inset: 0; overflow: hidden; mix-blend-mode: screen; }
        .arcade-bg__fragments span { position: absolute; display: block; background-image: var(--arcade-image); background-size: 120vw auto; background-position: center; opacity: 0.22; box-shadow: 4px 0 color-mix(in srgb, var(--arcade-accent) 30%, transparent), -4px 0 color-mix(in srgb, var(--arcade-accent) 18%, #000); animation: arcade-fragment 11s steps(1, end) infinite; }
        .arcade-bg__signal {
          position: absolute; inset: -2% -5%; mix-blend-mode: screen; opacity: 0.5;
          background:
            linear-gradient(90deg, transparent 0 8%, color-mix(in srgb, var(--arcade-accent) 80%, #fff) 8% 21%, transparent 21% 26%, var(--arcade-accent) 26% 50%, transparent 50% 100%) 0 14% / 86% 1.4px no-repeat,
            linear-gradient(90deg, transparent 0 20%, color-mix(in srgb, var(--arcade-accent) 55%, #000) 20% 64%, color-mix(in srgb, var(--arcade-accent) 60%, #fff) 64% 70%, transparent 70% 100%) 12% 68% / 90% 2px no-repeat,
            linear-gradient(90deg, var(--arcade-accent) 0 12%, transparent 12% 34%, color-mix(in srgb, var(--arcade-accent) 40%, #fff) 34% 58%, transparent 58% 100%) -8% 86% / 74% 1.2px no-repeat;
          animation: arcade-signal 12s steps(1, end) infinite;
        }
        .arcade-bg__tone { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.62) 46%, rgba(0, 0, 0, 0.92)), radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--arcade-accent) 14%, transparent), transparent 58%); }
        .arcade-bg__lines { position: absolute; inset: 0; opacity: 0.4; mix-blend-mode: screen; background: repeating-linear-gradient(180deg, color-mix(in srgb, var(--arcade-accent) 12%, transparent) 0 0.5px, rgba(0, 0, 0, 0.12) 0.5px 1px, transparent 1px 2.5px); }
        .arcade-bg--playing .arcade-bg__media, .arcade-bg--playing .arcade-bg__fragments span, .arcade-bg--playing .arcade-bg__signal { animation-play-state: paused; }
        @keyframes arcade-drift { 0% { transform: translate3d(-0.5%, -0.3%, 0) scale(1.12); } 50% { transform: translate3d(0.6%, 0.4%, 0) scale(1.14); } 100% { transform: translate3d(-0.2%, 0.6%, 0) scale(1.13); } }
        @keyframes arcade-fragment { 0%, 91%, 100% { opacity: 0.18; transform: translateX(0); } 92% { opacity: 0.5; transform: translateX(14px); } 94% { opacity: 0.3; transform: translateX(-7px); } }
        @keyframes arcade-signal { 0%, 100% { transform: translate3d(0, 0, 0); opacity: 0.5; } 33% { transform: translate3d(0, 18vh, 0); opacity: 0.35; } 66% { transform: translate3d(0, -9vh, 0); opacity: 0.45; } }
        @media (prefers-reduced-motion: reduce) { .arcade-bg__media, .arcade-bg__fragments span, .arcade-bg__signal { animation: none; } }
      `}</style>
    </div>
  )
}
