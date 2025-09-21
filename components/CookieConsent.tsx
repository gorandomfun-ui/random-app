'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type Categories = 'necessary' | 'analytics' | 'ads' | 'personalization';

export type Consent = Record<Categories, boolean>;

type Ctx = {
  consent: Consent | null;              // null = pas encore décidé
  decided: boolean;                     // consent !== null
  isBannerOpen: boolean;                // bannière visible ?
  isSettingsOpen: boolean;              // modal réglages ouvert ?
  acceptAll: () => void;
  rejectAll: () => void;
  save: (next: Consent) => void;        // sauvegarder réglages
  openSettings: () => void;
  closeSettings: () => void;
};

const DEFAULT: Consent = {
  necessary: true,
  analytics: false,
  ads: false,
  personalization: false,
};

const KEY = 'random.consent.v1';

const ConsentCtx = createContext<Ctx | null>(null);

export function CookieConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [isSettingsOpen, setSettingsOpen] = useState(false);

  // Charger depuis localStorage au montage (client seulement)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Consent;
        // sécurité : necessary toujours true
        parsed.necessary = true;
        setConsent(parsed);
      } else {
        setConsent(null); // force la bannière
      }
    } catch {
      setConsent(null);
    }
  }, []);

  const save = (next: Consent) => {
    const fixed = { ...next, necessary: true };
    setConsent(fixed);
    localStorage.setItem(KEY, JSON.stringify(fixed));
    setSettingsOpen(false);
  };

  const acceptAll = () => {
    save({ necessary: true, analytics: true, ads: true, personalization: true });
  };

  const rejectAll = () => {
    save({ necessary: true, analytics: false, ads: false, personalization: false });
  };

  const openSettings = () => setSettingsOpen(true);
  const closeSettings = () => setSettingsOpen(false);

  const decided = consent !== null;
  const isBannerOpen = !decided && !isSettingsOpen;

  const value = useMemo<Ctx>(
    () => ({
      consent,
      decided,
      isBannerOpen,
      isSettingsOpen,
      acceptAll,
      rejectAll,
      save,
      openSettings,
      closeSettings,
    }),
    [consent, decided, isBannerOpen, isSettingsOpen]
  );

  return <ConsentCtx.Provider value={value}>{children}</ConsentCtx.Provider>;
}

export function useCookieConsent(): Ctx {
  const ctx = useContext(ConsentCtx);
  if (!ctx) throw new Error('useCookieConsent must be used inside CookieConsentProvider');
  return ctx;
}
