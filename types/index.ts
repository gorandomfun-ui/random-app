export interface Item {
  _id: string;
  type: 'image' | 'quote' | 'video' | 'joke' | 'web' | 'fact';
  source: string;
  externalId: string;
  title?: string;
  text?: string;
  url?: string;
  thumb?: string;
  lang: 'en' | 'fr' | 'de' | 'jp' | 'unknown';
  tags: string[];
  isSafe: boolean;
  createdAt: string;
  freshness: number;
  quality: number;
  likeCount: number;
  dislikeCount: number;
  showWeight: number;
  isSuppressed: boolean;
}

export interface LikedItem extends Item {
  likedAt: number;
}

export type ContentType = Item['type'];

export interface Theme {
  bg: string;
  accent: string;
  name: string;
}

export type Language = 'en' | 'fr' | 'de' | 'jp';

export interface Dictionary {
  hero: {
    tagline1: string;
    tagline2: string;
    tagline3: string;
    startButton: string;
  };
  nav: {
    images: string;
    videos: string;
    web: string;
    quotes: string;
    jokes: string;
    facts: string;
  };
  footer: {
    social: string;
    legal: string;
    share: string;
  };
  modal: {
    randomAgain: string;
    like: string;
    dislike: string;
    share: string;
  };
  likes: {
    title: string;
    empty: string;
    maxReached: string;
  };
  shuffle: {
    title: string;
    all: string;
    imagesVideos: string;
    imagesOnly: string;
  };
}