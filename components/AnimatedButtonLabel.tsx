'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  text: string
  color: string
  trigger: number
  toSecond?: boolean
}

const VARIANTS = 6
const DURATION = 1100

export default function AnimatedButtonLabel({ text, color, trigger, toSecond = false }: Props) {
  const [animId, setAnimId] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [showSecond, setShowSecond] = useState<boolean>(toSecond)
  const mounted = useRef(false)

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      setShowSecond(toSecond)
      return
    }
    if (toSecond === showSecond) return

    setAnimId(Math.floor(Math.random() * VARIANTS))
    setPlaying(true)

    const timer = setTimeout(() => {
      setPlaying(false)
      setShowSecond(toSecond)
    }, DURATION)

    return () => clearTimeout(timer)
  }, [trigger, toSecond, showSecond])

  const dir12 = !showSecond && toSecond
  const dir21 = showSecond && !toSecond

  let face1 = ''
  let face2 = ''
  if (playing) {
    if (dir12) {
      face1 = 'out'
      face2 = 'in'
    }
    if (dir21) {
      face1 = 'in'
      face2 = 'out'
    }
  } else {
    if (showSecond) {
      face1 = 'hidden'
      face2 = 'shown'
    } else {
      face1 = 'shown'
      face2 = 'hidden'
    }
  }

  const classes = [
    'btn-anim',
    playing ? 'is-playing' : '',
    playing ? `anim-${animId}` : '',
    dir12 ? 'dir-12' : '',
    dir21 ? 'dir-21' : '',
  ].filter(Boolean).join(' ')

  return (
    <span className="btn-label" aria-hidden>
      <span className={classes}>
        <span className={`face face1 ${face1}`} style={{ color }}>{text}</span>
        <span className={`face face2 ${face2}`} style={{ color }}>{text}</span>
      </span>

      <style jsx>{`
        .btn-label {
          display: inline-block;
          position: relative;
        }
        .btn-anim {
          display: inline-grid;
          place-items: center;
          position: relative;
          font-family: var(--font-tomorrow), 'Tomorrow', sans-serif;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }
        .face {
          grid-area: 1 / 1;
          display: inline-block;
          opacity: 0;
          visibility: hidden;
          will-change: transform, opacity, filter;
          text-shadow: none;
        }
        .face.shown {
          opacity: 1;
          visibility: visible;
        }

        .btn-anim.anim-0.is-playing { animation: pulseWrap ${DURATION}ms cubic-bezier(.25,1,.35,1) both; }
        .btn-anim.anim-0.dir-12 .face1.out,
        .btn-anim.anim-0.dir-21 .face2.out { animation: pulseFadeOut ${DURATION}ms cubic-bezier(.22,.95,.21,.99) forwards; }
        .btn-anim.anim-0.dir-12 .face2.in,
        .btn-anim.anim-0.dir-21 .face1.in { animation: pulsePopIn ${DURATION}ms cubic-bezier(.22,.95,.21,.99) forwards; }

        .btn-anim.anim-1.is-playing { animation: tiltWrap ${DURATION}ms ease-in-out both; }
        .btn-anim.anim-1.dir-12 .face1.out,
        .btn-anim.anim-1.dir-21 .face2.out { animation: tiltExit ${DURATION}ms ease-in-out forwards; }
        .btn-anim.anim-1.dir-12 .face2.in,
        .btn-anim.anim-1.dir-21 .face1.in { animation: tiltEnter ${DURATION}ms ease-in-out forwards; }

        .btn-anim.anim-2.is-playing { animation: glitchWrap ${DURATION}ms steps(4, end) forwards; }
        .btn-anim.anim-2.dir-12 .face1.out,
        .btn-anim.anim-2.dir-21 .face2.out { animation: glitchExit ${DURATION}ms linear forwards; }
        .btn-anim.anim-2.dir-12 .face2.in,
        .btn-anim.anim-2.dir-21 .face1.in { animation: glitchEnter ${DURATION}ms linear forwards; }

        .btn-anim.anim-3.is-playing { animation: warpWrap ${DURATION}ms cubic-bezier(.26,1,.32,1) both; }
        .btn-anim.anim-3.dir-12 .face1.out,
        .btn-anim.anim-3.dir-21 .face2.out { animation: warpExit ${DURATION}ms cubic-bezier(.26,1,.32,1) forwards; }
        .btn-anim.anim-3.dir-12 .face2.in,
        .btn-anim.anim-3.dir-21 .face1.in { animation: warpEnter ${DURATION}ms cubic-bezier(.26,1,.32,1) forwards; }

        .btn-anim.anim-4.is-playing { animation: smearWrap ${DURATION}ms cubic-bezier(.18,.96,.16,1) both; }
        .btn-anim.anim-4.dir-12 .face1.out,
        .btn-anim.anim-4.dir-21 .face2.out { animation: smearExit ${DURATION}ms cubic-bezier(.18,.96,.16,1) forwards; }
        .btn-anim.anim-4.dir-12 .face2.in,
        .btn-anim.anim-4.dir-21 .face1.in { animation: smearEnter ${DURATION}ms cubic-bezier(.18,.96,.16,1) forwards; }

        .btn-anim.anim-5.is-playing { animation: rippleWrap ${DURATION}ms cubic-bezier(.25,.95,.27,1) both; }
        .btn-anim.anim-5.dir-12 .face1.out,
        .btn-anim.anim-5.dir-21 .face2.out { animation: rippleExit ${DURATION}ms cubic-bezier(.25,.95,.27,1) forwards; }
        .btn-anim.anim-5.dir-12 .face2.in,
        .btn-anim.anim-5.dir-21 .face1.in { animation: rippleEnter ${DURATION}ms cubic-bezier(.25,.95,.27,1) forwards; }

        @keyframes pulseWrap { 0%{transform:scale(1)} 45%{transform:scale(1.04)} 100%{transform:scale(1)} }
        @keyframes pulseFadeOut { 0%{opacity:1;transform:scale(1);filter:none} 30%{transform:scale(1.12)} 60%{opacity:.58;transform:scale(.86);filter:blur(.6px)} 100%{opacity:0;transform:scale(.72);filter:blur(1.1px)} }
        @keyframes pulsePopIn { 0%{opacity:0;transform:scale(1.3);filter:blur(1.6px)} 18%{opacity:1} 45%{transform:scale(.94);filter:blur(.4px)} 100%{transform:scale(1);filter:none} }

        @keyframes tiltWrap { 0%{transform:rotateX(0)} 45%{transform:rotateX(3deg)} 100%{transform:rotateX(0)} }
        @keyframes tiltExit { 0%{opacity:1;transform:rotateY(0deg) translateZ(0);filter:none} 40%{opacity:.45} 100%{opacity:0;transform:rotateY(-80deg) translateZ(-60px);filter:blur(1px)} }
        @keyframes tiltEnter { 0%{opacity:0;transform:rotateY(80deg) translateZ(-60px) scale(1.02);filter:blur(1.2px)} 25%{opacity:1} 100%{opacity:1;transform:rotateY(0) translateZ(0) scale(1);filter:none} }

        @keyframes glitchWrap { 0%,100%{transform:translate3d(0,0,0)} 20%{transform:translate3d(-1px,1px,0)} 40%{transform:translate3d(1px,-1px,0)} 60%{transform:translate3d(-2px,0,0)} 80%{transform:translate3d(2px,0,0)} }
        @keyframes glitchExit { 0%{opacity:1;transform:translate3d(0,0,0);filter:none} 20%{filter:drop-shadow(-2px 0 #ff1266) drop-shadow(2px 0 #00f6ff)} 45%{opacity:.6;transform:translate3d(-8px,-2px,0) skewX(-4deg);filter:drop-shadow(-6px 0 #ff1266) drop-shadow(6px 0 #00f6ff)} 70%{opacity:.25;transform:translate3d(9px,2px,0) skewX(5deg) scale(.94);filter:drop-shadow(8px 0 rgba(0,246,255,.6))} 100%{opacity:0;transform:translate3d(-18px,0,0) scale(.82);filter:blur(1.4px)} }
        @keyframes glitchEnter { 0%{opacity:0;transform:translate3d(16px,0,0) skewX(8deg) scale(1.18);filter:drop-shadow(6px 0 #00f6ff) drop-shadow(-6px 0 #ff1266)} 20%{opacity:1;transform:translate3d(-4px,1px,0) skewX(-4deg)} 40%{transform:translate3d(3px,-1px,0) skewX(2deg)} 65%{transform:translate3d(-2px,0,0) skewX(-1deg)} 100%{transform:translate3d(0,0,0) skewX(0) scale(1);filter:none} }

        @keyframes warpWrap { 0%{transform:scaleY(1)} 40%{transform:scaleY(1.14)} 100%{transform:scaleY(1)} }
        @keyframes warpExit { 0%{opacity:1;transform:scaleX(1) skewX(0);filter:none} 50%{opacity:.4;transform:scaleX(.58) skewX(-12deg);filter:blur(.4px)} 100%{opacity:0;transform:scaleX(.32) skewX(-18deg);filter:blur(1.2px)} }
        @keyframes warpEnter { 0%{opacity:0;transform:scaleX(1.8) skewX(18deg);filter:blur(1.4px)} 30%{opacity:1} 70%{transform:scaleX(1.04) skewX(-2deg)} 100%{transform:scaleX(1) skewX(0);filter:none} }

        @keyframes smearWrap { 0%{transform:skewX(0)} 50%{transform:skewX(-6deg)} 100%{transform:skewX(0)} }
        @keyframes smearExit { 0%{opacity:1;transform:translateX(0);filter:none} 50%{opacity:.35;transform:translateX(-120px);filter:blur(6px) saturate(1.2)} 100%{opacity:0;transform:translateX(-260px);filter:blur(12px) saturate(1.35)} }
        @keyframes smearEnter { 0%{opacity:0;transform:translateX(260px);filter:blur(12px) saturate(1.35)} 35%{opacity:1} 70%{filter:blur(3px)} 100%{transform:translateX(0);filter:none} }

        @keyframes rippleWrap { 0%{transform:translateY(0)} 25%{transform:translateY(-6px) rotate(-1.2deg)} 50%{transform:translateY(4px) rotate(1deg)} 75%{transform:translateY(-2px) rotate(-.6deg)} 100%{transform:translateY(0)} }
        @keyframes rippleExit { 0%{opacity:1;transform:translateY(0) scale(1);filter:none} 40%{opacity:.55;transform:translateY(-8px) scale(.92);filter:blur(.6px)} 100%{opacity:0;transform:translateY(22px) scale(.75);filter:blur(1.4px)} }
        @keyframes rippleEnter { 0%{opacity:0;transform:translateY(-22px) scale(1.2);filter:blur(1.2px)} 30%{opacity:1} 65%{transform:translateY(4px) scale(.98)} 100%{transform:translateY(0) scale(1);filter:none} }

        @media (prefers-reduced-motion: reduce) {
          .btn-anim, .face { animation: none !important; transition: none !important; }
          .face.hidden { visibility: hidden; opacity: 0; }
          .face.shown { visibility: visible; opacity: 1; }
        }
      `}</style>
    </span>
  )
}
