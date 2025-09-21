import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/mongodb'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')
    
    if (secret !== 'your-secret-key') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const db = await getDatabase()
    const collection = db.collection('items')
    let totalInserted = 0
    
    // icanhazdadjoke API
    for (let i = 0; i < 50; i++) {
      const response = await fetch('https://icanhazdadjoke.com/', {
        headers: { 'Accept': 'application/json' }
      })
      const joke = await response.json()
      
      try {
        await collection.insertOne({
          type: 'joke',
          source: 'icanhazdadjoke',
          externalId: joke.id,
          title: null,
          text: joke.joke,
          url: null,
          thumb: null,
          lang: 'en',
          tags: ['dad-joke'],
          isSafe: true,
          createdAt: new Date(),
          freshness: Math.random(),
          quality: Math.random(),
          likeCount: 0,
          dislikeCount: 0,
          showWeight: 1.0,
          isSuppressed: false
        })
        totalInserted++
      } catch (error: any) {
        if (error.code !== 11000) console.error('Insert error:', error)
      }
      
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    return NextResponse.json({ 
      success: true, 
      inserted: totalInserted
    })
    
  } catch (error) {
    console.error('Jokes ingestion error:', error)
    return NextResponse.json({ error: 'Ingestion failed' }, { status: 500 })
  }
}