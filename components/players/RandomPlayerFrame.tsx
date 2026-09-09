'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from 'react'
import { useI18n } from '@/providers/I18nProvider'
import {
  exitContainerFullscreen,
  fullscreenElement,
  requestContainerFullscreen,
} from '@/lib/players/fullscreen'

type Props = {
  title?: string | null
  frameHeight: string
  fullscreenLabel: string
  soundControl?: ReactNode
  children: (fullscreen: boolean) => ReactNode
}
const control: CSSProperties = {
  position: 'absolute',
  top: '12px',
  right: '16px',
  zIndex: 4,
  pointerEvents: 'auto',
  touchAction: 'manipulation',
  width: '44px',
  height: '40px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}

/** Shared Random chrome; children keep ownership of their player and audio mechanism. */
export default function RandomPlayerFrame({
  title,
  frameHeight,
  fullscreenLabel,
  soundControl,
  children,
}: Props) {
  const { t } = useI18n()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [full, setFull] = useState(false)
  const fullRef = useRef(false)
  const enteredNative = useRef(false)
  const beforeScroll = useRef('')
  const close = useCallback(() => {
    const dialog = dialogRef.current
    if (!dialog || !fullRef.current) return
    fullRef.current = false
    enteredNative.current = false
    if (surfaceRef.current) exitContainerFullscreen(surfaceRef.current)
    dialog.close()
    dialog.show() // same player DOM, same playback position
    document.body.style.overflow = beforeScroll.current
    setFull(false)
    window.requestAnimationFrame(() =>
      triggerRef.current?.focus({ preventScroll: true }),
    )
  }, [])

  const enter = () => {
    const dialog = dialogRef.current
    if (!dialog || fullRef.current) return
    fullRef.current = true
    beforeScroll.current = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    setFull(true)
    // A modal dialog reaches the top layer even inside Random's transformed/glitched ancestors.
    if (typeof dialog.showModal === 'function') {
      try {
        dialog.close()
        dialog.showModal()
      } catch {
        dialog.show()
      }
    }
    void requestContainerFullscreen(surfaceRef.current!).then((ok) => {
      if (!fullRef.current) {
        if (surfaceRef.current) exitContainerFullscreen(surfaceRef.current)
        return
      }
      enteredNative.current = ok
    })
  }

  useEffect(() => {
    const surface = surfaceRef.current
    const changed = () => {
      if (fullscreenElement() === surfaceRef.current)
        enteredNative.current = true
      else if (enteredNative.current) close()
    }
    document.addEventListener('fullscreenchange', changed)
    document.addEventListener('webkitfullscreenchange', changed)
    return () => {
      document.removeEventListener('fullscreenchange', changed)
      document.removeEventListener('webkitfullscreenchange', changed)
      if (fullRef.current) {
        document.body.style.overflow = beforeScroll.current
        if (surface) exitContainerFullscreen(surface)
      }
    }
  }, [close])

  return (
    <dialog
      open
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      role={full ? 'dialog' : 'group'}
      aria-modal={full || undefined}
      aria-label={title || 'Video'}
      className="random-controlled-video"
      data-full={full ? 'true' : 'false'}
      style={{
        position: full ? 'fixed' : 'relative',
        inset: full ? 0 : undefined,
        margin: 0,
        padding: 0,
        border: 0,
        width: full ? '100vw' : '100%',
        maxWidth: 'none',
        height: full ? '100dvh' : frameHeight,
        maxHeight: 'none',
        overflow: 'hidden',
        background: '#000',
        color: '#fff',
      }}
    >
      <div
        ref={surfaceRef}
        className="random-controlled-surface"
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          background: '#000',
        }}
      >
        {children(full)}
        {!full && (
          <>
            <button
              ref={triggerRef}
              type="button"
              aria-label={fullscreenLabel}
              title={fullscreenLabel}
              onClick={enter}
              className="rounded-full bg-black/60 text-white shadow-lg hover:bg-black/75"
              style={control}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/icons/fullscreen.svg"
                alt=""
                style={{ width: '20px', height: '20px' }}
              />
            </button>
            {soundControl}
          </>
        )}
        {full && (
          <>
            <button
              type="button"
              aria-label={t('legal.close', 'Close')}
              className="video-fullscreen-close"
              onClick={close}
            >
              ×
            </button>
            <div className="video-fullscreen-brand" aria-hidden="true">
              {['R', 'A', 'N', 'D', 'O', 'M'].map((letter) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={letter}
                  src={`/logo/${letter}1.svg`}
                  alt=""
                  draggable={false}
                />
              ))}
            </div>
          </>
        )}
      </div>
      <style>{`.random-controlled-video::backdrop { background: #000; }`}</style>
    </dialog>
  )
}
