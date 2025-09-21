'use client'

import { useEffect, useRef } from 'react'

export default function BannerAd() {
  const bannerRef = useRef<HTMLDivElement>(null)
  const scriptLoaded = useRef(false)

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_PROPELLER_ADS_ID || scriptLoaded.current) return

    const script = document.createElement('script')
    script.src = `//cdn.propellerads.com/${process.env.NEXT_PUBLIC_PROPELLER_ADS_ID}/invoke.js`
    script.async = true
    
    if (bannerRef.current) {
      bannerRef.current.appendChild(script)
      scriptLoaded.current = true
    }

    return () => {
      if (bannerRef.current && script.parentNode) {
        script.parentNode.removeChild(script)
      }
    }
  }, [])

  return (
    <div className="banner-ad-container">
      <div ref={bannerRef} id="propeller-ad-banner" />
    </div>
  )
}