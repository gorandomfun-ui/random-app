export type AppNavigationPaths = {
  home: string
  random: string
  likes: string
}

export const PUBLIC_APP_PATHS: AppNavigationPaths = {
  home: '/',
  random: '/random',
  likes: '/likes',
}

export const CURATION_APP_PATHS: AppNavigationPaths = {
  home: '/admin/curation',
  random: '/admin/curation/random',
  likes: '/admin/curation/likes',
}
