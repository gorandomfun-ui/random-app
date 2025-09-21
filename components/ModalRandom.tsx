'use client'

import { useState, useEffect } from 'react'
import { X, Heart, Share2 } from 'lucide-react'
import { Item, Dictionary, Theme } from '@/types'
import { addLike, removeLike, isLiked } from '@/lib/utils/likes'

interface ModalRandomProps {
  isOpen: boolean
  onClose: () => void
  item: Item | null
  dict: Dictionary
  theme: Theme
  onRandomAgain: () => void
}

export default function ModalRandom({
  isOpen,
  onClose,
  item,
  dict,
  theme,
  onRandomAgain
}: ModalRandomProps) {
  const [liked, setLiked] = useState(false)
  const [showMaxLikesWarning, setShowMaxLikesWarning] = useState(false)
  const [animateLogo, setAnimateLogo] = useState(false)

  useEffect(() => {
    if (item) {
      setLiked(isLiked(item._id))
    }
  }, [item])

  if (!isOpen || !item) return null

  const handleRandomAgain = () => {
    setAnimateLogo(true)
    setTimeout(() => {
      setAnimateLogo(false)
      onRandomAgain()
    }, 500)
  }

  const handleLike = () => {
    if (liked) {
      removeLike(item._id)
      setLiked(false)
    } else {
      if (addLike(item)) {
        setLiked(true)
      } else {
        setShowMaxLikesWarning(true)
        setTimeout(() => setShowMaxLikesWarning(false), 3000)
      }
    }
  }

  const handleDislike = async () => {
    try {
      await fetch('/api/feedback/dislike', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item._id })
      })
      handleRandomAgain()
    } catch (error) {
      console.error('Error disliking:', error)
    }
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Random Content',
          text: item.title || item.text || 'Check this out!',
          url: window.location.href
        })
      } catch (error) {
        console.log('Share cancelled')
      }
    }
  }

  const renderContent = () => {
    switch (item.type) {
      case 'image':
        return (
          <img 
            src={item.url} 
            alt={item.title || 'Random image'} 
            style={{ 
              maxWidth: '100%', 
              maxHeight: '60vh', 
              objectFit: 'contain',
              borderRadius: '12px'
            }}
          />
        )
      
      case 'video':
        return (
          <div style={{ width: '100%', maxWidth: '800px', aspectRatio: '16/9' }}>
            <iframe
              src={`https://www.youtube.com/embed/${item.externalId}`}
              style={{ width: '100%', height: '100%', borderRadius: '12px' }}
              allowFullScreen
            />
          </div>
        )
      
      case 'quote':
      case 'joke':
      case 'fact':
        return (
          <div style={{ maxWidth: '600px', textAlign: 'center', padding: '20px' }}>
            <p style={{ fontSize: '24px', fontWeight: 'bold', color: 'white', marginBottom: '16px' }}>
              {item.text}
            </p>
            {item.title && (
              <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.8)' }}>
                — {item.title}
              </p>
            )}
          </div>
        )
      
      case 'web':
        return (
          <a 
            href={item.url} 
            target="_blank" 
            rel="noopener noreferrer"
            style={{ 
              display: 'block',
              padding: '24px',
              borderRadius: '12px',
              backgroundColor: theme.accent,
              color: 'white',
              textDecoration: 'none',
              maxWidth: '600px'
            }}
          >
            <p style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>
              {item.title}
            </p>
            {item.text && (
              <p style={{ fontSize: '14px', opacity: 0.9, marginBottom: '12px' }}>
                {item.text}
              </p>
            )}
            <p style={{ fontSize: '12px', opacity: 0.75 }}>
              🔗 Click to visit
            </p>
          </a>
        )
      
      default:
        return null
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(8px)',
          zIndex: 9998
        }}
      />
      
      {/* Modal */}
      <div 
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '90vw',
          maxWidth: '900px',
          maxHeight: '85vh',
          backgroundColor: theme.bg,
          borderRadius: '24px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          zIndex: 9999
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <div style={{ width: '40px' }} />
          <div style={{
            fontFamily: 'Tomorrow, sans-serif',
            fontWeight: 900,
            color: 'white',
            fontSize: '32px',
            letterSpacing: '-1px'
          }}>
            RANDOM
          </div>
          <button 
            onClick={onClose}
            style={{
              padding: '8px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'white'
            }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px',
          minHeight: '300px'
        }}>
          {renderContent()}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          {/* Like/Dislike */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              onClick={handleLike}
              style={{
                padding: '12px',
                borderRadius: '50%',
                backgroundColor: liked ? theme.accent : 'transparent',
                border: `2px solid ${liked ? theme.accent : 'white'}`,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Heart 
                size={24} 
                fill={liked ? 'white' : 'none'} 
                color="white"
              />
            </button>
            <button 
              onClick={handleDislike}
              style={{
                padding: '12px',
                borderRadius: '50%',
                backgroundColor: 'transparent',
                border: '2px solid white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.6
              }}
            >
              <Heart size={24} color="white" />
            </button>
          </div>

          {/* Random Again */}
          <button
            onClick={handleRandomAgain}
            style={{
              padding: '12px 32px',
              borderRadius: '50px',
              backgroundColor: theme.accent,
              border: 'none',
              color: 'white',
              fontFamily: 'Tomorrow, sans-serif',
              fontWeight: 900,
              fontSize: '16px',
              cursor: 'pointer',
              textTransform: 'uppercase'
            }}
          >
            {dict.modal.randomAgain}
          </button>

          {/* Share */}
          <button 
            onClick={handleShare}
            style={{
              padding: '12px',
              borderRadius: '50%',
              backgroundColor: 'transparent',
              border: '2px solid white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Share2 size={24} color="white" />
          </button>
        </div>
      </div>
    </>
  )
}