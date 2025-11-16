import type { MiniGameId } from '@/lib/random/clientTypes'
import TapToNotTapGame from './games/TapToNotTapGame'
import EmojiEchoGame from './games/EmojiEchoGame'
import UselessProgressBarGame from './games/UselessProgressBarGame'
import LeftOrRightGame from './games/LeftOrRightGame'
import FakeLoadingRaceGame from './games/FakeLoadingRaceGame'
import ColorOffByOneGame from './games/ColorOffByOneGame'
import SteadySpotsGame from './games/SteadySpotsGame'

type Theme = { bg: string; deep: string; cream: string; text: string }

export type MiniGameResultDetail = {
  label: string
  value: string
}

export type MiniGameResult = {
  outcome: 'win' | 'lose'
  message?: string
  details?: MiniGameResultDetail[]
}

export type MiniGameRuntimeProps = {
  level: number
  seed: string
  onComplete: (result: MiniGameResult) => void
  theme: Theme
}

export type MiniGameDefinition = {
  id: MiniGameId
  name: string
  tagline: string
  instructions: string[]
  Component: (props: MiniGameRuntimeProps) => JSX.Element | null
}

export const MINI_GAME_DEFINITIONS: Record<MiniGameId, MiniGameDefinition> = {
  'tap-to-not-tap': {
    id: 'tap-to-not-tap',
    name: 'Tap-to-not-Tap',
    tagline: 'Suit le rythme sans te tromper.',
    instructions: [
      "Les flashs TAP / DON'T TAP sont séparés par de vrais blancs.",
      "Clique uniquement pendant TAP, reste immobile pendant DON'T TAP.",
      'Au niveau 1–2, seulement 2 erreurs possibles.',
    ],
    Component: TapToNotTapGame,
  },
  'emoji-echo': {
    id: 'emoji-echo',
    name: 'Emoji Echo',
    tagline: 'Souviens-toi de la séquence.',
    instructions: [
      'Deux séquences à retenir par niveau : ex. 2 puis 3 emojis.',
      'Chaque séquence est rejouée depuis zéro avec de nouveaux emojis.',
      'Reproduis-les sans faute avant la fin du chrono.',
    ],
    Component: EmojiEchoGame,
  },
  'useless-progress-bar': {
    id: 'useless-progress-bar',
    name: 'Useless Progress Bar',
    tagline: 'Une barre qui ne finit jamais… ou presque.',
    instructions: [
      'Maintiens le bouton pour charger la barre en continu.',
      'Relâche exactement sur la cible indiquée (± tolérance).',
      'Chaque dépassement fait perdre instantanément.',
    ],
    Component: UselessProgressBarGame,
  },
  'left-or-right': {
    id: 'left-or-right',
    name: 'Left or Right?',
    tagline: 'Préfère la flèche la moins fréquente.',
    instructions: [
      'Observe les dernières flèches (5 à 9 selon ton niveau).',
      'Choisis celle la moins utilisée.',
      'Limite tes erreurs successives.',
    ],
    Component: LeftOrRightGame,
  },
  'fake-loading-race': {
    id: 'fake-loading-race',
    name: 'Loading Race',
    tagline: 'Parie sur le loader gagnant.',
    instructions: [
      'Choisis ton loader (3 à 5 barres) avant le départ.',
      'Tu peux changer de pari une seule fois pendant la course.',
      'Observe les variations de vitesse et devine la barre gagnante.',
    ],
    Component: FakeLoadingRaceGame,
  },
  'color-off-by-one': {
    id: 'color-off-by-one',
    name: 'Color Off-By-One',
    tagline: 'Une nuance presque identique.',
    instructions: [
      'Observe la grille (3×3 qui passe en 5×5).',
      'Clique la nuance légèrement différente.',
      'Plus ton niveau monte, plus les teintes se rapprochent.',
    ],
    Component: ColorOffByOneGame,
  },
  'steady-spots': {
    id: 'steady-spots',
    name: 'Steady Spots',
    tagline: 'Atterris sur chaque spot sans trembler.',
    instructions: [
      'Atteins chaque halo dans l’ordre indiqué.',
      'Maintiens le pointeur dessus ~2 s sans bouger pour valider.',
      'Les niveaux avancés ajoutent des spots et réduisent leur taille.',
    ],
    Component: SteadySpotsGame,
  },
}

export function getMiniGameDefinition(id: MiniGameId): MiniGameDefinition {
  return MINI_GAME_DEFINITIONS[id]
}
