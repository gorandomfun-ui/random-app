'use client';

import React from 'react';
import { useCookieConsent } from './CookieConsent';

export default function CookieBanner() {
  const { isBannerOpen, acceptAll, rejectAll, openSettings } = useCookieConsent();

  if (!isBannerOpen) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[180]">
      <div className="mx-auto mb-4 w-[min(92vw,900px)] rounded-2xl bg-white/95 p-4 shadow-2xl ring-1 ring-black/10 backdrop-blur">
        <p className="text-sm text-neutral-800">
          Nous utilisons des cookies pour améliorer votre expérience. En UE, les traceurs non
          essentiels ne sont activés qu’après consentement.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={acceptAll}
            className="rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white hover:opacity-90"
          >
            Tout accepter
          </button>
          <button
            onClick={rejectAll}
            className="rounded-xl bg-neutral-200 px-4 py-2 text-sm hover:bg-neutral-300"
          >
            Tout refuser
          </button>
          <button
            onClick={openSettings}
            className="rounded-xl px-3 py-2 text-sm underline underline-offset-2 hover:bg-neutral-100"
          >
            Gérer mes cookies
          </button>
        </div>
      </div>
    </div>
  );
}
