/**
 * The category the uploader chose, as a last resort for the universe: when
 * no subject and no word of the title decides, YouTube's "Sports" or
 * Dailymotion's "videogames" still says where a video belongs. On 27
 * September a third of what entered sat in "other", mostly titles in
 * languages the cue words do not cover; the category is the same in every
 * language.
 *
 * Never cinema: film and TV categories are left out on purpose, cinema had
 * swallowed enough. Nor the catch-alls (YouTube's "Entertainment",
 * Dailymotion's "people", which is celebrity news, and "webcam").
 */

import type { Universe } from '../types'

/** YouTube's category ids. */
const YOUTUBE: Record<string, Universe> = {
  '2': 'vehicles', // Autos & Vehicles
  '10': 'music', // Music
  '15': 'nature-animals', // Pets & Animals
  '17': 'sport', // Sports
  '19': 'travel', // Travel & Events
  '20': 'gaming', // Gaming
  '22': 'people-everyday', // People & Blogs
  '23': 'humor-memes', // Comedy
  '25': 'news-society', // News & Politics
  '26': 'craft', // Howto & Style
  '27': 'science', // Education
  '28': 'tech', // Science & Technology
}

/** Dailymotion's channel ids. */
const DAILYMOTION: Record<string, Universe> = {
  animals: 'nature-animals',
  auto: 'vehicles',
  creation: 'art',
  fun: 'humor-memes',
  kids: 'animation',
  lifestyle: 'people-everyday',
  music: 'music',
  news: 'news-society',
  school: 'science',
  sport: 'sport',
  tech: 'tech',
  travel: 'travel',
  videogames: 'gaming',
}

export function universeFromCategory(provider: string | null | undefined, categoryId: string | null | undefined): Universe | null {
  const category = (categoryId ?? '').trim().toLowerCase()
  if (!category) return null
  const source = (provider ?? '').trim().toLowerCase()
  if (source === 'youtube' || source === 'reddit-youtube') return YOUTUBE[category] ?? null
  if (source === 'dailymotion') return DAILYMOTION[category] ?? null
  return null
}
