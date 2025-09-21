'use client';

import React from 'react';
import { useCookieConsent } from './CookieConsent';

export default function CookieSettingsLink({ children }: { children?: React.ReactNode }) {
  const { openSettings } = useCookieConsent();
  return (
    <button
      type="button"
      onClick={openSettings}
      className="underline underline-offset-2 hover:opacity-80"
    >
      {children ?? 'Gérer mes cookies'}
    </button>
  );
}
