'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'

type Props = {
  trigger: number
  toSecond: boolean
  /* hauteur des lettres (au choix en px ou vh) */
  heightMobile?: number
  heightDesktop?: number
  vhMobile?: number
  vhDesktop?: number
  /* espacement entre lettres */
  gapMobile?: number
  gapDesktop?: number
  /* multi-ligne mobile */
  twoLineOnMobile?: boolean
  /* s’adapte à la largeur dispo (utile dans la modal) */
  fitToWidth?: boolean
  className?: string
}

const DUR = 1100
const BP = 1024

export default function LogoAnimated({
  trigger,
  toSecond,
  heightMobile = 32,
  heightDesktop = 22,
  vhMobile,
  vhDesktop,
  gapMobile = 2,
  gapDesktop = 2,
  twoLineOnMobile = false,
  fitToWidth = false,
  className = '',
}: Props) {
  const letters = useMemo(() => ['R', 'A', 'N', 'D', 'O', 'M'], [])
  const [animId, setAnimId] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [showSecond, setShowSecond] = useState<boolean>(toSecond)

  // fit-to-width
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const recalcScale = () => {
    if (!fitToWidth || !outerRef.current || !innerRef.current) return
    const ow = outerRef.current.clientWidth
    const iw = innerRef.current.scrollWidth
    if (iw) setScale(Math.min(1, ow / iw))
  }
  useEffect(() => {
    recalcScale()
    if (!fitToWidth || !outerRef.current) return
    const g: any = typeof globalThis !== 'undefined' ? globalThis : undefined
    const outer = outerRef.current
    let clean: (() => void) | undefined
    if (g?.ResizeObserver) {
      const ro = new g.ResizeObserver(() => recalcScale())
      ro.observe(outer!)
      clean = () => ro.disconnect()
    } else if (g?.addEventListener) {
      const onR = () => recalcScale()
      g.addEventListener('resize', onR)
      clean = () => g.removeEventListener('resize', onR)
    }
    return () => clean?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToWidth])

  // alterne 1 ⇄ 2 avec animation tirée au hasard
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      setShowSecond(toSecond)
      recalcScale()
      return
    }
    if (toSecond === showSecond) return
    setAnimId(Math.floor(Math.random() * 11)) // 0..10
    setPlaying(true)
    const t = setTimeout(() => {
      setPlaying(false)
      setShowSecond(toSecond)
    }, DUR)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, toSecond])

  const dir12 = !showSecond && toSecond
  const dir21 = showSecond && !toSecond

  const hMobile = vhMobile != null ? `${vhMobile}vh` : `${heightMobile}px`
  const hDesktop = vhDesktop != null ? `${vhDesktop}vh` : `${heightDesktop}px`

  return (
    <div ref={outerRef} className={className} style={{ whiteSpace: 'nowrap' }}>
      <div
        ref={innerRef}
        className={[
          'animated-word',
          playing ? `anim-${animId}` : '',
          dir12 ? 'dir-12' : '',
          dir21 ? 'dir-21' : '',
          twoLineOnMobile ? 'two-line-mobile' : 'one-line',
        ].join(' ')}
        style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}
      >
        {letters.map((L, i) => {
          let img1Cls = ''
          let img2Cls = ''
          if (playing) {
            if (dir12) {
              img1Cls = 'out'
              img2Cls = 'in'
            }
            if (dir21) {
              img1Cls = 'in'
              img2Cls = 'out'
            }
          } else {
            if (showSecond) {
              img1Cls = 'hidden'
              img2Cls = 'shown'
            } else {
              img1Cls = 'shown'
              img2Cls = 'hidden'
            }
          }
          return (
            <span key={L + i} className="letter-wrap">
              <img
                src={`/logo/${L}1.svg`}
                alt={`${L}1`}
                className={`letter img1 ${img1Cls}`}
                draggable={false}
                onLoad={recalcScale}
              />
              <img
                src={`/logo/${L}2.svg`}
                alt={`${L}2`}
                className={`letter img2 ${img2Cls}`}
                draggable={false}
                onLoad={recalcScale}
              />
            </span>
          )
        })}
      </div>

      <style jsx>{`
        /* ===== Layout ===== */
        .animated-word.one-line {
          display: inline-flex;
          align-items: center;
          gap: var(--gap, ${gapMobile}px);
          perspective: 2600px;
        }
        .animated-word.two-line-mobile {
          display: grid;
          grid-template-columns: repeat(3, auto);
          justify-content: center;
          align-items: center;
          column-gap: var(--gap, ${gapMobile}px);
          row-gap: var(--rowgap, 8px);
          perspective: 2600px;
        }
        @media (min-width: ${BP}px) {
          .animated-word.two-line-mobile {
            display: inline-flex;
            gap: var(--gap-desktop, ${gapDesktop}px);
          }
        }

        /* ===== Lettres ===== */
        .letter {
          height: ${hMobile};
          width: auto;
          display: block;
          object-fit: contain;
          transform-origin: center;
          backface-visibility: hidden;
          will-change: transform, opacity, filter;
        }
        @media (min-width: ${BP}px) {
          .animated-word .letter {
            height: ${hDesktop};
          }
        }
        .letter-wrap {
          position: relative;
          display: inline-block;
          transform-style: preserve-3d;
        }
        .img1 {
          position: relative;
          z-index: 1;
        }
        .img2 {
          position: absolute;
          left: 0;
          top: 0;
          z-index: 2;
        }
        .shown {
          opacity: 1;
          visibility: visible;
        }
        .hidden {
          opacity: 0;
          visibility: hidden;
        }

        /* ===== Animations puissantes (0..10) ===== */
        /* 0) ROLL-UP / DOWN */
        .anim-0.dir-12 .img1.out {
          animation: rollOldUp ${DUR}ms cubic-bezier(.12,.98,.04,1) forwards;
        }
        .anim-0.dir-12 .img2.in {
          animation: rollNewUp ${DUR}ms cubic-bezier(.12,.98,.04,1) forwards;
        }
        .anim-0.dir-21 .img2.out {
          animation: rollOldDown ${DUR}ms cubic-bezier(.12,.98,.04,1) forwards;
        }
        .anim-0.dir-21 .img1.in {
          animation: rollNewDown ${DUR}ms cubic-bezier(.12,.98,.04,1) forwards;
        }
        @keyframes rollOldUp {
          0% { opacity: 1; transform: translate3d(0,0,0) }
          30% { opacity: 0 }
          100% { opacity: 0; transform: translate3d(0,-520px,0) }
        }
        @keyframes rollNewUp {
          0% { opacity: 0; transform: translate3d(0,520px,0) }
          12% { opacity: 1 }
          100% { opacity: 1; transform: translate3d(0,0,0) }
        }
        @keyframes rollOldDown {
          0% { opacity: 1; transform: translate3d(0,0,0) }
          30% { opacity: 0 }
          100% { opacity: 0; transform: translate3d(0,520px,0) }
        }
        @keyframes rollNewDown {
          0% { opacity: 0; transform: translate3d(0,-520px,0) }
          12% { opacity: 1 }
          100% { opacity: 1; transform: translate3d(0,0,0) }
        }

        /* 1) WHEEL (Y) */
        .anim-1.dir-12 .img1.out,
        .anim-1.dir-21 .img2.out {
          animation: wheelOutL ${DUR}ms ease-in-out forwards;
        }
        .anim-1.dir-12 .img2.in,
        .anim-1.dir-21 .img1.in {
          animation: wheelInR ${DUR}ms ease-in-out forwards;
        }
        @keyframes wheelOutL {
          0% { opacity: 1; transform: rotateY(0) }
          30% { opacity: 0 }
          100% { opacity: 0; transform: rotateY(-260deg) }
        }
        @keyframes wheelInR {
          0% { opacity: 0; transform: rotateY(260deg) }
          10% { opacity: 1 }
          100% { opacity: 1; transform: rotateY(0) }
        }

        /* 2) SWIPE ULTRA */
        .anim-2.dir-12 .img1.out { animation: swipeLeftOut ${DUR}ms cubic-bezier(.16,1,.06,1) forwards; }
        .anim-2.dir-12 .img2.in  { animation: swipeLeftIn  ${DUR}ms cubic-bezier(.16,1,.06,1) forwards; }
        .anim-2.dir-21 .img2.out { animation: swipeRightOut ${DUR}ms cubic-bezier(.16,1,.06,1) forwards; }
        .anim-2.dir-21 .img1.in  { animation: swipeRightIn  ${DUR}ms cubic-bezier(.16,1,.06,1) forwards; }
        @keyframes swipeLeftOut  { 0%{opacity:1;transform:translate3d(0,0,0)} 30%{opacity:0} 100%{opacity:0;transform:translate3d(-820px,0,0)} }
        @keyframes swipeLeftIn   { 0%{opacity:0;transform:translate3d(820px,0,0)} 12%{opacity:1} 88%{transform:translate3d(-20px,0,0)} 100%{transform:translate3d(0,0,0)} }
        @keyframes swipeRightOut { 0%{opacity:1;transform:translate3d(0,0,0)} 30%{opacity:0} 100%{opacity:0;transform:translate3d(820px,0,0)} }
        @keyframes swipeRightIn  { 0%{opacity:0;transform:translate3d(-820px,0,0)} 12%{opacity:1} 88%{transform:translate3d(20px,0,0)} 100%{transform:translate3d(0,0,0)} }

        /* 3) FLIP COUNTDOWN */
        .anim-3 .letter-wrap { animation: tickWrap ${DUR}ms ease-in-out both; }
        .anim-3.dir-12 .img1.out, .anim-3.dir-21 .img2.out { animation: flipOut ${DUR}ms ease-in-out forwards; }
        .anim-3.dir-12 .img2.in,  .anim-3.dir-21 .img1.in  { animation: flipIn  ${DUR}ms ease-in-out forwards; }
        @keyframes tickWrap { 0%{transform:rotate(0)} 22%{transform:rotate(3deg)} 48%{transform:rotate(-3deg)} 74%{transform:rotate(1.6deg)} 100%{transform:rotate(0)} }
        @keyframes flipOut  { 0%{opacity:1;transform:rotateX(0)} 30%{opacity:0} 100%{opacity:0;transform:rotateX(-300deg)} }
        @keyframes flipIn   { 0%{opacity:0;transform:rotateX(300deg) scale(1.08)} 10%{opacity:1} 100%{opacity:1;transform:rotateX(0) scale(1)} }

        /* 4) EXPLODE & GATHER */
        .anim-4 .letter-wrap { animation: scatterWrap ${DUR}ms cubic-bezier(.18,.99,.12,1) both; }
        .anim-4.dir-12 .img1.out, .anim-4.dir-21 .img2.out { animation: explodeOut ${DUR}ms cubic-bezier(.18,.99,.12,1) forwards; }
        .anim-4.dir-12 .img2.in,  .anim-4.dir-21 .img1.in  { animation: gatherIn   ${DUR}ms cubic-bezier(.18,.99,.12,1) forwards; }
        @keyframes scatterWrap { 0%{transform:scale(.9)} 52%{transform:scale(1.26)} 100%{transform:scale(1)} }
        @keyframes explodeOut  { 0%{opacity:1;transform:translate3d(0,0,0) rotate(0) scale(1)} 28%{opacity:0} 100%{opacity:0;transform:translate3d(300px,-260px,0) rotate(-42deg) scale(.28);filter:blur(1.6px)} }
        @keyframes gatherIn    { 0%{opacity:0;transform:translate3d(-300px,260px,0) rotate(26deg) scale(1.6);filter:blur(1.2px)} 14%{opacity:1} 100%{opacity:1;transform:translate3d(0,0,0) rotate(0) scale(1);filter:blur(0)} }

        /* 5) CANNON / IMPACT */
        .anim-5.dir-12 .img1.out, .anim-5.dir-21 .img2.out { animation: impactOut ${DUR}ms cubic-bezier(.1,.9,.03,1) forwards; }
        .anim-5.dir-12 .img2.in,  .anim-5.dir-21 .img1.in  { animation: cannonIn  ${DUR}ms cubic-bezier(.1,.9,.03,1) forwards; }
        @keyframes cannonIn  { 0%{opacity:0;transform:translate3d(-980px,0,0) scale(1.2) skewX(-10deg)} 42%{opacity:1;transform:translate3d(22px,0,0)} 100%{opacity:1;transform:translate3d(0,0,0) skewX(0)} }
        @keyframes impactOut { 0%{opacity:1;transform:translate3d(0,0,0)} 28%{opacity:0} 100%{opacity:0;transform:translate3d(980px,0,0) rotate(24deg)} }

        /* 6) MEGA-EXPLODE (+ shake subtil du mot) */
        .anim-6 { animation: shake ${DUR}ms ease-in-out both; }
        .anim-6.dir-12 .img1.out, .anim-6.dir-21 .img2.out { animation: blastOut ${DUR}ms cubic-bezier(.12,1,.06,1) forwards; }
        .anim-6.dir-12 .img2.in,  .anim-6.dir-21 .img1.in  { animation: blastIn  ${DUR}ms cubic-bezier(.2,.95,.08,1) forwards; }
        .anim-6 .letter-wrap:nth-child(1) .img1.out, .anim-6 .letter-wrap:nth-child(1) .img2.out { --dx:-520px; --dy:-360px; --rot:-40deg; }
        .anim-6 .letter-wrap:nth-child(2) .img1.out, .anim-6 .letter-wrap:nth-child(2) .img2.out { --dx: 560px; --dy:-340px; --rot: 42deg; }
        .anim-6 .letter-wrap:nth-child(3) .img1.out, .anim-6 .letter-wrap:nth-child(3) .img2.out { --dx:-500px; --dy: 360px; --rot:-36deg; }
        .anim-6 .letter-wrap:nth-child(4) .img1.out, .anim-6 .letter-wrap:nth-child(4) .img2.out { --dx: 520px; --dy: 360px; --rot: 38deg; }
        .anim-6 .letter-wrap:nth-child(5) .img1.out, .anim-6 .letter-wrap:nth-child(5) .img2.out { --dx:-440px; --dy:-440px; --rot:-44deg; }
        .anim-6 .letter-wrap:nth-child(6) .img1.out, .anim-6 .letter-wrap:nth-child(6) .img2.out { --dx: 480px; --dy: 420px; --rot: 44deg; }
        @keyframes blastOut { 0%{opacity:1;transform:translate3d(0,0,0) scale(1) rotate(0);filter:blur(0)} 28%{opacity:0} 100%{opacity:0;transform:translate3d(var(--dx,520px),var(--dy,360px),0) scale(.26) rotate(var(--rot,40deg));filter:blur(3.4px) drop-shadow(0 5px 12px rgba(0,0,0,.32))} }
        @keyframes blastIn  { 0%{opacity:0;transform:scale(1.7) translate3d(0,36px,0) skewX(10deg);filter:blur(1.4px)} 16%{opacity:1} 100%{opacity:1;transform:scale(1) translate3d(0,0,0) skewX(0);filter:blur(0)} }
        @keyframes shake { 0%{transform:translate3d(0,0,0)} 25%{transform:translate3d(3px,-3px,0)} 50%{transform:translate3d(-3px,3px,0)} 75%{transform:translate3d(2px,0,0)} 100%{transform:translate3d(0,0,0)} }

        /* 7) WARP-SWIPE */
        .anim-7.dir-12 .img1.out { animation: warpOutL ${DUR}ms cubic-bezier(.14,1,.06,1) forwards; }
        .anim-7.dir-12 .img2.in  { animation: warpInL  ${DUR}ms cubic-bezier(.14,1,.06,1) forwards; }
        .anim-7.dir-21 .img2.out { animation: warpOutR ${DUR}ms cubic-bezier(.14,1,.06,1) forwards; }
        .anim-7.dir-21 .img1.in  { animation: warpInR  ${DUR}ms cubic-bezier(.14,1,.06,1) forwards; }
        @keyframes warpOutL { 0%{opacity:1;transform:skewX(0) scale(1)} 30%{opacity:0} 100%{opacity:0;transform:translate3d(-980px,0,0) skewX(-18deg) scale(.78)} }
        @keyframes warpInL  { 0%{opacity:0;transform:translate3d(980px,0,0) skewX(20deg) scale(1.24)} 12%{opacity:1} 100%{opacity:1;transform:translate3d(0,0,0) skewX(0) scale(1)} }
        @keyframes warpOutR { 0%{opacity:1;transform:skewX(0) scale(1)} 30%{opacity:0} 100%{opacity:0;transform:translate3d(980px,0,0) skewX(18deg) scale(.78)} }
        @keyframes warpInR  { 0%{opacity:0;transform:translate3d(-980px,0,0) skewX(-20deg) scale(1.24)} 12%{opacity:1} 100%{opacity:1;transform:translate3d(0,0,0) skewX(0) scale(1)} }

        /* 8) HYPER-COUNTDOWN */
        .anim-8 .letter-wrap { animation: hyperTick ${DUR}ms ease-in-out both; }
        .anim-8.dir-12 .img1.out, .anim-8.dir-21 .img2.out { animation: hyperOut ${DUR}ms ease-in-out forwards; }
        .anim-8.dir-12 .img2.in,  .anim-8.dir-21 .img1.in  { animation: hyperIn  ${DUR}ms ease-in-out forwards; }
        @keyframes hyperTick { 0%{transform:scale(1)} 20%{transform:scale(1.12) rotate(3.2deg)} 48%{transform:scale(.9) rotate(-3.2deg)} 76%{transform:scale(1.06)} 100%{transform:scale(1)} }
        @keyframes hyperOut  { 0%{opacity:1;transform:rotateX(0) scale(1)} 28%{opacity:0} 100%{opacity:0;transform:rotateX(-340deg) scale(.74)} }
        @keyframes hyperIn   { 0%{opacity:0;transform:rotateX(340deg) scale(1.26)} 10%{opacity:1} 100%{opacity:1;transform:rotateX(0) scale(1)} }

        /* 9) SHOCKWAVE */
        .anim-9 .letter-wrap { animation: shockWaveWrap ${DUR}ms cubic-bezier(.18,.98,.12,1) both; }
        .anim-9.dir-12 .img1.out, .anim-9.dir-21 .img2.out { animation: shockOut ${DUR}ms cubic-bezier(.18,.98,.12,1) forwards; }
        .anim-9.dir-12 .img2.in,  .anim-9.dir-21 .img1.in  { animation: shockIn  ${DUR}ms cubic-bezier(.18,.98,.12,1) forwards; }
        @keyframes shockWaveWrap { 0%{filter:none} 28%{filter:drop-shadow(0 8px 22px rgba(0,0,0,.35))} 100%{filter:none} }
        @keyframes shockOut { 0%{opacity:1;transform:scale(1)} 26%{opacity:0} 100%{opacity:0;transform:scale(.66) translate3d(0,-24px,0)} }
        @keyframes shockIn  { 0%{opacity:0;transform:scale(1.46) translate3d(0,24px,0)} 12%{opacity:1} 100%{opacity:1;transform:scale(1) translate3d(0,0,0)} }

        /* 10) SUPER-SHOCKWAVE */
        .anim-10 .letter-wrap { animation: superWrap ${DUR}ms cubic-bezier(.16,1,.08,1) both; }
        .anim-10.dir-12 .img1.out, .anim-10.dir-21 .img2.out { animation: superOut ${DUR}ms cubic-bezier(.16,1,.08,1) forwards; }
        .anim-10.dir-12 .img2.in,  .anim-10.dir-21 .img1.in  { animation: superIn  ${DUR}ms cubic-bezier(.16,1,.08,1) forwards; }
        @keyframes superWrap { 0%{filter:none} 40%{filter:drop-shadow(0 10px 28px rgba(0,0,0,.38))} 100%{filter:none} }
        @keyframes superOut { 0%{opacity:1;transform:translate3d(0,0,0) rotateZ(0) scale(1)} 28%{opacity:0} 100%{opacity:0;transform:translate3d(0,-120px,0) rotateZ(-24deg) scale(.68);filter:blur(1px)} }
        @keyframes superIn  { 0%{opacity:0;transform:translate3d(0,120px,0) rotateZ(18deg) scale(1.34);filter:blur(.8px)} 12%{opacity:1} 100%{opacity:1;transform:translate3d(0,0,0) rotateZ(0) scale(1);filter:none} }

        /* Accessibilité */
        @media (prefers-reduced-motion: reduce) {
          .animated-word * { animation: none !important; transition: none !important; }
          .img1.hidden, .img2.hidden { visibility: hidden; opacity: 0; }
          .img1.shown,  .img2.shown  { visibility: visible; opacity: 1; }
        }
      `}</style>
    </div>
  )
}
