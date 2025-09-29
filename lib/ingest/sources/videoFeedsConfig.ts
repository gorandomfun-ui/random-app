export type AwesomeListSource = {
  label: string
  url?: string
  path?: string
}

export type CuratedSubreddit = {
  name: string
  limit?: number
}

export const AWESOME_VIDEO_LISTS: AwesomeListSource[] = [
  {
    label: 'Awesome Creative Coding',
    url: 'https://raw.githubusercontent.com/terkelg/awesome-creative-coding/master/README.md',
  },
  {
    label: 'Awesome Streaming',
    url: 'https://raw.githubusercontent.com/bstellar/awesome-streaming/master/README.md',
  },
  {
    label: 'Awesome Video Intelligent Systems',
    url: 'https://raw.githubusercontent.com/rajathkumars/awesome-video/master/README.md',
  },
  {
    label: 'Weird Video Sources (local)',
    path: 'lib/ingest/sources/awesome/weird-video-sources.md',
  },
];

export const CURATED_SUBREDDITS: CuratedSubreddit[] = [
  { name: 'videos', limit: 60 },
  { name: 'funny', limit: 60 },
  { name: 'ObscureMedia', limit: 40 },
  { name: 'DeepIntoYouTube', limit: 40 },
  { name: 'VintageObscura', limit: 30 },
  { name: 'FullMoviesOnYouTube', limit: 30 },
  { name: 'Documentaries', limit: 30 },
  { name: 'CatastrophicFailure', limit: 30 },
  { name: 'ContagiousLaughter', limit: 30 },
  { name: 'Unexpected', limit: 30 },
  { name: 'PublicFreakout', limit: 30 },
  { name: 'BlackMagicFuckery', limit: 30 },
  { name: 'NatureIsFuckingLit', limit: 30 },
  { name: 'OddlySatisfying', limit: 30 },
  { name: 'Damnthatsinteresting', limit: 30 },
  { name: 'InternetIsBeautiful', limit: 40 },
  { name: 'interestingasfuck', limit: 35 },
  { name: 'LiveConcerts', limit: 25 },
  { name: 'StreetPerformers', limit: 25 },
  { name: 'NextFuckingLevel', limit: 30 },
  { name: 'PerfectTiming', limit: 25 },
  { name: 'WatchPeopleDieInside', limit: 25 },
  { name: 'KidsAreFuckingStupid', limit: 25 },
  { name: 'BeAmazed', limit: 25 },
  { name: 'therewasanattempt', limit: 35 },
  { name: 'HighQualityGifs', limit: 35 },
];
