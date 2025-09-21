import { Item, LikedItem } from '@/types'

const LIKES_KEY = 'random_likes'
const MAX_LIKES = 6
const TTL_HOURS = 24

export function getLikes(): LikedItem[] {
  if (typeof window === 'undefined') return []
  
  try {
    const stored = localStorage.getItem(LIKES_KEY)
    if (!stored) return []
    
    const likes: LikedItem[] = JSON.parse(stored)
    const now = Date.now()
    const ttlMs = TTL_HOURS * 60 * 60 * 1000
    
    // Filtrer les likes expirés
    const validLikes = likes.filter(like => 
      (now - like.likedAt) < ttlMs
    )
    
    // Mettre à jour si des likes ont expiré
    if (validLikes.length !== likes.length) {
      localStorage.setItem(LIKES_KEY, JSON.stringify(validLikes))
    }
    
    return validLikes
  } catch {
    return []
  }
}

export function addLike(item: Item): boolean {
  const likes = getLikes()
  
  // Vérifier si déjà liké
  if (likes.some(l => l._id === item._id)) {
    return false
  }
  
  // Vérifier la limite
  if (likes.length >= MAX_LIKES) {
    return false
  }
  
  const likedItem: LikedItem = {
    ...item,
    likedAt: Date.now()
  }
  
  const newLikes = [...likes, likedItem]
  localStorage.setItem(LIKES_KEY, JSON.stringify(newLikes))
  
  return true
}

export function removeLike(itemId: string): void {
  const likes = getLikes()
  const filtered = likes.filter(l => l._id !== itemId)
  localStorage.setItem(LIKES_KEY, JSON.stringify(filtered))
}

export function isLiked(itemId: string): boolean {
  return getLikes().some(l => l._id === itemId)
}

export function canAddMoreLikes(): boolean {
  return getLikes().length < MAX_LIKES
}