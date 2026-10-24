/**
 * RANDOM FIGHTER's cut-out fighters and their sizes on the play's grid —
 * written by `scripts/games/fighter-sprites.ts` (the pictures themselves in
 * `public/games/fighter/`). Generated — do not edit by hand.
 */

export const FIGHTER_SPRITES = {
  'ninja-guard': {
    'width': 151,
    'height': 109
  },
  'ninja-kick': {
    'width': 158,
    'height': 79
  },
  'samurai-guard': {
    'width': 152,
    'height': 128
  },
  'samurai-crouch': {
    'width': 122,
    'height': 79
  },
  'burger-ninja-a': {
    'width': 59,
    'height': 45
  },
  'burger-ninja-b': {
    'width': 67,
    'height': 51
  }
} as const
export type FighterSprite = keyof typeof FIGHTER_SPRITES
