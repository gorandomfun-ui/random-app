'use client'

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { useI18n } from '@/providers/I18nProvider'
import { loadYouTube, type YouTubePlayer } from '@/lib/players/sdk'
import { youtubeMuted } from '@/lib/players/state'
import RandomPlayerFrame from '@/components/players/RandomPlayerFrame'

type Props = {
  provider: 'youtube'
  videoId: string
  title?: string | null
  frameHeight: string
  fullscreenLabel: string
  soundMuted: boolean
  onVideoSoundUnlocked?: () => void
  onError?: (code: number) => void
}
const control: CSSProperties = {
  position: 'absolute',
  top: '12px',
  zIndex: 4,
  pointerEvents: 'auto',
  touchAction: 'manipulation',
  width: '44px',
  height: '40px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}
export default function ControlledVideoEmbed(props: Props) {
  const { provider, videoId, title, frameHeight, fullscreenLabel, soundMuted } =
    props
  const { t } = useI18n()
  const mountRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YouTubePlayer | null>(null)
  const callbacks = useRef(props)
  callbacks.current = props
  const initialMuted = useRef(soundMuted)
  const [muted, setMuted] = useState<boolean | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const readRef = useRef<() => void>(() => undefined)
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '')

  useEffect(() => {
    let active = true
    let yt: YouTubePlayer | undefined
    let autoplayRetried = false
    const mount = mountRef.current!
    const target = document.createElement('div')
    target.id = `random-sdk-${reactId}-${attempt}-${Math.random().toString(36).slice(2)}`
    mount.replaceChildren(target)
    setMuted(null)
    setFailed(false)
    const read = () => {
      if (!active || !yt || document.visibilityState === 'hidden') return
      try {
        setMuted(youtubeMuted(yt.isMuted(), yt.getVolume()))
      } catch {
        /* Not ready. */
      }
    }
    readRef.current = read
    const init = async () => {
      const sdk = await loadYouTube()
      if (!active) return
      yt = new sdk.Player(target, {
        videoId,
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
          autoplay: 0,
          playsinline: 1,
          controls: 1,
          fs: 1,
          rel: 0,
          loop: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: ({ target: player }) => {
            if (!active) {
              player.destroy()
              return
            }
            playerRef.current = player
            // A global mute chosen during SDK loading takes precedence.
            if (initialMuted.current || callbacks.current.soundMuted)
              player.mute()
            player.playVideo()
            read()
          },
          onStateChange: ({ data }) => {
            if (!active) return
            if (data === 0) yt?.pauseVideo()
            read()
          },
          onError: ({ data }) => {
            if (active) callbacks.current.onError?.(data)
          },
          onAutoplayBlocked: () => {
            if (active && yt && !autoplayRetried) {
              autoplayRetried = true
              yt.mute()
              yt.playVideo()
            }
            read()
          },
        },
      })
    }
    void init().catch(() => {
      if (active) setFailed(true)
    })
    const timer = window.setInterval(read, 750)
    return () => {
      active = false
      window.clearInterval(timer)
      readRef.current = () => undefined
      playerRef.current = null
      try {
        yt?.destroy()
      } catch {
        /* Already disposed. */
      }
      mount.replaceChildren()
    }
  }, [provider, videoId, reactId, attempt])

  const toggleSound = () => {
    const player = playerRef.current
    if (!player || provider !== 'youtube') return
    // Commands happen inside the click; the icon follows confirmed state only.
    try {
      if (muted === false) player.mute()
      else {
        player.unMute()
        if (player.getVolume() === 0) player.setVolume(100)
      }
      readRef.current()
    } catch {
      /* Keep the last confirmed icon; native controls remain accessible. */
    }
  }
  useEffect(() => {
    if (provider === 'youtube' && muted === false)
      callbacks.current.onVideoSoundUnlocked?.()
  }, [muted, provider])
  useEffect(() => {
    if (!soundMuted || provider !== 'youtube') return
    try {
      playerRef.current?.mute()
      readRef.current()
    } catch {
      /* Keep authoritative state. */
    }
  }, [soundMuted, provider])
  const soundLabel =
    muted === false
      ? t('video.mute', 'Mute video')
      : t('video.unmute', 'Unmute video')
  const Sound = muted === false ? Volume2 : VolumeX
  return (
    <RandomPlayerFrame
      title={title}
      frameHeight={frameHeight}
      fullscreenLabel={fullscreenLabel}
      soundControl={
        <button
          type="button"
          aria-label={soundLabel}
          title={soundLabel}
          onClick={toggleSound}
          disabled={muted === null}
          className="rounded-full bg-black/60 text-white shadow-lg hover:bg-black/75"
          style={{ ...control, right: '68px' }}
        >
          <Sound size={21} strokeWidth={2.2} aria-hidden="true" />
        </button>
      }
    >
      {() => (
        <>
          <div ref={mountRef} className="random-controlled-mount" />
          {failed && (
            <button
              type="button"
              className="absolute inset-0 text-white"
              onClick={() => setAttempt((value) => value + 1)}
            >
              {t('common.retry', 'Retry')}
            </button>
          )}
          <style>{`
          .random-controlled-mount { position: absolute; width: 177.8%; height: 100%; left: 50%; top: 50%; transform: translate(-50%, -50%); }
          .random-controlled-mount > div, .random-controlled-mount iframe { width: 100% !important; height: 100% !important; border: 0; }
          .random-controlled-video[data-full="true"] .random-controlled-mount { width: 100%; }
        `}</style>
        </>
      )}
    </RandomPlayerFrame>
  )
}
