export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/mongodb'

export async function POST(request: Request) {
  try {
    const { itemId } = await request.json()
    
    if (!itemId) {
      return NextResponse.json(
        { error: 'Item ID required' },
        { status: 400 }
      )
    }
    
    const db = await getDatabase()
    const collection = db.collection('items')
    
    // Incrémenter dislikeCount et réduire showWeight
    const result = await collection.updateOne(
      { _id: itemId },
      { 
        $inc: { dislikeCount: 1 },
        $mul: { showWeight: 0.9 } // Réduit de 10%
      }
    )
    
    // Optionnel : suppression si trop de dislikes
    const item = await collection.findOne({ _id: itemId })
    if (item && item.dislikeCount >= 10000) {
      await collection.updateOne(
        { _id: itemId },
        { $set: { isSuppressed: true } }
      )
    }
    
    return NextResponse.json({ success: true })
    
  } catch (error) {
    console.error('Error in dislike:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
