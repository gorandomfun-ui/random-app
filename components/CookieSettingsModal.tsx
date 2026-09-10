'use client'

import { useEffect, useRef, useState } from 'react'
import { useCookieConsent } from './CookieConsent'
import { useI18n } from '@/providers/I18nProvider'
import { denied } from '@/lib/privacy/consent'
import { privacyCopy } from '@/lib/privacy/copy'

export default function CookieSettingsModal() {
  const { consent, isSettingsOpen, closeSettings, save, rejectAll, gpc } = useCookieConsent()
  const { locale } = useI18n()
  const copy = privacyCopy[locale] || privacyCopy.en
  const [local, setLocal] = useState(denied)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (isSettingsOpen) {
      setLocal(consent || denied())
      dialog.current?.showModal()
    } else dialog.current?.close()
  }, [isSettingsOpen, consent])

  return (
    <dialog
      ref={dialog}
      id="cookie-settings-modal"
      aria-label={copy.title}
      onCancel={(event) => {
        event.preventDefault()
        closeSettings()
      }}
      className="w-[min(92vw,720px)] rounded-2xl bg-white p-6 text-neutral-900 shadow-2xl backdrop:bg-black/60"
    >
      <div className="flex justify-between gap-4">
        <h2 className="text-xl font-bold">{copy.title}</h2>
        <button type="button" aria-label={copy.close} onClick={closeSettings}>
          ×
        </button>
      </div>
      <div className="my-6 max-h-[55vh] space-y-5 overflow-y-auto">
        <label className="flex gap-3">
          <input type="checkbox" checked disabled />
          <span>
            <strong>{copy.necessary}</strong>
            <br />
            {copy.necessaryText}
          </span>
        </label>
        <label className="flex gap-3">
          <input
            type="checkbox"
            checked={local.media}
            onChange={(event) => setLocal((value) => ({ ...value, media: event.target.checked }))}
          />
          <span>
            <strong>{copy.media}</strong>
            <br />
            {copy.mediaText}
          </span>
        </label>
        <label className="flex gap-3">
          <input
            type="checkbox"
            checked={!gpc && local.ads}
            disabled={gpc}
            onChange={(event) => setLocal((value) => ({ ...value, ads: event.target.checked }))}
          />
          <span>
            <strong>{copy.ads}</strong>
            <br />
            {copy.adsText}
          </span>
        </label>
        <p className="text-sm">{copy.standardMediaText}</p>
        <p className="text-sm">{copy.remembered}</p>
        {gpc && <p>{copy.gpc}</p>}
      </div>
      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        <a href="/privacy" className="underline">{copy.policy}</a>
        <a href="/terms" className="underline">{copy.terms}</a>
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          className="rounded-xl bg-neutral-900 px-4 py-2 text-white"
          onClick={rejectAll}
        >
          {copy.reject}
        </button>
        <button
          type="button"
          className="rounded-xl bg-neutral-900 px-4 py-2 text-white"
          onClick={() => save(local)}
        >
          {copy.save}
        </button>
      </div>
    </dialog>
  )
}
