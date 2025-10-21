'use client'

import React from 'react'

const outerStyle: React.CSSProperties = { position: 'absolute', zIndex: 99999 }
const wrapperStyle: React.CSSProperties = { paddingTop: 0, paddingBottom: '90px' }
const containerStyle: React.CSSProperties = {
  width: 'min(728px, calc(100vw - 48px))',
  height: '90px',
  position: 'fixed',
  textAlign: 'center',
  fontSize: 0,
  bottom: 0,
  left: 0,
  right: 0,
  margin: 'auto',
}
const closeStyle: React.CSSProperties = {
  top: '-24px',
  right: 0,
  position: 'absolute',
  borderRadius: '4px',
  background: 'rgba(248, 248, 249, 0.70)',
  padding: '4px',
  zIndex: 99999,
  cursor: 'pointer',
}
const frameStyle: React.CSSProperties = {
  width: '100%',
  margin: 'auto',
  zIndex: 99998,
  height: 'auto',
}
const iframeStyle: React.CSSProperties = {
  border: 0,
  padding: 0,
  width: '100%',
  height: '90px',
  overflow: 'hidden',
  margin: 'auto',
}

export default function AadsDesktopBanner() {
  return (
    <div className="hidden md:block" style={outerStyle}>
      <input autoComplete="off" type="checkbox" id="aadsstickymgzjb64v" hidden />
      <div style={wrapperStyle}>
        <div style={containerStyle}>
          <label htmlFor="aadsstickymgzjb64v" style={closeStyle}>
            <svg fill="#000000" height="16px" width="16px" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 490 490">
              <polygon points="456.851,0 245,212.564 33.149,0 0.708,32.337 212.669,245.004 0.708,457.678 33.149,490 245,277.443 456.851,490 489.292,457.678 277.331,245.004 489.292,32.337 " />
            </svg>
          </label>
          <div id="frame" style={frameStyle}>
            <iframe
              title="a-ads-banner-desktop"
              data-aa="2414407"
              src="//ad.a-ads.com/2414407/?size=728x90"
              style={iframeStyle}
            />
          </div>
        </div>
        <style>{'#aadsstickymgzjb64v:checked + div { display: none; }'}</style>
      </div>
    </div>
  )
}
