'use client'

import React from 'react'
import AadsDesktopBanner from './AadsDesktopBanner'
import AadsMobileBanner from './AadsMobileBanner'
import { useCookieConsent } from './CookieConsent'

export default function FooterAds() {
  const { consent } = useCookieConsent()

  if (!consent?.ads) return null

  return (
    <>
      <AadsMobileBanner />
      <AadsDesktopBanner />
    </>
  )
}
