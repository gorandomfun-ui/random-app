/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_RANDOM_WAVE_V2: process.env.RANDOM_WAVE_V2_ENABLED !== '0' ? '1' : '0',
    NEXT_PUBLIC_RANDOM_PLAYER_V2: process.env.NEXT_PUBLIC_RANDOM_PLAYER_V2 || '1',
  },
  // The small model's runtime (native bindings) is for the ingestion server only; the site's build must never bundle it (the deploy of 2 October failed on it).
  experimental: { serverComponentsExternalPackages: ['@huggingface/transformers', 'onnxruntime-node', 'sharp'] },
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
