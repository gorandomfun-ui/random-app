'use client';

import React from 'react';
import { useCookieConsent } from './CookieConsent';
import { useI18n } from '@/providers/I18nProvider';
import { privacyCopy } from '@/lib/privacy/copy';

export default function CookieSettingsLink({ children }: { children?: React.ReactNode }) {
  const { openSettings } = useCookieConsent();
  const { locale } = useI18n();
  const copy = privacyCopy[locale] || privacyCopy.en;
  return (
    <button
      type="button"
      onClick={openSettings}
      className="underline underline-offset-2 hover:opacity-80"
    >
      {children ?? copy.settings}
    </button>
  );
}
