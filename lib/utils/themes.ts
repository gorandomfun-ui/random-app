import { Theme } from '@/types'

export const themes: Theme[] = [
  { name: 'theme-1', bg: '#f8c021', accent: '#ff3500' },
  { name: 'theme-2', bg: '#ff7a3b', accent: '#b90045' },
  { name: 'theme-3', bg: '#347ad9', accent: '#0013a4' },
  { name: 'theme-4', bg: '#ff3500', accent: '#ffc300' },
  { name: 'theme-5', bg: '#00d440', accent: '#007861' },
  { name: 'theme-6', bg: '#7706b2', accent: '#4ecc7f' },
]

export function getRandomTheme(): Theme {
  return themes[Math.floor(Math.random() * themes.length)]
}

export function getThemeByName(name: string): Theme {
  return themes.find(t => t.name === name) || themes[0]
}