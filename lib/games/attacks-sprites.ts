/**
 * RANDOM ATTACKS' sprites, drawn by hand at the size they are played, in
 * the colours of the owner's picture: the burgers from space — a slider, a
 * cheeseburger and a double, each on its ring and its jet, two frames (the
 * jet flickers, the light runs round the ring) — the golden one that crosses
 * the top, the cook with his ketchup up, what flies both ways, the bonuses,
 * and the stacks of diner plates the cook hides behind. Rows of characters
 * as in \`sprites.ts\`: a character maps to a colour, '.' is transparent,
 * \`k\` is the ink outline.
 */

import { mix, PixelBuffer, type Palette, type Sprite } from './pixels'

const INK = '#1a0c0a'

// ---------------------------------------------------------------- the burgers from space

/**
 * Sesame bun \`B\` light, \`b\`, \`d\` shade, seeds \`s\`; lettuce \`g\`/\`G\`;
 * cheese \`c\`/\`C\`; tomato \`r\`; patty \`p\`, \`P\` its dark, \`q\` its grain;
 * the bottom bun \`n\`/\`N\`; the ring \`R\`, \`Y\`, its light \`Z\`; the jet
 * \`f\` white-hot, \`F\`, \`e\`, \`E\` cooling to red.
 */
export const BURGER_PALETTE: Palette = {
  k: INK, B: '#facc82', b: '#e28c42', d: '#b25826', s: '#fff4d6',
  g: '#54c448', G: '#228034', c: '#ffd030', C: '#e49618', r: '#e2341e',
  p: '#6e2c1c', P: '#40160e', q: '#9c5436', n: '#d67c3a', N: '#9c481e',
  R: '#ff5c24', Y: '#ffb240', Z: '#fff0b0',
  f: '#fffce2', F: '#ffd240', e: '#ff8a2a', E: '#d2381e',
}
/** The golden one: the same burger in gold, worth the most. */
export const GOLD_PALETTE: Palette = {
  ...BURGER_PALETTE,
  B: '#fff6be', b: '#ffce3c', d: '#d69614', s: '#fffff0', g: '#ffe878', G: '#dcaa28', c: '#fff8c8', C: '#f0c850',
  r: '#ffbe3c', p: '#c88214', P: '#8c540a', q: '#f0be46', n: '#f0b432', N: '#b47814',
}

export const BURGER_SMALL: Sprite[] = [
  [
    '.........kkkkkk.........',
    '.......kkbBBbbdkk.......',
    '......kbBBsbbsbddk......',
    '.....kbBsBbbbbsbddk.....',
    '....kbBBbbbsbbbbbddk....',
    '....kBBBBBBBBBBBBbdk....',
    '...kgGgGggGgGggGgGgGk...',
    'ZYRRRpppqppppqppPPPRRRRY',
    '....kPPPPPpPPPPPPPPk....',
    '....knnnnnnnnnnnnNNk....',
    '.....kNNNNNNNNNNNNk.....',
    '......kkkEeFFeEkkk......',
    '..........eFFe..........',
    '..........EffE..........',
    '...........Ee...........',
    '........................',
  ],
  [
    '.........kkkkkk.........',
    '.......kkbBBbbdkk.......',
    '......kbBBsbbsbddk......',
    '.....kbBsBbbbbsbddk.....',
    '....kbBBbbbsbbbbbddk....',
    '....kBBBBBBBBBBBBbdk....',
    '...kgGgGggGgGggGgGgGk...',
    'YRRRRpppqppppqppPPPRRRYZ',
    '....kPPPPPpPPPPPPPPk....',
    '....knnnnnnnnnnnnNNk....',
    '.....kNNNNNNNNNNNNk.....',
    '......kkkEeFFeEkkk......',
    '..........eFFe..........',
    '...........Ee...........',
    '........................',
    '........................',
  ],
]

export const BURGER_MID: Sprite[] = [
  [
    '...........kkkkkkkk...........',
    '.........kkbBBBbbbdkk.........',
    '.......kkbBBBBbbsbbbdkk.......',
    '......kbBBsBBbbbbbbsbddk......',
    '.....kbBBBBbbsbbbbbbbbddk.....',
    '....kbBsBbbbbbbbsbbbbbbddk....',
    '....kbbbbbbsbbbbbbbbsbdddk....',
    '....kBBBBBBBBBBBBBBBBBBddk....',
    '...kgGgGggGggGgGggGggGgGgGk...',
    '...kGrrcccrrrrrrrcccrrrrrgk...',
    '....kppCcpqpppppppCcpqpppk....',
    'ZYRRRPppCpppqppppppCppPPPRRRRY',
    '....kPPPPpPPPPPPpPPPPPPPPk....',
    '....knnnnnnnnnnnnnnnnnnNNk....',
    '.....kNNNNNNNNNNNNNNNNNNk.....',
    '......kkkkkEeFFFFeEkkkkk......',
    '............eFffFe............',
    '............EFffFE............',
    '.............eFFe.............',
    '.............EeeE.............',
    '..............Ee..............',
    '..............................',
  ],
  [
    '...........kkkkkkkk...........',
    '.........kkbBBBbbbdkk.........',
    '.......kkbBBBBbbsbbbdkk.......',
    '......kbBBsBBbbbbbbsbddk......',
    '.....kbBBBBbbsbbbbbbbbddk.....',
    '....kbBsBbbbbbbbsbbbbbbddk....',
    '....kbbbbbbsbbbbbbbbsbdddk....',
    '....kBBBBBBBBBBBBBBBBBBddk....',
    '...kgGgGggGggGgGggGggGgGgGk...',
    '...kGrrcccrrrrrrrcccrrrrrgk...',
    '....kppCcpqpppppppCcpqpppk....',
    'YRRRRPppCpppqppppppCppPPPRRRYZ',
    '....kPPPPpPPPPPPpPPPPPPPPk....',
    '....knnnnnnnnnnnnnnnnnnNNk....',
    '.....kNNNNNNNNNNNNNNNNNNk.....',
    '......kkkkkEeFFFFeEkkkkk......',
    '............eFffFe............',
    '.............eFFe.............',
    '..............Ee..............',
    '..............................',
    '..............................',
    '..............................',
  ],
]

export const BURGER_BIG: Sprite[] = [
  [
    '............kkkkkkkkkk............',
    '..........kkbBBBBbbbbdkk..........',
    '........kkbBBBsBBbbbbsbdkk........',
    '.......kbBBsBBBbbbbbbbsbddk.......',
    '......kbBBBBBbbsbbbbbbbbbddk......',
    '.....kbBsBBbbbbbbbsbbbbbsbddk.....',
    '....kbBBBbbbbsbbbbbbbbbbbbdddk....',
    '....kbbbbbbbbbbbbsbbbbbbbbdddk....',
    '....kBBBBBBBBBBBBBBBBBBBBBbddk....',
    '...kgGgGggGggGgGggGggGgGgGgGgGk...',
    '...kGrrrrcccrrrrrrrrrcccrrrrrk....',
    '....kpppqpCcppqpppppppCcpqpppk....',
    '....kPPpPPCPPPPpPPPPPPCPPPpPPk....',
    'ZYRRRcccccccccccccccccccccCCCRRRRY',
    '....kppqppppppCcpqpppppppCpppk....',
    '....kPPPPpPPPPCPPpPPPPPPPPpPPk....',
    '....knnnnnnnnnnnnnnnnnnnnnnNNk....',
    '.....kNNNNNNNNNNNNNNNNNNNNNNk.....',
    '......kkkkkkEeFFFFFFeEkkkkkk......',
    '.............eFfffffF.............',
    '.............EFffffFE.............',
    '..............eFffFe..............',
    '..............EFFFFE..............',
    '...............eFFe...............',
    '...............EeeE...............',
    '................Ee................',
    '..................................',
  ],
  [
    '............kkkkkkkkkk............',
    '..........kkbBBBBbbbbdkk..........',
    '........kkbBBBsBBbbbbsbdkk........',
    '.......kbBBsBBBbbbbbbbsbddk.......',
    '......kbBBBBBbbsbbbbbbbbbddk......',
    '.....kbBsBBbbbbbbbsbbbbbsbddk.....',
    '....kbBBBbbbbsbbbbbbbbbbbbdddk....',
    '....kbbbbbbbbbbbbsbbbbbbbbdddk....',
    '....kBBBBBBBBBBBBBBBBBBBBBbddk....',
    '...kgGgGggGggGgGggGggGgGgGgGgGk...',
    '...kGrrrrcccrrrrrrrrrcccrrrrrk....',
    '....kpppqpCcppqpppppppCcpqpppk....',
    '....kPPpPPCPPPPpPPPPPPCPPPpPPk....',
    'YRRRRcccccccccccccccccccccCCCRRRYZ',
    '....kppqppppppCcpqpppppppCpppk....',
    '....kPPPPpPPPPCPPpPPPPPPPPpPPk....',
    '....knnnnnnnnnnnnnnnnnnnnnnNNk....',
    '.....kNNNNNNNNNNNNNNNNNNNNNNk.....',
    '......kkkkkkEeFFFFFFeEkkkkkk......',
    '.............eFfffffF.............',
    '..............eFffFe..............',
    '...............eFFe...............',
    '................Ee................',
    '..................................',
    '..................................',
    '..................................',
    '..................................',
  ],
]


/**
 * The same three burgers diving, as in the owner's picture: turned a fifth
 * of a right angle, the right side up, the jet trailing down behind
 * (enlarged eight times by Scale2x, turned, brought back, outlined again).
 */
export const BURGER_BIG_TILT: Sprite[] = [
  [
    '.................k.................',
    '..............kkkdkkkkkk...........',
    '...........kkkbbbbsbddddkk.........',
    '.........kkBBBbbbbbsbbddddk........',
    '........kbBsBBbbbbbbbbsbdddk.......',
    '.......kBBBBBbbbbbbbbbbbdddk.......',
    '......kkBsBBbsbbsbbbbbbbbdddk......',
    '.....kbBBBBbbbbbbbbbbBBBGgGgk......',
    '.....kBBBBbbbbbbsbBBBgGgGrrrk......',
    '....kbBBBbbbbbbBBBggGgcrrpppk..RRY.',
    '...kbBBBbbbbBBBggGrrccccpPpPCRR....',
    '...kbBbbbBBBGgGrrrrpppCPPcCCpk.....',
    '...kbbBBBGGgrrrrpppPPPcccCCppk.....',
    '....kBgGgcccppqppPPcccpppPPpPNk....',
    '...kgGrrrpCcpPPpcccpppPPPPnnNk.....',
    '...kGrppqpCCPccccpqpPPPnnnNNNk.....',
    '....kkPppPcccppCPPpnnnnNNNkkk......',
    '.....kPcccpppPPCnnnnNNNEkk.........',
    '....RRcpqpppPnnnnNNNFFF............',
    '.ZYR..kPPPnnnNNNNFFFffF............',
    '......knnnNNNNEeFFffffF............',
    '.......kNNNkkk..eFfffFe............',
    '........kkk......FFfFFE............',
    '.................EFFFFe............',
    '...................eeeE............',
    '...................EEe.............',
    '...................................',
  ],
  [
    '.................k.................',
    '..............kkkdkkkkkk...........',
    '...........kkkbbbbsbddddkk.........',
    '.........kkBBBbbbbbsbbddddk........',
    '........kbBsBBbbbbbbbbsbdddk.......',
    '.......kBBBBBbbbbbbbbbbbdddk.......',
    '......kkBsBBbsbbsbbbbbbbbdddk......',
    '.....kbBBBBbbbbbbbbbbBBBGgGgk......',
    '.....kBBBBbbbbbbsbBBBgGgGrrrk......',
    '....kbBBBbbbbbbBBBggGgcrrpppk..RYZ.',
    '...kbBBBbbbbBBBggGrrccccpPpPCRR....',
    '...kbBbbbBBBGgGrrrrpppCPPcCCpk.....',
    '...kbbBBBGGgrrrrpppPPPcccCCppk.....',
    '....kBgGgcccppqppPPcccpppPPpPNk....',
    '...kgGrrrpCcpPPpcccpppPPPPnnNk.....',
    '...kGrppqpCCPccccpqpPPPnnnNNNk.....',
    '....kkPppPcccppCPPpnnnnNNNkkk......',
    '.....kPcccpppPPCnnnnNNNEkk.........',
    '....RRcpqpppPnnnnNNNFFF............',
    '.YRR..kPPPnnnNNNNFFFffF............',
    '......knnnNNNNEeFffffe.............',
    '.......kNNNkkk..eFFfFe.............',
    '........kkk......eeFee.............',
    '....................e..............',
    '...................................',
  ],
]
export const BURGER_MID_TILT: Sprite[] = [
  [
    '.............kkk.k............',
    '..........kkkbbdkdkkk.........',
    '........kkBBbbbbbbbddkk.......',
    '.......kbBBBbbbbbbbbbddk......',
    '......kBBBBbbbbbbbbbbddk......',
    '.....kkBsBbsbbsbbbsbddddk.....',
    '....kbBBBbbbbbbbbBBBBgGggk....',
    '....kbBBbbbbbbBBBBggGrrrk..RY.',
    '...kbBsbbbsBBBBggGcrrpppPRR...',
    '...kbbbbBBBgGgGrccccppPPPk....',
    '...kbBBBgGggrrrpppCCpPPPPk....',
    '...kBGgGgcrrppppppPPPnnNNk....',
    '...kGGrccpqpqpppppnnnnNNk.....',
    '...kGrppCpppPPPnnnnNNNkk......',
    '....kpppCPpPnnnNNNNEkk........',
    '...RRRPPPnnnNNNNFFe...........',
    '.ZY..knnnNNNNeeFfFFE..........',
    '......kkNkkkk.eFffF...........',
    '........k.....EFFFe...........',
    '...............eeee...........',
    '................EEe...........',
    '..............................',
  ],
  [
    '.............kkk.k............',
    '..........kkkbbdkdkkk.........',
    '........kkBBbbbbbbbddkk.......',
    '.......kbBBBbbbbbbbbbddk......',
    '......kBBBBbbbbbbbbbbddk......',
    '.....kkBsBbsbbsbbbsbddddk.....',
    '....kbBBBbbbbbbbbBBBBgGggk....',
    '....kbBBbbbbbbBBBBggGrrrk..YZ.',
    '...kbBsbbbsBBBBggGcrrpppPRR...',
    '...kbbbbBBBgGgGrccccppPPPk....',
    '...kbBBBgGggrrrpppCCpPPPPk....',
    '...kBGgGgcrrppppppPPPnnNNk....',
    '...kGGrccpqpqpppppnnnnNNk.....',
    '...kGrppCpppPPPnnnnNNNkk......',
    '....kpppCPpPnnnNNNNEkk........',
    '...RRRPPPnnnNNNNFFe...........',
    '.YR..knnnNNNNeeFffe...........',
    '......kkNkkkk.eFFFe...........',
    '........k.......Ee............',
    '..............................',
  ],
]
export const BURGER_SMALL_TILT: Sprite[] = [
  [
    '............kkk..........',
    '.........kkkbddkkk.......',
    '........kBBbsbbdddk......',
    '.......kbBbbbsbbdddk.....',
    '......kBBBbbbbbbBbdk..RY.',
    '.....kbBsbbsbBBBgGgRRR...',
    '.....kbBBBBBBgggPPPPk....',
    '....kbBBBBgGgpqpPPPNk....',
    '.....kBgGgpppPPPnnNNk....',
    '....kgGppqPpPnnnNNNk.....',
    '....RRpPPPnnnNNNNkk......',
    '.ZYR..knnnNNNFFek........',
    '.......kNNkEeFFe.........',
    '........kk...eff.........',
    '.............EEe.........',
    '.........................',
  ],
  [
    '............kkk..........',
    '.........kkkbddkkk.......',
    '........kBBbsbbdddk......',
    '.......kbBbbbsbbdddk.....',
    '......kBBBbbbbbbBbdk..YZ.',
    '.....kbBsbbsbBBBgGgRRR...',
    '.....kbBBBBBBgggPPPPk....',
    '....kbBBBBgGgpqpPPPNk....',
    '.....kBgGgpppPPPnnNNk....',
    '....kgGppqPpPnnnNNNk.....',
    '....RRpPPPnnnNNNNkk......',
    '.YRR..knnnNNNFFek........',
    '.......kNNkEeFFe.........',
    '........kk...eEe.........',
    '.........................',
  ],
]

/**
 * The double for the title's near burgers, at the landscape's fineness:
 * enlarged by Scale2x, the dome lit again from the upper left, sesame, the
 * lettuce frilled, the patty's grain; diving like the others.
 */
export const BURGER_FINE_TILT: Sprite[] = [
  [
    '................................kk................................',
    '.............................kkkbbkkkkkkk.........................',
    '..........................kkkbbbbbbbbbbbbkkkk.....................',
    '.......................kkkbbbbbbsssbbbbbbbbbbkk...................',
    '....................kkkbbbbbbbbssbdbbbbbssbbdddkk.................',
    '.................kkkbbbbbbbbbbbssbbbbbbbbddddddddkk...............',
    '................kbbbbbbbbbbbbbbbbbbbbbbbbddddddddddk..............',
    '................kbbbbbsdbbbbssdbbbbbbbssssddddddddddk.............',
    '..............kkbbbbbbbbbbbbsdbbbbbbbsddddddddddddddk.............',
    '.............kbbbbssbbbbbbbbbdbbbbbbbdddddddddddddddk.............',
    '.............kbbbbbdbsbbbbbbbbbbbbdddddddddddddddddddkk...........',
    '...........kksdbbbbbbddbbbbbssssbddddddddddddddddddddggk..........',
    '..........kbbbssssbbbbbbbbbbbbddddddddddddddBBBdddGGgggk..........',
    '.........kbbbbsdbdbbbbbbbbbbbbddddddddddBBBBBBBggggggrk...........',
    '........kbbbbbbbbbbbbbbbbbbbdddddddddBBBBBBBggggGGggrrk...........',
    '........kbbbbbbbsbbbbbbbbbbdddddddBBBBBBBGGggggrrrgGrrk...........',
    '........kbbbbbbbbdbbbbbbbddddddBBBBBBBggGGggGGrrrrGppPpk........Y.',
    '.......kbbbbbbbbbbbbbbbbddddBBBBBBBggggGGcccrrrrPppppppk.....RRYY.',
    '.......kbbbbbbbbbbbbbbdddBBBBBBBGGggggcccccccpppppppPppk.RRRRRRR..',
    '......kbbbbbbbbbbbbbbdBBBBBBgggggggrrrrccccccpppppppppCCRRRRR.....',
    '.....kbbbbbbbbbbbbbBBBBBBGggggGGrggrrrPppCCccpppPppCCCCCRR........',
    '.....kbbbbbbbbbbBBBBBBgGGGgggrrrrGGpqpPpppCCpqppccCCCCCPk.........',
    '.....kbbbbbbbBBBBBBgggGgggrGGrrrqqPppPPpppCCpcccccCCpppPPk........',
    '.....kbbbbBBBBBBGGgggGGrrrrrrPpppPppppPpPpcccccccCCpPppppk........',
    '......kBBBBBBgggggggccrrrrppPPqpPpppppqccccccppppCCppppppk........',
    '......kBBBgggGGgggccccrppqPqPppPPpPPccccccppqpppppPppppNNk........',
    '......kGGggggrrrgGccccpppppqppppqccccccppPppPPppqpppnNNNNk........',
    '.....kGGggGGrrrrGPCCccpppppPppccccccpqPPPPppqPppqnnnnNNNNk........',
    '.....kgggrrrrrqpPppCCqpppPpccccccPpPPppppPPppPnnnnnnNNNNk.........',
    '......kGrrrpPppPPppCCpppcccccccccpqppPppppPnnnnnnNNNNNNk..........',
    '.......kkqpppPqppppCCccccccqCcccqppqpPPpnnnnnnNNNNNNNkk...........',
    '........kpppqpPppcccccccqppqCCpppppppnnnnnnNNNNNNNkkk.............',
    '........kPppppcccccccpPpppPPCCppppnnnnnnNNNNNNNkkk................',
    '.........kpcccccccpppppppPPppCCnnnnnnNNNNNNNEkk...................',
    '........RRcccccppppPppppPPPqnnnnnnNNNNNNNFeeE.....................',
    '.....RRRRRccPpppPPppPPPpPnnnnnnNNNNNNNFFFFFF......................',
    '..YYRRRRR.kppppppppPqnnnnnnnNNNNNNFFFFFFFfFF......................',
    '.ZZYY.....kppPPPpPnnnnnnnNNNNNNFFFFFFFffffFFF.....................',
    '.Z........kpppPnnnnnnnNNNNNNeeFFFFFfffffffFF......................',
    '...........knnnnnnnNNNNNNkkEeeeFFFfffffffFFE......................',
    '............knnnNNNNNNkkk....eeFFffffffffFFe......................',
    '.............kkNNNNkkk.......eeFFFffffffFFee......................',
    '...............kkkk...........EEFFFffffFFFEE......................',
    '...............................EFFFFFfFFFFEE......................',
    '................................eeFFFFFFFFF.......................',
    '.................................EEFFFFFFFe.......................',
    '..................................EFFFFFeee.......................',
    '...................................eeeeeeeE.......................',
    '....................................eeeeee........................',
    '....................................EEEeee........................',
    '.....................................EEEe.........................',
    '..................................................................',
  ],
  [
    '................................kk................................',
    '.............................kkkbbkkkkkkk.........................',
    '..........................kkkbbbbbbbbbbbbkkkk.....................',
    '.......................kkkbbbbbbsssbbbbbbbbbbkk...................',
    '....................kkkbbbbbbbbssbdbbbbbssbbdddkk.................',
    '.................kkkbbbbbbbbbbbssbbbbbbbbddddddddkk...............',
    '................kbbbbbbbbbbbbbbbbbbbbbbbbddddddddddk..............',
    '................kbbbbbsdbbbbssdbbbbbbbssssddddddddddk.............',
    '..............kkbbbbbbbbbbbbsdbbbbbbbsddddddddddddddk.............',
    '.............kbbbbssbbbbbbbbbdbbbbbbbdddddddddddddddk.............',
    '.............kbbbbbdbsbbbbbbbbbbbbdddddddddddddddddddkk...........',
    '...........kksdbbbbbbddbbbbbssssbddddddddddddddddddddggk..........',
    '..........kbbbssssbbbbbbbbbbbbddddddddddddddBBBdddGGgggk..........',
    '.........kbbbbsdbdbbbbbbbbbbbbddddddddddBBBBBBBggggggrk...........',
    '........kbbbbbbbbbbbbbbbbbbbdddddddddBBBBBBBggggGGggrrk...........',
    '........kbbbbbbbsbbbbbbbbbbdddddddBBBBBBBGGggggrrrgGrrk...........',
    '........kbbbbbbbbdbbbbbbbddddddBBBBBBBggGGggGGrrrrGppPpk........Z.',
    '.......kbbbbbbbbbbbbbbbbddddBBBBBBBggggGGcccrrrrPppppppk.....YYZZ.',
    '.......kbbbbbbbbbbbbbbdddBBBBBBBGGggggcccccccpppppppPppk.RRRRRYY..',
    '......kbbbbbbbbbbbbbbdBBBBBBgggggggrrrrccccccpppppppppCCRRRRR.....',
    '.....kbbbbbbbbbbbbbBBBBBBGggggGGrggrrrPppCCccpppPppCCCCCRR........',
    '.....kbbbbbbbbbbBBBBBBgGGGgggrrrrGGpqpPpppCCpqppccCCCCCPk.........',
    '.....kbbbbbbbBBBBBBgggGgggrGGrrrqqPppPPpppCCpcccccCCpppPPk........',
    '.....kbbbbBBBBBBGGgggGGrrrrrrPpppPppppPpPpcccccccCCpPppppk........',
    '......kBBBBBBgggggggccrrrrppPPqpPpppppqccccccppppCCppppppk........',
    '......kBBBgggGGgggccccrppqPqPppPPpPPccccccppqpppppPppppNNk........',
    '......kGGggggrrrgGccccpppppqppppqccccccppPppPPppqpppnNNNNk........',
    '.....kGGggGGrrrrGPCCccpppppPppccccccpqPPPPppqPppqnnnnNNNNk........',
    '.....kgggrrrrrqpPppCCqpppPpccccccPpPPppppPPppPnnnnnnNNNNk.........',
    '......kGrrrpPppPPppCCpppcccccccccpqppPppppPnnnnnnNNNNNNk..........',
    '.......kkqpppPqppppCCccccccqCcccqppqpPPpnnnnnnNNNNNNNkk...........',
    '........kpppqpPppcccccccqppqCCpppppppnnnnnnNNNNNNNkkk.............',
    '........kPppppcccccccpPpppPPCCppppnnnnnnNNNNNNNkkk................',
    '.........kpcccccccpppppppPPppCCnnnnnnNNNNNNNEkk...................',
    '........RRcccccppppPppppPPPqnnnnnnNNNNNNNFeeE.....................',
    '.....RRRRRccPpppPPppPPPpPnnnnnnNNNNNNNFFFFFF......................',
    '..RRRRRRR.kppppppppPqnnnnnnnNNNNNNFFFFFFFFFF......................',
    '.YYRR.....kppPPPpPnnnnnnnNNNNNNFFFFFFFffffF.......................',
    '.Y........kpppPnnnnnnnNNNNNNeeFFFFFffffffee.......................',
    '...........knnnnnnnNNNNNNkkEeeeFFfffffffFee.......................',
    '............knnnNNNNNNkkk....eeFFffffffFFe........................',
    '.............kkNNNNkkk........eeFFFFffFFee........................',
    '...............kkkk............eeeeFFFFee.........................',
    '.................................eeeFFeee.........................',
    '.....................................EEe..........................',
    '......................................E...........................',
    '..................................................................',
  ],
]

/** Burgers far off in the stream, over the restaurant: a small one with its ring and a spark of jet, and a speck. */
export const BURGER_FAR: Sprite[] = [
  ['...kkkkk...', '..kbBbbdk..', '.kbBsbbbdk.', 'RYgGgGgGgYR', '.kppPpppPk.', '..knnnnNk..', '....eFe....', '.....E.....'],
  ['...kkkkk...', '..kbBbbdk..', '.kbBsbbbdk.', 'YRgGgGgGgRY', '.kppPpppPk.', '..knnnnNk..', '....EFE....', '...........'],
]
export const BURGER_SPECK: Sprite[] = [
  ['..bBb..', '.bbbbd.', 'RgGgGgR', '.pPpPp.', '...F...'],
  ['..bBb..', '.bbbbd.', 'YgGgGgY', '.pPpPp.', '...e...'],
]

/** A burger's sprites by row of the formation: the sliders on top, the cheeseburgers, the doubles below. */
export const BURGERS = [BURGER_SMALL, BURGER_MID, BURGER_MID, BURGER_BIG, BURGER_BIG] as const
/** Where a burger sprite's body is centred, from its left: the ring makes them wider than the burger. */
export const burgerCentre = (sprite: Sprite): number => sprite[0].length / 2

// ---------------------------------------------------------------- the cook

/**
 * The cook, after the one on the title: a paper cap \`W\` with its red band,
 * brown hair \`H\`/\`h\`/\`L\`, a grin, the teal jacket \`T\`/\`t\`/\`U\` with
 * white cuffs, a red scarf, the apron, a red belt with its gold buckle and the
 * holster \`K\`/\`Y\`, jeans \`J\`/\`j\`/\`I\`, white and red sneakers; the ketchup
 * \`K\`/\`X\`/\`P\` held up in his right hand.
 */
export const COOK_PALETTE: Palette = {
  k: INK, W: '#faf6ec', w: '#cec6ba', R: '#e23038', r: '#961c24',
  H: '#864820', h: '#582c12', L: '#b26a34', S: '#f6c39b', s: '#d48e66',
  T: '#2aaa9a', t: '#167068', U: '#70d6c2', J: '#34447a', j: '#1e2848', I: '#4e62a0',
  Y: '#f2c43e', y: '#c49218', K: '#e22a20', X: '#961610', P: '#ff8c78', g: '#9696a6',
}
export const COOK: Sprite = [
  '.........................kRk..',
  '...........kkkkk.........kWk..',
  '.........kkWWWWWkkk.....kWWWk.',
  '........kWWWWwWWWWwk...kKPKKXk',
  '.......kRRRRRRRRRRRwk..kKPKKXk',
  '......khHHLHHHLHHHHHhk.kWWWWwk',
  '.....khHLHHHSHLHHSLHHhkkKPKKXk',
  '......khHHSSSSSSSSHHhk.kKKKKXk',
  '.......ksSSkSSSSkSSsk..kSSSSsk',
  '.......kssSSSSSSSSSsk.kSSSSSsk',
  '........kkSkWWWWkSsk...ksSSsk.',
  '..........ksSSSSSsk...kWWWWwk.',
  '.......kkktTRRRRRTtkkkTTTTtk..',
  '......kTTTTTWRRRWTTTTTTTTtk...',
  '.....kTUTTTTWWWWWTTTTTTTtk....',
  '....kTUTTTtWWWWWWWtTTTTtk.....',
  '...kTUTTtkTWWWWWWWTkTTtk......',
  '...kTTTtkkTWWWWWWWTkkttk......',
  '...kWWWwkkTWWWWWWWTtkkk.......',
  '...kSSSskkRRRRYRRRRRKYk.......',
  '....ksSSkkWWWWWWWWWwKYk.......',
  '.....kkk.kWWWWWWWWWwXyk.......',
  '.........kWWWWWWWWWwkk........',
  '........kWWWWWwWWWWWwk........',
  '........kRRRRRRRRRRRRk........',
  '........kJJJjJkkkJjJJk........',
  '.......kJIJJjk...kjJJJk.......',
  '.......kIJJjk.....kjJJJk......',
  '......kIJJjk.......kjJJJk.....',
  '......kIJJjk.......kjJJJk.....',
  '.....kIJJjk.........kjJJJk....',
  '.....kIJJjk.........kjJJJk....',
  '....kIJJjjk.........kjjJJJk...',
  '....kWWWRWk.........kWRWWWk...',
  '...kWWRRWWWk.......kWWWRRWWk..',
  '..kWWWWTWWWwk.....kwWWWTWWWWk.',
  '..kgggggggggk.....kgggggggggk.',
]

/** The cook's head, for the lives in the bar. */
export const COOK_HEAD: Sprite = [
  '..kkkkk..',
  '.kWWWWWk.',
  'kRRRRRRRk',
  'kHLHHHLHk',
  'kHSkSkSHk',
  '.kSSSSSk.',
  '..kkkkk..',
]

// ---------------------------------------------------------------- what flies

/** What the burgers throw down: a fried onion ring, a slice of tomato, a strip of bacon, a slice of pickle. */
export const THROWS: Sprite[] = [
  ['..kkkk..', '.kOOOok.', 'kOokkook', 'kOk..kdk', 'kok..kdk', 'kodkkddk', '.kdddDk.', '..kkkk..'],
  ['..kkkk..', '.kRrrRk.', 'kRpyrpRk', 'krryyrrk', 'krpyrypk', 'kRrypyRk', '.kRrrRk.', '..kkkk..'],
  ['.kkk..', 'kMwMk.', 'kMwMMk', '.kMwMk', '.kMwMk', 'kMwMMk', 'kMwMk.', 'kMwMMk', '.kMwMk', '..kkk.'],
  ['..kkkk..', '.kGGGGk.', 'kGgyygGk', 'kGyggyGk', 'kGyggyGk', 'kGgyygGk', '.kGGGGk.', '..kkkk..'],
]
export const THROW_PALETTE: Palette = {
  k: INK, O: '#ffe08a', o: '#f0b048', d: '#c07a22', D: '#8a4a12',
  R: '#b81e14', r: '#e8341e', p: '#ff8a6a', y: '#ffd8a8',
  M: '#c8323a', w: '#f6c8b0', G: '#3c8a32', g: '#8ccc5a',
}

/** The cook's shot: a squirt of ketchup going up — of mustard with the bonus. */
export const SQUIRT: Sprite = ['.P.', 'PrP', 'rrr', 'rRr', '.r.', '.R.', '.R.']
export const KETCHUP_PALETTE: Palette = { r: '#e8301e', R: '#a8180e', P: '#ff9a80' }
export const MUSTARD_PALETTE: Palette = { r: '#ffd02a', R: '#c89a10', P: '#fff3a0' }

// ---------------------------------------------------------------- the bonuses

/** The mustard: a squeeze bottle, to shoot two at a time. */
export const MUSTARD: Sprite = ['...k...', '..kyk..', '..kWk..', '.kWWWk.', 'kYYYYyk', 'kYUYYyk', 'kYUYYyk', 'kWWWWwk', 'kYUYYyk', 'kYYYYyk', 'kYYYYyk', '.kkkkk.']
/** The blowtorch: a kitchen torch, its blue flame burning a whole column. */
export const TORCH: Sprite = ['...bBb...', '..bBWBb..', '..bBWBb..', '...bBb...', '....k....', '...kgk...', '..kgggk..', '..kkkkk..', '.kRRRRrk.', '.kRPRRrk.', '.kRPRRrk.', '.kRRRRrk.', '.kRRRRrk.', '..kkkkk..']
export const BONUS_PALETTE: Palette = {
  k: INK, Y: '#ffd02a', y: '#c89a10', U: '#fff3a0', W: '#faf6ec', w: '#cec6ba',
  b: '#3a7cff', B: '#8cc4ff', g: '#6a6a76', R: '#e2302a', r: '#9a1a14', P: '#ff8a78',
}

// ---------------------------------------------------------------- the plates

/**
 * Diner china, as it stands in a stack: the top plate seen from above —
 * its rim, the red band, the well — then each plate below by its edge, the
 * rim's lip widest, the body and the foot drawing in, a line of shadow
 * between one plate and the next; lit from the left, the right side turning
 * to the sky's violet.
 */
const CHINA = { lip: ['#ffffff', '#fbf8f4', '#e8e4ec', '#c8c0d4'], body: ['#f4f0ea', '#ece6de', '#d4ccd8', '#aea4c0'], foot: ['#d6d0d4', '#c8c0c8', '#a69cb4', '#857a9c'], gap: '#5a4468', band: '#d8343c', bandDark: '#9c2030', well: '#ece8e0', wellShade: '#d6d0c8', broken: '#a49cb0', crack: '#6c6478' }

/** A bite out of a stack: its centre and radius, in pixels from the stack's top left. */
export type Bite = readonly [number, number, number]

/** How tall a stack of `count` plates stands. */
export const platesHeight = (count: number): number => 9 + count * 4

/**
 * A stack of `count` plates, `width` wide, standing on `base` and centred on
 * `cx`, with its shadow on the ground. `bites` are taken out of it: their
 * edges show the broken china, and a crack or two runs on from each.
 */
export function drawPlates(buffer: PixelBuffer, cx: number, base: number, width: number, count: number, bites: readonly Bite[] = [], seed = 0): void {
  const KEY = '#ff00ff'
  const w = width + 2, h = platesHeight(count) + 2
  const f = new PixelBuffer(w, h, KEY)
  const tone = (ramp: readonly string[], x: number) => { const t = x / Math.max(1, width - 1); return ramp[t < 0.12 ? 1 : t < 0.55 ? 0 : t < 0.8 ? 2 : 3] }
  // the plates by their edges, from the bottom up, so each lip sits over the foot of the one above;
  // the foot warmed by the red ground under it
  for (let i = count - 1; i >= 0; i -= 1) {
    const top = 9 + i * 4
    for (let x = 0; x < width; x += 1) {
      f.set(1 + x, 1 + top - 1, tone(CHINA.lip, x))
      if (x >= 1 && x < width - 1) f.set(1 + x, 1 + top, tone(CHINA.body, x))
      if (x >= 2 && x < width - 2) f.set(1 + x, 1 + top + 1, mix(tone(CHINA.foot, x), '#e07858', 0.18))
      if (x >= 3 && x < width - 3) f.set(1 + x, 1 + top + 2, CHINA.gap)
    }
  }
  // the top plate from above: the rim, the red band all the way round, the well
  const rx = width / 2, ry = 4.5
  const inside = (x: number, y: number, ax: number, ay: number) => ((x + 0.5 - rx) / ax) ** 2 + ((y + 0.5 - ry) / ay) ** 2 <= 1
  for (let y = 0; y < 9; y += 1) for (let x = 0; x < width; x += 1) {
    if (!inside(x, y, rx, ry)) continue
    const right = x + 0.5 > rx * 1.35
    const color = !inside(x, y, rx - 1.5, ry - 0.9) ? (right ? CHINA.lip[2] : CHINA.lip[0])
      : !inside(x, y, rx - 3, ry - 1.9) ? (right ? CHINA.bandDark : CHINA.band)
        : y + 0.5 < ry - 0.5 ? CHINA.wellShade : CHINA.well
    f.set(1 + x, 1 + y, color)
  }
  // a gleam on the rim, upper left
  f.set(1 + Math.round(width * 0.24), 1, '#ffffff'); f.set(2 + Math.round(width * 0.24), 1, '#ffffff')
  // the bites: china taken out, its broken edge showing; a crack running on from each
  const gone = (x: number, y: number) => bites.some(([bx, by, br]) => (x + 0.5 - bx) ** 2 + (y + 0.5 - by) ** 2 <= br * br)
  for (let y = 0; y < h - 2; y += 1) for (let x = 0; x < width; x += 1) if (gone(x, y)) f.set(1 + x, 1 + y, KEY)
  const solid = (X: number, Y: number) => X >= 0 && Y >= 0 && X < w && Y < h && f.hex(X, Y) !== KEY
  const edge: Array<[number, number]> = []
  for (let Y = 1; Y < h - 1; Y += 1) for (let X = 1; X < w - 1; X += 1) if (solid(X, Y) && gone(X - 1, Y - 1) === false && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => gone(X - 1 + dx, Y - 1 + dy))) edge.push([X, Y])
  for (const [X, Y] of edge) f.set(X, Y, mix(f.hex(X, Y), CHINA.broken, 0.7))
  bites.forEach(([bx, by, br], k) => {
    let s = (seed * 31 + k * 17 + 7) >>> 0
    const next = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
    const angle = next() * Math.PI * 2
    let x = bx + Math.cos(angle) * (br + 0.5), y = by + Math.sin(angle) * (br + 0.5)
    const steps = 3 + Math.floor(next() * 4)
    for (let i = 0; i < steps; i += 1) {
      x += Math.cos(angle) + (next() - 0.5) * 0.9; y += Math.sin(angle) * 0.6 + (next() - 0.5) * 0.9
      const X = 1 + Math.round(x), Y = 1 + Math.round(y)
      if (solid(X, Y)) f.set(X, Y, CHINA.crack)
    }
  })
  // the ink outline, round the stack and into the bites
  const outline: Array<[number, number]> = []
  for (let Y = 0; Y < h; Y += 1) for (let X = 0; X < w; X += 1) if (!solid(X, Y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => solid(X + dx, Y + dy))) outline.push([X, Y])
  for (const [X, Y] of outline) f.set(X, Y, INK)
  // its shadow on the ground, then the stack
  const x0 = Math.round(cx - w / 2), y0 = base - h + 1
  for (let x = 2; x < w - 2; x += 1) for (let dy = 0; dy < 2; dy += 1) buffer.tint(x0 + x + 2, base + 1 + dy, '#1a0812', dy === 0 ? 0.45 : 0.25)
  buffer.stamp(f, x0, y0, KEY)
}
