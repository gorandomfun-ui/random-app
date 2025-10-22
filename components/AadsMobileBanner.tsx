'use client'

import React, { useEffect, useRef, useState } from 'react'

const outerStyle: React.CSSProperties = { position: 'absolute', zIndex: 99999 }
const wrapperStyle: React.CSSProperties = { paddingTop: 0, paddingBottom: '50px' }
const containerStyle: React.CSSProperties = {
  width: 'min(320px, calc(100vw - 16px))',
  height: '50px',
  position: 'fixed',
  textAlign: 'center',
  fontSize: 0,
  bottom: 0,
  left: 0,
  right: 0,
  margin: 'auto',
  paddingRight: '32px',
}
const closeStyle: React.CSSProperties = {
  top: '50%',
  right: '4px',
  position: 'absolute',
  borderRadius: '4px',
  background: 'rgba(248, 248, 249, 0.70)',
  padding: '4px',
  zIndex: 99999,
  cursor: 'pointer',
  transform: 'translateY(-50%)',
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
  height: '50px',
  overflow: 'hidden',
  margin: 'auto',
}

export default function AadsMobileBanner() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const handler = () => {
      setReloadKey((prev) => prev + 1)
      if (inputRef.current) inputRef.current.checked = false
    }
    window.addEventListener('random:footer-ad-cycle', handler)
    return () => window.removeEventListener('random:footer-ad-cycle', handler)
  }, [])

  return (
    <div className="md:hidden" style={outerStyle}>
      <input autoComplete="off" type="checkbox" id="aadsstickymgzj6lbr" hidden ref={inputRef} />
      <div style={wrapperStyle}>
        <div style={containerStyle}>
          <label htmlFor="aadsstickymgzj6lbr" style={closeStyle}>
            <svg fill="#000000" height="16px" width="16px" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 490 490">
              <polygon points="456.851,0 245,212.564 33.149,0 0.708,32.337 212.669,245.004 0.708,457.678 33.149,490 245,277.443 456.851,490 489.292,457.678 277.331,245.004 489.292,32.337 " />
            </svg>
          </label>
          <div id="frame" style={frameStyle}>
            <iframe
              key={reloadKey}
              title="a-ads-banner"
              data-aa="2414406"
              src="//ad.a-ads.com/2414406/?size=320x50"
              style={iframeStyle}
            />
          </div>
        </div>
        <style>{'#aadsstickymgzj6lbr:checked + div { display: none; }'}</style>
      </div>
    </div>
  )
}
