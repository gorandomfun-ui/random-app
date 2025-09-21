'use client';

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Consent, useCookieConsent } from './CookieConsent';

export default function CookieSettingsModal() {
  const { consent, isSettingsOpen, closeSettings, save } = useCookieConsent();
  const [local, setLocal] = useState<Consent>({
    necessary: true,
    analytics: false,
    ads: false,
    personalization: false,
  });

  useEffect(() => {
    if (consent) setLocal(consent);
  }, [consent]);

  if (!isSettingsOpen) return null;

  const onToggle = (key: keyof Consent) =>
    setLocal((prev) => ({ ...prev, [key]: !prev[key] }));

  const onSave = () => save(local);

  return (
    <div className="fixed inset-0 z-[220]">
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" onClick={closeSettings} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Paramètres des cookies"
        className="pointer-events-auto absolute left-1/2 top-1/2 w-[min(92vw,720px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white text-neutral-900 shadow-2xl ring-1 ring-black/10"
      >
        <div className="flex items-center justify-between border-b border-black/10 px-6 py-5">
          <h2 className="text-xl font-bold">Paramètres des cookies</h2>
          <button onClick={closeSettings} aria-label="Fermer" className="rounded-full p-2 hover:bg-black/5">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-6">
          <ul className="space-y-4">
            <li className="flex items-start gap-3">
              <input type="checkbox" checked readOnly className="mt-1" />
              <div>
                <div className="font-semibold">Nécessaires</div>
                <div className="text-sm text-neutral-600">
                  Indispensables au fonctionnement du site (toujours actifs).
                </div>
              </div>
            </li>

            <li className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={local.analytics}
                onChange={() => onToggle('analytics')}
                className="mt-1"
              />
              <div>
                <div className="font-semibold">Analytics</div>
                <div className="text-sm text-neutral-600">
                  Mesure d’audience anonyme pour améliorer le site.
                </div>
              </div>
            </li>

            <li className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={local.ads}
                onChange={() => onToggle('ads')}
                className="mt-1"
              />
              <div>
                <div className="font-semibold">Publicité</div>
                <div className="text-sm text-neutral-600">
                  Annonces personnalisées et suivi publicitaire.
                </div>
              </div>
            </li>

            <li className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={local.personalization}
                onChange={() => onToggle('personalization')}
                className="mt-1"
              />
              <div>
                <div className="font-semibold">Personnalisation</div>
                <div className="text-sm text-neutral-600">
                  Contenus recommandés en fonction de votre usage.
                </div>
              </div>
            </li>
          </ul>
        </div>

        <div className="flex justify-end gap-3 border-t border-black/10 px-6 py-4">
          <button onClick={closeSettings} className="rounded-xl px-4 py-2 hover:bg-neutral-100">
            Annuler
          </button>
          <button
            onClick={onSave}
            className="rounded-xl bg-neutral-900 px-4 py-2 text-white hover:opacity-90"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
