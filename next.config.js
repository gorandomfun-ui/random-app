/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_RANDOM_WAVE_V2: process.env.RANDOM_WAVE_V2_ENABLED !== '0' ? '1' : '0',
    NEXT_PUBLIC_RANDOM_PLAYER_V2: process.env.NEXT_PUBLIC_RANDOM_PLAYER_V2 || '1',
  },
  // The small model's runtime (native bindings) is for the ingestion server only; the site's build must never bundle it (the deploy of 2 October failed on it).
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node', 'sharp'],
  // Next 15 keeps a dynamic page in the browser's router cache for 0 s where 14 kept it 30 s: kept at 30, as before.
  experimental: { staleTimes: { dynamic: 30 } },
  // Vercel's image optimizer is not used: only one local icon went through it, while the five hosts it allowed let anyone spend
  // the free plan's 5,000 transformations a month (18 October).
  images: { unoptimized: true },
  poweredByHeader: false,
  // The site is never shown inside another site's frame; its own pages may frame each other.
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
      ],
    }]
  },
}

module.exports = nextConfig
