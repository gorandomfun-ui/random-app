'use client'

import React from 'react'

const mobileFrameStyle: React.CSSProperties = {
  width: '300px',
  margin: 'auto',
  zIndex: 99998,
  height: 'auto',
}

const mobileIframeStyle: React.CSSProperties = {
  border: 0,
  padding: 0,
  width: '300px',
  height: '250px',
  overflow: 'hidden',
  display: 'block',
  margin: 'auto',
}

const desktopFrameStyle: React.CSSProperties = {
  width: 'min(728px, calc(100vw - 64px))',
  margin: 'auto',
  zIndex: 99998,
  height: 'auto',
}

const desktopIframeStyle: React.CSSProperties = {
  border: 0,
  padding: 0,
  width: '728px',
  maxWidth: '100%',
  height: '90px',
  overflow: 'hidden',
  display: 'block',
  margin: 'auto',
}

export default function AadsInlineContentAd() {
  return (
    <div className="w-full flex justify-center py-6">
      <div className="block md:hidden" style={mobileFrameStyle}>
        <iframe
          title="inline-ad-mobile"
          data-aa="2414503"
          src="//ad.a-ads.com/2414503/?size=300x250"
          style={mobileIframeStyle}
        />
      </div>
      <div className="hidden md:block" style={desktopFrameStyle}>
        <iframe
          title="inline-ad-desktop"
          data-aa="2414537"
          src="//ad.a-ads.com/2414537/?size=728x90"
          style={desktopIframeStyle}
        />
      </div>
    </div>
  )
}
