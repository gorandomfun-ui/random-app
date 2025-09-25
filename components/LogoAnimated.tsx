'use client'

/* eslint-disable @next/next/no-img-element */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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
const ANIM_VARIANTS = 6
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
  const recalcScale = useCallback(() => {
    if (!fitToWidth || !outerRef.current || !innerRef.current) return
    const ow = outerRef.current.clientWidth
    const iw = innerRef.current.scrollWidth
    if (iw) setScale(Math.min(1, ow / iw))
  }, [fitToWidth])

  useEffect(() => {
    recalcScale()
    if (!fitToWidth || typeof window === 'undefined') return

    const node = outerRef.current
    const resizeObserver = typeof ResizeObserver !== 'undefined' && node
      ? new ResizeObserver(() => recalcScale())
      : null
    if (resizeObserver && node) resizeObserver.observe(node)

    const onResize = () => recalcScale()
    window.addEventListener('resize', onResize)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [fitToWidth, recalcScale])

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
    setAnimId(Math.floor(Math.random() * ANIM_VARIANTS))
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
          playing ? 'is-playing' : '',
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

        /* ===== Animation Variants (0..5) ===== */
        .animated-word.is-playing .letter-wrap {
          overflow: visible;
        }
        .animated-word.is-playing .letter {
          will-change: transform, opacity, filter;
        }

        /* Pulse ignite */
        .anim-0.is-playing .letter-wrap { animation: pulseWrap 1100ms cubic-bezier(.25,1,.35,1) both; }
        .anim-0.dir-12 .img1.out,
        .anim-0.dir-21 .img2.out { animation: pulseFadeOut 1100ms cubic-bezier(.22,.95,.21,.99) forwards; }
        .anim-0.dir-12 .img2.in,
        .anim-0.dir-21 .img1.in { animation: pulsePopIn 1100ms cubic-bezier(.22,.95,.21,.99) forwards; }

        /* Tilt flip */
        .anim-1.is-playing .letter-wrap { animation: tiltWrap 1100ms ease-in-out both; }
        .anim-1.dir-12 .img1.out,
        .anim-1.dir-21 .img2.out { animation: tiltExit 1100ms ease-in-out forwards; }
        .anim-1.dir-12 .img2.in,
        .anim-1.dir-21 .img1.in { animation: tiltEnter 1100ms ease-in-out forwards; }

        /* Glitch burst */
        .anim-2.is-playing .letter-wrap { animation: glitchWrap 1100ms steps(4, end) forwards; }
        .anim-2.dir-12 .img1.out,
        .anim-2.dir-21 .img2.out { animation: glitchExit 1100ms linear forwards; }
        .anim-2.dir-12 .img2.in,
        .anim-2.dir-21 .img1.in { animation: glitchEnter 1100ms linear forwards; }

        /* Warp stretch */
        .anim-3.is-playing .letter-wrap { animation: warpWrap 1100ms cubic-bezier(.26,1,.32,1) both; }
        .anim-3.dir-12 .img1.out,
        .anim-3.dir-21 .img2.out { animation: warpExit 1100ms cubic-bezier(.26,1,.32,1) forwards; }
        .anim-3.dir-12 .img2.in,
        .anim-3.dir-21 .img1.in { animation: warpEnter 1100ms cubic-bezier(.26,1,.32,1) forwards; }

        /* Slide smear */
        .anim-4.is-playing .letter-wrap { animation: smearWrap 1100ms cubic-bezier(.18,.96,.16,1) both; }
        .anim-4.dir-12 .img1.out,
        .anim-4.dir-21 .img2.out { animation: smearExit 1100ms cubic-bezier(.18,.96,.16,1) forwards; }
        .anim-4.dir-12 .img2.in,
        .anim-4.dir-21 .img1.in { animation: smearEnter 1100ms cubic-bezier(.18,.96,.16,1) forwards; }

        /* Ripple bounce */
        .anim-5.is-playing .letter-wrap { animation: rippleWrap 1100ms cubic-bezier(.25,.95,.27,1) both; }
        .anim-5.dir-12 .img1.out,
        .anim-5.dir-21 .img2.out { animation: rippleExit 1100ms cubic-bezier(.25,.95,.27,1) forwards; }
        .anim-5.dir-12 .img2.in,
        .anim-5.dir-21 .img1.in { animation: rippleEnter 1100ms cubic-bezier(.25,.95,.27,1) forwards; }

        @keyframes pulseWrap { 0%%{transform:scale(1)} 45%%{transform:scale(1.04)} 100%%{transform:scale(1)} }
        @keyframes pulseFadeOut { 0%%{opacity:1;transform:scale(1);filter:none} 30%%{transform:scale(1.12)} 60%%{opacity:.58;transform:scale(.86);filter:blur(.6px)} 100%%{opacity:0;transform:scale(.72);filter:blur(1.1px)} }
        @keyframes pulsePopIn { 0%%{opacity:0;transform:scale(1.3);filter:blur(1.6px)} 18%%{opacity:1} 45%%{transform:scale(.94);filter:blur(.4px)} 100%%{transform:scale(1);filter:none} }

        @keyframes tiltWrap { 0%%{transform:rotateX(0)} 45%%{transform:rotateX(3deg)} 100%%{transform:rotateX(0)} }
        @keyframes tiltExit { 0%%{opacity:1;transform:rotateY(0deg) translateZ(0);filter:none} 40%%{opacity:.45} 100%%{opacity:0;transform:rotateY(-80deg) translateZ(-60px);filter:blur(1px)} }
        @keyframes tiltEnter { 0%%{opacity:0;transform:rotateY(80deg) translateZ(-60px) scale(1.02);filter:blur(1.2px)} 25%%{opacity:1} 100%%{opacity:1;transform:rotateY(0) translateZ(0) scale(1);filter:none} }

        @keyframes glitchWrap { 0%%,100%%{transform:translate3d(0,0,0)} 20%%{transform:translate3d(-1px,1px,0)} 40%%{transform:translate3d(1px,-1px,0)} 60%%{transform:translate3d(-2px,0,0)} 80%%{transform:translate3d(2px,0,0)} }
        @keyframes glitchExit { 0%%{opacity:1;transform:translate3d(0,0,0);filter:none} 20%%{filter:drop-shadow(-2px 0 #ff1266) drop-shadow(2px 0 #00f6ff)} 45%%{opacity:.6;transform:translate3d(-8px,-2px,0) skewX(-4deg);filter:drop-shadow(-6px 0 #ff1266) drop-shadow(6px 0 #00f6ff)} 70%%{opacity:.25;transform:translate3d(9px,2px,0) skewX(5deg) scale(.94);filter:drop-shadow(8px 0 rgba(0,246,255,.6))} 100%%{opacity:0;transform:translate3d(-18px,0,0) scale(.82);filter:blur(1.4px)} }
        @keyframes glitchEnter { 0%%{opacity:0;transform:translate3d(16px,0,0) skewX(8deg) scale(1.18);filter:drop-shadow(6px 0 #00f6ff) drop-shadow(-6px 0 #ff1266)} 20%%{opacity:1;transform:translate3d(-4px,1px,0) skewX(-4deg)} 40%%{transform:translate3d(3px,-1px,0) skewX(2deg)} 65%%{transform:translate3d(-2px,0,0) skewX(-1deg)} 100%%{transform:translate3d(0,0,0) skewX(0) scale(1);filter:none} }

        @keyframes warpWrap { 0%%{transform:scaleY(1)} 40%%{transform:scaleY(1.14)} 100%%{transform:scaleY(1)} }
        @keyframes warpExit { 0%%{opacity:1;transform:scaleX(1) skewX(0);filter:none} 50%%{opacity:.4;transform:scaleX(.58) skewX(-12deg);filter:blur(.4px)} 100%%{opacity:0;transform:scaleX(.32) skewX(-18deg);filter:blur(1.2px)} }
        @keyframes warpEnter { 0%%{opacity:0;transform:scaleX(1.8) skewX(18deg);filter:blur(1.4px)} 30%%{opacity:1} 70%%{transform:scaleX(1.04) skewX(-2deg)} 100%%{transform:scaleX(1) skewX(0);filter:none} }

        @keyframes smearWrap { 0%%{transform:skewX(0)} 50%%{transform:skewX(-6deg)} 100%%{transform:skewX(0)} }
        @keyframes smearExit { 0%%{opacity:1;transform:translateX(0);filter:none} 50%%{opacity:.35;transform:translateX(-120px);filter:blur(6px) saturate(1.2)} 100%%{opacity:0;transform:translateX(-260px);filter:blur(12px) saturate(1.35)} }
        @keyframes smearEnter { 0%%{opacity:0;transform:translateX(260px);filter:blur(12px) saturate(1.35)} 35%%{opacity:1} 70%%{filter:blur(3px)} 100%%{transform:translateX(0);filter:none} }

        @keyframes rippleWrap { 0%%{transform:translateY(0)} 25%%{transform:translateY(-6px) rotate(-1.2deg)} 50%%{transform:translateY(4px) rotate(1deg)} 75%%{transform:translateY(-2px) rotate(-.6deg)} 100%%{transform:translateY(0)} }
        @keyframes rippleExit { 0%%{opacity:1;transform:translateY(0) scale(1);filter:none} 40%%{opacity:.55;transform:translateY(-8px) scale(.92);filter:blur(.6px)} 100%%{opacity:0;transform:translateY(22px) scale(.75);filter:blur(1.4px)} }
        @keyframes rippleEnter { 0%%{opacity:0;transform:translateY(-22px) scale(1.2);filter:blur(1.2px)} 30%%{opacity:1} 65%%{transform:translateY(4px) scale(.98)} 100%%{transform:translateY(0) scale(1);filter:none} }
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
