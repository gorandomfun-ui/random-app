'use client';

import React from 'react';
import { X } from 'lucide-react';
import CookieSettingsLink from '@/components/CookieSettingsLink';
import { useI18n } from '@/providers/I18nProvider';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function LegalModal({ open, onClose }: Props) {
  const { t } = useI18n();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200]">
      {/* Backdrop */}
      <button
        aria-hidden="true"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('legal.title')}
        className="pointer-events-auto absolute left-1/2 top-1/2 w-[min(92vw,900px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white text-neutral-900 shadow-2xl ring-1 ring-black/10"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/10">
          <h2 className="text-2xl font-extrabold tracking-tight">
            {t('legal.title')}
          </h2>
          <button
            type="button"
            aria-label={t('legal.close')}
            onClick={onClose}
            className="rounded-full p-2 hover:bg-black/5"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-6">
          <section className="space-y-6 leading-relaxed text-[15px]">
            {/* Editor */}
            <div>
              <h3 className="font-semibold text-base">{t('legal.editor.title')}</h3>
              <p className="whitespace-pre-line">{t('legal.editor.body')}</p>
            </div>

            {/* Hosting */}
            <div>
              <h3 className="font-semibold text-base">{t('legal.hosting.title')}</h3>
              <p>{t('legal.hosting.body')}</p>
            </div>

            {/* Purpose */}
            <div>
              <h3 className="font-semibold text-base">{t('legal.purpose.title')}</h3>
              <p>{t('legal.purpose.body')}</p>
            </div>

            {/* Privacy */}
            <div>
              <h3 className="font-semibold text-base">{t('legal.privacy.title')}</h3>
              <p>
                {t('legal.privacy.bodyPrefix')}{' '}
                <CookieSettingsLink>{t('legal.privacy.manageCookies')}</CookieSettingsLink>
                <span className="mx-1">·</span>
                <a href="/privacy" className="underline underline-offset-2">
                  {t('legal.privacy.privacyPolicy')}
                </a>
              </p>
            </div>

            {/* USA */}
            <div>
              <h3 className="font-semibold text-base">{t('legal.usa.title')}</h3>
              <p>
                {t('legal.usa.bodyPrefix')}{' '}
                <a href="/privacy#do-not-sell" className="underline underline-offset-2">
                  {t('legal.usa.doNotSell')}
                </a>
              </p>
            </div>

            {/* DMCA */}
            <div>
              <h3 className="font-semibold text-base">{t('legal.dmca.title')}</h3>
              <p>{t('legal.dmca.body')}</p>
            </div>

            {/* Law */}
            <div>
              <h3 className="font-semibold text-base">{t('legal.law.title')}</h3>
              <p>{t('legal.law.body')}</p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-black/10 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-neutral-900 px-5 py-2 text-white hover:opacity-90"
          >
            {t('legal.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
