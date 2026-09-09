/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_RANDOM_PLAYER_V2: process.env.NEXT_PUBLIC_RANDOM_PLAYER_V2 || '1',
  },
  images: {
    domains: [
      'i.ytimg.com',
      'images.unsplash.com',
      'picsum.photos',
      'loremflickr.com',
      'media.giphy.com'
    ],
  },
}

module.exports = nextConfig
