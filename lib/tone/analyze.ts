type TonePolarity = 'positive' | 'negative'

export type ToneScore = { positive: number; negative: number }

export type ToneSignals = {
  positiveSeeds: string[]
  negativeSeeds: string[]
  positiveTokens: string[]
  negativeTokens: string[]
  positivePhrases: string[]
  negativePhrases: string[]
}

export type ToneScoreResult = {
  score: ToneScore
  signals: ToneSignals
}

export type ToneClassification = {
  tone: 'positive' | 'neutral' | 'negative'
  confidence: number
}

const ACCENT_REGEX = /[\u0300-\u036f]/g
const NON_ALPHANUM_REGEX = /[^a-z0-9\u3040-\u30ff\u4e00-\u9faf\s]/g

type NormalizedKeyword = {
  raw: string
  normalized: string
  pattern?: RegExp
}

type TokenMatchMode = 'exact' | 'prefix' | 'includes'

type TokenRule = {
  polarity: TonePolarity
  weight: number
  match: TokenMatchMode
  keywords: readonly NormalizedKeyword[]
}

type PhraseRule = {
  polarity: TonePolarity
  weight: number
  phrases: readonly NormalizedKeyword[]
}

const POSITIVE_SEEDS_RAW: readonly string[] = [
  'love',
  'lovely',
  'happy',
  'happiness',
  'joy',
  'joyful',
  'fun',
  'funny',
  'amazing',
  'great',
  'awesome',
  'win',
  'winner',
  'victory',
  'lucky',
  'glad',
  'smile',
  'smiling',
  'peace',
  'calm',
  'bright',
  'sunny',
  'hope',
  'hopeful',
  'kind',
  'cute',
  'sweet',
  'success',
  'celebrate',
  'wow',
  'yay',
  'delight',
  'good',
  'wonderful',
  'brilliant',
  'energize',
  'spark',
  'shine',
  'playful',
  'cozy',
  'uplift',
  'magic',
  'bliss',
  'cheer',
  'amour',
  'heureux',
  'joie',
  'rire',
  'succès',
  'chance',
  'lumineux',
  'positif',
  'génial',
  'liebe',
  'glück',
  'glücklich',
  'freu',
  'lustig',
  'witzig',
  'erfolg',
  'hoffnung',
  'sonnig',
  'toll',
  'super',
  '嬉',
  '楽',
  '幸',
  '笑',
  '良',
  '素敵',
  '最高',
  '平和',
  '明る',
  '希望',
  // French
  'bonheur',
  'joie',
  'heureuse',
  'ravi',
  'content',
  'magnifique',
  'formidable',
  'incroyable',
  'superbe',
  'chouette',
  'bravo',
  'félicitations',
  // German
  'wunderbar',
  'großartig',
  'grossartig',
  'herrlich',
  'zufrieden',
  'erfolgreich',
  'glückwunsch',
  // Spanish (bonus)
  'amor',
  'alegría',
  'feliz',
  'sonrisa',
  'éxito',
  'paz',
  'esperanza',
  'increíble',
  'genial',
  // Japanese (full words)
  '嬉しい',
  '楽しい',
  '幸せ',
  '笑顔',
  '素晴らしい',
  '成功',
  '勝利',
  '感謝',
  'おめでとう',
  // Extra positive nuances
  'kindness',
  // FR nuances
  'bienveillance',
  'solidarité',
  'solidarite',
  'entraide',
  'générosité',
  'generosite',
  'rayonnant',
  'épanoui',
  'epanoui',
  'serein',
  'paisible',
  'réconfort',
  'reconfort',
  'apaisant',
  'harmonie',
  'fier',
  'fière',
  'fiere',
  // DE nuances
  'freundlich',
  'mitgefühl',
  'mitgefuhl',
  'dankbarkeit',
  'hilfsbereit',
  'gemeinschaft',
  'gemeinsam',
  'ermutigend',
  'aufmunternd',
  'inspirierend',
  // ES nuances
  'alegre',
  'agradecido',
  'orgullo',
  'orgulloso',
  'orgullosa',
  'esperanzador',
  'alentador',
  'hermoso',
  'precioso',
  // JP nuances
  '優しい',
  '穏やか',
  '平穏',
  '感動',
  '励まし',
  '誇り',
  '誇らしい',
  '希望に満ちた',
  '幸運',
  '微笑み',
  '支援',
  '助け合い',
]

const NEGATIVE_SEEDS_RAW: readonly string[] = [
  'sad',
  'sorrow',
  'pain',
  'hurt',
  'bad',
  'worse',
  'worst',
  'dark',
  'death',
  'dead',
  'kill',
  'killing',
  'fear',
  'scared',
  'anger',
  'angry',
  'hate',
  'hated',
  'broken',
  'fail',
  'failure',
  'lost',
  'loss',
  'doom',
  'gloom',
  'cry',
  'tears',
  'crash',
  'bleed',
  'bleeding',
  'rage',
  'tired',
  'bored',
  'lonely',
  'void',
  'grim',
  'triste',
  'peur',
  'colère',
  'angoisse',
  'perdu',
  'perte',
  'haine',
  'mort',
  'noir',
  'fatigue',
  'traur',
  'angst',
  'wut',
  'verlust',
  'schmerz',
  'tod',
  'müde',
  'dunkel',
  'hass',
  '悲',
  '辛',
  '怖',
  '恐',
  '死',
  '負け',
  '闇',
  '泣',
  '壊',
  '憂',
  '絶望',
  // French
  'tristesse',
  'déprime',
  'deprime',
  'peine',
  'moche',
  'nul',
  'pourri',
  'ennui',
  'ennuyeux',
  'galère',
  'galere',
  'difficile',
  'stressant',
  'guerre',
  // German
  'traurig',
  'schlimm',
  'furchtbar',
  'grausam',
  'langweilig',
  'krieg',
  // Spanish (bonus)
  'triste',
  'miedo',
  'odio',
  'fracaso',
  'dolor',
  'muerte',
  'guerra',
  // Japanese (full words)
  '悲しい',
  '怖い',
  '恐怖',
  '怒り',
  '憎しみ',
  '暴力',
  '戦争',
  '不安',
  '最悪',
  'つらい',
]

function normalizeForSentiment(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(ACCENT_REGEX, '')
    .replace(NON_ALPHANUM_REGEX, ' ')
}

function normalizeSeed(raw: string): NormalizedKeyword | null {
  const normalized = normalizeForSentiment(raw).trim()
  if (!normalized) return null
  const basic = /^[a-z0-9]+$/.test(normalized)
  return {
    raw,
    normalized,
    pattern: basic ? new RegExp(`\\b${normalized}\\b`) : undefined,
  }
}

function normalizeRuleKeywords(keywords: readonly string[]): NormalizedKeyword[] {
  return keywords
    .map((keyword) => {
      const normalized = normalizeForSentiment(keyword).trim()
      return normalized ? { raw: keyword, normalized } : null
    })
    .filter((entry): entry is NormalizedKeyword => entry !== null)
}

const POSITIVE_SEEDS = POSITIVE_SEEDS_RAW.map(normalizeSeed).filter(
  (entry): entry is NormalizedKeyword => entry !== null,
)
const NEGATIVE_SEEDS = NEGATIVE_SEEDS_RAW.map(normalizeSeed).filter(
  (entry): entry is NormalizedKeyword => entry !== null,
)

const TOKEN_HEURISTICS: readonly TokenRule[] = [
  {
    polarity: 'negative',
    weight: 4,
    match: 'includes',
    keywords: normalizeRuleKeywords([
      'cheat',
      'cheats',
      'cheating',
      'cheater',
      'cheaters',
      'infidelity',
      'unfaithful',
      'betray',
      'betrayed',
      'betrayal',
      'backstab',
      'backstabbing',
      'scandal',
      'scandals',
      'scandale',
      'scandales',
      'escroquerie',
      'escroqueries',
      'tromper',
      'trompe',
      'trompee',
      'tromperie',
      'infidelite',
      'adultere',
      'trahison',
      'trahir',
      'trahit',
      'detournement',
      'detournements',
      'coverup',
      'fraud',
      'frauds',
      'fraudulent',
      'embezzle',
      'embezzled',
      'embezzlement',
      'corruption',
      'corrupt',
      'lawsuit',
      'lawsuits',
      'sued',
      'suing',
      'betrug',
      'betrogen',
      'betruger',
      'betrueger',
      'fremdgehen',
      'affare',
      'affaire',
      'skandal',
      'skandale',
      'korruption',
      'missbrauch',
      'kindesmissbrauch',
      'entfuhrung',
      'entfuehrung',
      'erpressung',
      'convicted',
      'conviction',
      'murder',
      'murderer',
      'homicide',
      'manslaughter',
      'assault',
      'assaulted',
      'assaulting',
      'abuse',
      'abused',
      'abusive',
      'abus',
      'abusif',
      'abusifs',
      'predateur',
      'predator',
      'bullying',
      'harcelement',
      'harassment',
      'harassing',
      'grooming',
      'kidnapping',
      'kidnapped',
      'extortion',
      'blackmail',
      '浮気',
      '不倫',
      '裏切り',
      'スキャンダル',
      '汚職',
      '詐欺',
      '虐待',
      '性的虐待',
      '家庭内暴力',
      '暴力',
      '逮捕',
    ]),
  },
  {
    polarity: 'negative',
    weight: 3,
    match: 'includes',
    keywords: normalizeRuleKeywords([
      'failarmy',
      'watchpeopledieinside',
      'instantkarma',
      'instantregret',
      'therewasanattempt',
      'kidsarefuckingstupid',
      'publicfreakout',
      'cringetopia',
      'cringeanarchy',
      'catastrophicfailure',
    ]),
  },
  {
    polarity: 'negative',
    weight: 2,
    match: 'includes',
    keywords: normalizeRuleKeywords([
      'fail',
      'epicfail',
      'fails',
      'failure',
      'failing',
      'disaster',
      'catastroph',
      'traged',
      'accident',
      'accidents',
      'crash',
      'crashes',
      'collision',
      'wreck',
      'explosion',
      'explosive',
      'burned',
      'burning',
      'burnt',
      'hurricane',
      'tornado',
      'earthquake',
      'tsunami',
      'flood',
      'avalanche',
      'landslide',
      'volcano',
      'eruption',
      'injury',
      'injuries',
      'injured',
      'blood',
      'bloody',
      'bloodbath',
      'gore',
      'violent',
      'violence',
      'fight',
      'fights',
      'brawl',
      'attack',
      'attacks',
      'assault',
      'panic',
      'meltdown',
      'freakout',
      'freakouts',
      'rage',
      'angry',
      'argument',
      'arguments',
      'arrest',
      'arrested',
      'police',
      'policing',
      'crime',
      'criminal',
      'murder',
      'killer',
      'killed',
      'killing',
      'dead',
      'deadly',
      'died',
      'death',
      'fatal',
      'suicide',
      'horror',
      'haunted',
      'nightmare',
      'ghost',
      'demon',
      'demonic',
      'paranormal',
      'cursed',
      'curse',
      'possession',
      'terror',
      'terrorist',
      'terrorism',
      'kidnap',
      'kidnapped',
      'kidnapping',
      'abduction',
      'creepy',
      'disturbing',
      'massacre',
      'shooting',
      'shootings',
      'stabbed',
      'stabbing',
      'homicide',
      'dystopia',
      'dystopian',
      'apocalypse',
      'apocalyptic',
      'doomsday',
      'doom',
      'nsfl',
    ]),
  },
  {
    polarity: 'negative',
    weight: 1,
    match: 'includes',
    keywords: normalizeRuleKeywords([
      'wtf',
      'weird',
      'strange',
      'odd',
      'awkward',
      'cringe',
      'cringey',
      'gross',
      'ew',
      'yikes',
      'mess',
      'messy',
      'drama',
      'rant',
      'chaos',
      'chaotic',
      'oops',
      'facepalm',
      'loser',
      'losers',
      'looser',
      'sucks',
      'angst',
      'stress',
      'stressed',
      'tired',
      'bored',
      'creep',
      'ominous',
      // English
      'annoyed',
      'upset',
      'frustrated',
      'toxic',
      'threat',
      'threats',
      'scam',
      'scammer',
      // French
      'tristesse',
      'deprime',
      'déprime',
      'peine',
      'ennui',
      'ennuyeux',
      'galere',
      'galère',
      'moche',
      'nul',
      'pourri',
      'stressant',
      // German
      'traurig',
      'schlimm',
      'furchtbar',
      'grausam',
      'langweilig',
      // Japanese
      '最悪',
      'つらい',
      '怖い',
      '悲しい',
      'spoopy',
      'uneasy',
      'badending',
      'badvibes',
      // EN extra
      'troll',
      'trolling',
      'insult',
      'insults',
      'hateful',
      // FR extra
      'toxique',
      'insulte',
      'insultes',
      'mechant',
      'méchant',
      'agressif',
      'agressive',
      'grossier',
      'vulgaire',
      'hargneux',
      'venimeux',
      // DE extra
      'giftig',
      'beleidigung',
      'beleidigungen',
      'hasserfullt',
      'hasserfüllt',
      'troll',
      'trollen',
      'bosartig',
      'bösartig',
      // ES extra
      'toxico',
      'tóxico',
      'insulto',
      'insultos',
      'odioso',
      'grosero',
      'vulgar',
      'agresivo',
      'agresiva',
      'trol',
      'troleo',
      // JP extra
      '荒らし',
      '暴言',
      '侮辱',
      '攻撃的',
      'ヘイト',
      '毒舌',
    ]),
  },
  {
    polarity: 'positive',
    weight: 3,
    match: 'includes',
    keywords: normalizeRuleKeywords([
      'promotion',
      'promoted',
      'award',
      'awards',
      'trophy',
      'medal',
      'medalist',
      'prize',
      'jackpot',
      'windfall',
      'miracle',
      'miraculous',
      'breakthrough',
      'promotionne',
      'promu',
      'promue',
      'augmentation',
      'mariage',
      'mariages',
      'marie',
      'mariee',
      'noces',
      'bebe',
      'naissance',
      'grossesse',
      'jackpot',
      'loterie',
      'don',
      'dons',
      'record',
      'recordmondial',
      'victoire',
      'fiancailles',
      'recovered',
      'recovery',
      'healed',
      'healing',
      'cured',
      'volunteer',
      'volunteering',
      'donation',
      'donations',
      'donated',
      'champion',
      'championship',
      'victory',
      'engagement',
      'engaged',
      'wedding',
      'marriage',
      'honeymoon',
      'adopted',
      'adoption',
      'beforderung',
      'befordert',
      'auszeichnung',
      'preis',
      'trophae',
      'medaille',
      'jackpott',
      'gewinn',
      'gewonnen',
      'meisterschaft',
      'titel',
      'weltrekord',
      'rekord',
      'spende',
      'spenden',
      'gespendet',
      'rettet',
      'gerettet',
      'verlobung',
      'verlobt',
      'hochzeit',
      'heirat',
      'baby',
      'geburt',
      'schwangerschaft',
      'wunder',
      'heilung',
      'karriere',
      'traumjob',
      'beförderung',
      '昇進',
      '受賞',
      '優勝',
      'タイトル',
      '新しい仕事',
      '夢の仕事',
      '奇跡',
      '完治',
      '寄付',
      '寄付金',
      '救った',
      '救助',
      '世界記録',
      '結婚',
      '婚約',
      '出産',
      '赤ちゃん',
      '妊娠',
    ]),
  },
  {
    polarity: 'positive',
    weight: 2,
    match: 'includes',
    keywords: normalizeRuleKeywords([
      'heartwarming',
      'heartwarmingstory',
      'feelgood',
      'feelgoodnews',
      'feelgoods',
      'wholesome',
      'uplift',
      'uplifting',
      'inspiring',
      'inspiration',
      'inspirational',
      'motivation',
      'motivational',
      'encouraging',
      'encouragement',
      'asmr',
      'relaxing',
      'relaxation',
      'relax',
      'calming',
      'calm',
      'serene',
      'soothing',
      'peaceful',
      'mindful',
      'mindfulness',
      'meditation',
      'gratitude',
      'kindness',
      'rescue',
      'rescued',
      'rescuing',
      'heroic',
      'hero',
      'satisfying',
      'oddlysatisfying',
      'lofi',
      'cozy',
      'comforting',
      'restorative',
      'reassuring',
      'incredible',
      'feelgoodstory',
      'contagiouslaughter',
      'natureisfuckinglit',
      'nextfuckinglevel',
      // English
      'grateful',
      'thankful',
      'thanks',
      'blessed',
      'celebration',
      'celebrating',
      'achievement',
      'achievements',
      'progress',
      'healing',
      'recovery',
      'donation',
      'donations',
      'charity',
      'volunteer',
      'volunteering',
      'proud',
      'pride',
      'congrats',
      'congratulations',
      // French
      'bonheur',
      'heureux',
      'heureuse',
      'joie',
      'sourire',
      'souriant',
      'ravi',
      'content',
      'magnifique',
      'formidable',
      'incroyable',
      'superbe',
      'bravo',
      'felicitations',
      // German
      'freude',
      'zufrieden',
      'stolz',
      'erfolg',
      'erfolgreich',
      'wunderbar',
      'grossartig',
      'großartig',
      'herrlich',
      'gluckwunsch',
      'glückwunsch',
      // Japanese
      '素晴らしい',
      '嬉しい',
      '楽しい',
      '幸せ',
      '笑顔',
      '最高',
      '成功',
      '勝利',
      '感謝',
      'おめでとう',
      // Extra EN
      'compassion',
      'empathy',
      'kindhearted',
      'warmhearted',
      'benevolent',
      'benevolence',
      'pay it forward',
      'neighbourly',
      'neighborly',
      'inclusive',
      'inclusion',
      // Extra FR
      'bienveillance',
      'solidarite',
      'solidarité',
      'entraide',
      'generosite',
      'générosité',
      'apaisant',
      'reconfortant',
      'réconfortant',
      'harmonie',
      'epanoui',
      'épanoui',
      'fier',
      'fierement',
      'fièrement',
      // Extra DE
      'freundlich',
      'mitgefuhl',
      'mitgefühl',
      'hilfsbereit',
      'ermutigend',
      'aufmunternd',
      'inspirierend',
      'gemeinschaft',
      'gemeinsam',
      // Extra ES
      'solidaridad',
      'agradecido',
      'alentador',
      'esperanzador',
      'hermoso',
      'precioso',
      // Extra JP
      '優しい',
      '穏やか',
      '平穏',
      '感動',
      '励まし',
      '調和',
      '癒し',
    ]),
  },
  {
    polarity: 'positive',
    weight: 1,
    match: 'prefix',
    keywords: normalizeRuleKeywords([
      'cute',
      'adorable',
      'kawaii',
      'kitten',
      'kitty',
      'puppy',
      'doggo',
      'pupper',
      'panda',
      'otter',
      'bunny',
      'hedgehog',
      'penguin',
      'hamster',
      'duckling',
      'sloth',
      'capybara',
      'alpaca',
      'koala',
      'seal',
      'otterly',
      'pupperino',
      'smile',
      'smiling',
      'laugh',
      'laughing',
      'laughter',
      'funny',
      'hilarious',
      'lol',
      'haha',
      'meme',
      'memes',
      'joyful',
      'delight',
      'delightful',
      'sweetheart',
      'wholesomememe',
      'goodnews',
      // FR
      'mignon',
      'mignonne',
      'drole',
      'drôle',
      // DE
      'niedlich',
      'suss',
      'süß',
      'knuffig',
      // ES
      'lindo',
      'linda',
      'bonito',
      'bonita',
      'tierno',
      'tierna',
      'risas',
      // JP
      'かわいい',
      '可愛い',
    ]),
  },
]

const PHRASE_HEURISTICS: readonly PhraseRule[] = [
  {
    polarity: 'negative',
    weight: 4,
    phrases: normalizeRuleKeywords([
      'caught cheating',
      'cheating scandal',
      'massive scandal',
      'major scandal',
      'corporate scandal',
      'cover up',
      'cover-up',
      'facing charges',
      'facing a lawsuit',
      'facing lawsuit',
      'pleads guilty',
      'guilty verdict',
      'guilty plea',
      'charged with',
      'charged with murder',
      'charged with assault',
      'sexual assault',
      'sex offender',
      'sex offenders',
      'sexual abuse',
      'domestic violence',
      'domestic abuse',
      'child abuse',
      'animal abuse',
      'deadly shooting',
      'fatal shooting',
      'fatal crash',
      'hit and run',
      'violent attack',
      'pris en flagrant delit de tromperie',
      'gros scandale',
      'scandale de corruption',
      'proces pour meurtre',
      'condamne pour meurtre',
      'condamne pour agression',
      'agression sexuelle',
      'violence conjugale',
      'abus domestique',
      'abus sexuel',
      'jugé coupable',
      'plaide coupable',
      'auf frischer tat beim betrug ertappt',
      'beim betrugen erwischt',
      'betrugsskandal',
      'grosser skandal',
      'steht vor gericht',
      'wird angeklagt',
      'wegen mordes angeklagt',
      'wegen betrugs angeklagt',
      'schuldig gesprochen',
      'gesteht schuldig',
      'sexueller missbrauch',
      'haeusliche gewalt',
      'häusliche gewalt',
      '浮気発覚',
      '不倫スキャンダル',
      '汚職スキャンダル',
      '有罪判決',
      '殺人で起訴',
      '性的暴行で起訴',
      '家庭内暴力事件',
    ]),
  },
  {
    polarity: 'negative',
    weight: 3,
    phrases: normalizeRuleKeywords([
      'watch people die inside',
      'instant karma',
      'instant regret',
      'there was an attempt',
      'kids are fucking stupid',
      'public freakout',
      'catastrophic failure',
      'fail compilation',
      'mass shooting',
      'school shooting',
      'fatal accident',
      'serious accident',
      'dead body',
      'crime scene',
      'serial killer',
      'true crime',
      'graphic content',
      'not safe for life',
      'jump scare',
      'paranormal activity',
      'demonic possession',
      'dark web',
      'dark internet',
      'caught on camera',
      // French
      'fusillade de masse',
      'fusillade scolaire',
      'accident mortel',
      'accident grave',
      'corps sans vie',
      'scène de crime',
      'scene de crime',
      'tueur en série',
      'tueur en serie',
      'discours de haine',
      'insultes racistes',
      'menace de mort',
      'menace à la bombe',
      'menace a la bombe',
      'harcèlement sexuel',
      'harcelement sexuel',
      'émeutes',
      'emeutes',
      // German
      'massenerschießung',
      'massenerschiessung',
      'amoklauf',
      'tödlicher unfall',
      'toedlicher unfall',
      'schwerer unfall',
      'tatort',
      'serienmörder',
      'serienmoerder',
      'hassrede',
      'rassistische beleidigungen',
      'todesdrohung',
      'bombendrohung',
      'sexuelle belästigung',
      'sexuelle belaestigung',
      'krawalle',
      // Spanish
      'tiroteo masivo',
      'tiroteo escolar',
      'accidente mortal',
      'accidente grave',
      'escena del crimen',
      'asesino en serie',
      'discurso de odio',
      'insultos racistas',
      'amenaza de muerte',
      'amenaza de bomba',
      'acoso sexual',
      'disturbios',
      // Japanese
      '銃乱射事件',
      '学校での銃撃',
      '致命的な事故',
      '重大事故',
      '犯罪現場',
      '連続殺人犯',
      'ヘイトスピーチ',
      '人種差別的な発言',
      '殺害予告',
      '爆破予告',
      '性的嫌がらせ',
      '暴動',
    ]),
  },
  {
    polarity: 'positive',
    weight: 3,
    phrases: normalizeRuleKeywords([
      'wins the championship',
      'wins championship',
      'wins the title',
      'takes home the trophy',
      'brings home the trophy',
      'wins the trophy',
      'takes the trophy',
      'award winning',
      'receives a promotion',
      'gets promoted',
      'lands a new job',
      'lands dream job',
      'dream job',
      'dream come true',
      'new job',
      'new career',
      'life changing',
      'life-changing',
      'standing ovation',
      'hits the jackpot',
      'wins the jackpot',
      'wins millions',
      'wins a million',
      'wins big',
      'donates millions',
      'raises millions',
      'raises funds',
      'saved a life',
      'saves a life',
      'saves lives',
      'miracle recovery',
      'miraculous recovery',
      'miracle cure',
      'world record',
      'breaks world record',
      'record breaking',
      'record-breaking',
      'welcomes a baby',
      'welcomes their baby',
      'baby announcement',
      'pregnancy announcement',
      'ties the knot',
      'announces engagement',
      'engagement announcement',
      'celebrates anniversary',
      'remporte le championnat',
      'gagne le titre',
      'remporte le trophée',
      'reçoit une promotion',
      'obtient une promotion',
      'décroche un nouveau job',
      'décroche le job de rêve',
      'job de rêve',
      'remporte le jackpot',
      'donne des millions',
      'lève des fonds',
      'sauve une vie',
      'sauve des vies',
      'miracle medical',
      'record du monde',
      'accueille un bébé',
      'annonce sa grossesse',
      'annonce ses fiançailles',
      'célèbre son anniversaire de mariage',
      'gewinnt die meisterschaft',
      'holt den titel',
      'holt den pokal',
      'erhält eine beförderung',
      'neuen job erhalten',
      'traumjob bekommen',
      'gewinnt den jackpot',
      'spendet millionen',
      'sammelt spenden',
      'rettet ein leben',
      'stellt einen weltrekord auf',
      'begrüßt ein baby',
      'kündigt eine schwangerschaft an',
      'kündigt die verlobung an',
      'feiert jubiläum',
      '優勝を勝ち取る',
      'タイトルを獲得',
      'トロフィーを手にする',
      '昇進を受ける',
      '新しい仕事に就く',
      '夢の仕事を手に入れる',
      'ジャックポットを当てる',
      '大金を寄付する',
      '命を救う',
      '世界記録を更新',
      '赤ちゃんを迎える',
      '妊娠を発表',
      '婚約を発表',
      '結婚記念日を祝う',
      // Extra EN achievements/community
      'wins gold medal',
      'earns a scholarship',
      'earns scholarship',
      'community raises funds',
      'free tuition announced',
      'cancer in remission',
      'safe return home',
      'reunited with family',
      // FR
      'remporte la médaille d or',
      'remporte la medaille d or',
      'obtient une bourse',
      'la communauté lève des fonds',
      'la communaute leve des fonds',
      'cancer en rémission',
      'cancer en remission',
      'retour sain et sauf',
      'réuni avec sa famille',
      'reuni avec sa famille',
      // DE
      'gewinnt die goldmedaille',
      'erhält ein stipendium',
      'erhaelt ein stipendium',
      'gemeinschaft sammelt spenden',
      'krebs in remission',
      'sichere rückkehr nach hause',
      'sichere rueckkehr nach hause',
      'mit familie wiedervereint',
      // ES
      'gana la medalla de oro',
      'obtiene una beca',
      'la comunidad recauda fondos',
      'cáncer en remisión',
      'cancer en remision',
      'regreso a salvo a casa',
      'reunido con su familia',
      // JP
      '金メダルを獲得',
      '奨学金を獲得',
      '地域コミュニティが資金を集める',
      'がんが寛解',
      '無事に帰還',
      '家族と再会',
    ]),
  },
  {
    polarity: 'positive',
    weight: 2,
    phrases: normalizeRuleKeywords([
      'good news',
      'good vibe',
      'positive vibes',
      'feel good',
      'feel good story',
      'feel good moment',
      'feel good news',
      'heart warming',
      'heart warming moment',
      'restores faith in humanity',
      'faith in humanity restored',
      'made my day',
      'made our day',
      'happy ending',
      'wholesome moment',
      'instant smile',
      'contagious laughter',
      'oddly satisfying',
      'nature is fucking lit',
      'next fucking level',
      'pure happiness',
      'good ending',
      // French
      'bonne nouvelle',
      'bonnes nouvelles',
      'bonne vibe',
      'bonnes vibes',
      'histoire qui fait du bien',
      'moment réconfortant',
      'moment reconfortant',
      'réchauffe le cœur',
      'rechauffe le coeur',
      'foi en l humanité restaurée',
      'foi en l humanite restauree',
      'me fait ma journée',
      'me fait ma journee',
      'fin heureuse',
      // German
      'gute nachrichten',
      'positive schwingungen',
      'gute vibes',
      'gute stimmung',
      'macht meinen tag',
      'glückliches ende',
      'herzerwärmender moment',
      'herzerwaermender moment',
      'glaube an die menschheit wiederhergestellt',
      // Spanish
      'buenas noticias',
      'buenas vibras',
      'historia que reconforta',
      'me alegró el día',
      'me alegro el dia',
      'final feliz',
      // Japanese
      '良いニュース',
      '良い知らせ',
      '心温まる話',
      '心温まる瞬間',
      '嬉しい結末',
      // Community/environmental
      'random acts of kindness',
      'gives back to the community',
      'opens a free clinic',
      'opens free school',
      'community garden opens',
      'plants trees',
      'cleans up the beach',
      // FR
      'actes de gentillesse',
      'rend à la communauté',
      'rend a la communaute',
      'ouvre une clinique gratuite',
      'ouvre une école gratuite',
      'ouvre une ecole gratuite',
      'jardin partagé',
      'jardin partage',
      'plante des arbres',
      'nettoie la plage',
      // DE
      'taten der freundlichkeit',
      'gibt der gemeinschaft etwas zurück',
      'gibt der gemeinschaft etwas zurueck',
      'eroeffnet eine kostenlose klinik',
      'eröffnet eine kostenlose klinik',
      'gemeinschaftsgarten eröffnet',
      'gemeinschaftsgarten eroeffnet',
      'pflanzt bäume',
      'pflanzt baeume',
      'säubert den strand',
      'saeubert den strand',
      // ES
      'actos de bondad',
      'devuelve a la comunidad',
      'abre una clínica gratuita',
      'abre una clinica gratuita',
      'huerto comunitario',
      'planta árboles',
      'planta arboles',
      'limpia la playa',
      // JP
      '親切の連鎖',
      '地域に還元',
      '無料クリニックを開く',
      '無料の学校を開く',
      'コミュニティガーデンがオープン',
      '植樹',
      'ビーチを清掃',
    ]),
  },
]

const EMPTY_SIGNALS: ToneSignals = {
  positiveSeeds: [],
  negativeSeeds: [],
  positiveTokens: [],
  negativeTokens: [],
  positivePhrases: [],
  negativePhrases: [],
}

function matchesNormalized(text: string, entry: NormalizedKeyword): boolean {
  if (!entry.normalized) return false
  if (entry.pattern) return entry.pattern.test(text)
  return text.includes(entry.normalized)
}

type EvaluationResult = {
  score: ToneScore
  hits: ToneScore
  signals: ToneSignals
}

function evaluateSeeds(normalizedText: string, langHints: Set<LangHint>): EvaluationResult {
  let positive = 0
  let negative = 0
  const positiveSeeds = new Set<string>()
  const negativeSeeds = new Set<string>()

  for (const seed of POSITIVE_SEEDS) {
    if (matchesNormalized(normalizedText, seed)) {
      positive += seedDeltaForLang(seed, langHints)
      positiveSeeds.add(seed.raw)
    }
  }

  for (const seed of NEGATIVE_SEEDS) {
    if (matchesNormalized(normalizedText, seed)) {
      negative += 1
      negativeSeeds.add(seed.raw)
    }
  }

  return {
    score: { positive, negative },
    hits: { positive: positiveSeeds.size, negative: negativeSeeds.size },
    signals: {
      ...EMPTY_SIGNALS,
      positiveSeeds: Array.from(positiveSeeds),
      negativeSeeds: Array.from(negativeSeeds),
    },
  }
}

function tokenMatches(token: string, keyword: string, mode: TokenMatchMode): boolean {
  switch (mode) {
    case 'exact':
      return token === keyword
    case 'prefix':
      return token === keyword || token.startsWith(keyword)
    case 'includes':
    default:
      return token.includes(keyword)
  }
}

function evaluateTokenHeuristics(tokens: readonly string[], _langHints: Set<LangHint>): EvaluationResult {
  // currently not used; reserved for future language-specific token tweaks
  void _langHints
  if (!tokens.length) {
    return {
      score: { positive: 0, negative: 0 },
      hits: { positive: 0, negative: 0 },
      signals: EMPTY_SIGNALS,
    }
  }

  const uniqueTokens = Array.from(new Set(tokens))
  let positive = 0
  let negative = 0
  const positiveMatches = new Set<string>()
  const negativeMatches = new Set<string>()

  for (const token of uniqueTokens) {
    if (!token) continue
    for (const rule of TOKEN_HEURISTICS) {
      for (const entry of rule.keywords) {
        if (!entry.normalized) continue
        if (tokenMatches(token, entry.normalized, rule.match)) {
          if (rule.polarity === 'positive') {
            positive += rule.weight
            positiveMatches.add(entry.raw)
          } else {
            negative += rule.weight
            negativeMatches.add(entry.raw)
          }
          break
        }
      }
    }
  }

  return {
    score: { positive, negative },
    hits: { positive: positiveMatches.size, negative: negativeMatches.size },
    signals: {
      ...EMPTY_SIGNALS,
      positiveTokens: Array.from(positiveMatches),
      negativeTokens: Array.from(negativeMatches),
    },
  }
}

function evaluatePhraseHeuristics(normalizedText: string, _langHints: Set<LangHint>): EvaluationResult {
  // currently not used; reserved for future language-specific phrase tweaks
  void _langHints
  if (!normalizedText.trim()) {
    return {
      score: { positive: 0, negative: 0 },
      hits: { positive: 0, negative: 0 },
      signals: EMPTY_SIGNALS,
    }
  }

  let positive = 0
  let negative = 0
  const positiveMatches = new Set<string>()
  const negativeMatches = new Set<string>()

  for (const rule of PHRASE_HEURISTICS) {
    for (const phrase of rule.phrases) {
      if (!phrase.normalized) continue
      if (normalizedText.includes(phrase.normalized)) {
        if (rule.polarity === 'positive') {
          positive += rule.weight
          positiveMatches.add(phrase.raw)
        } else {
          negative += rule.weight
          negativeMatches.add(phrase.raw)
        }
      }
    }
  }

  return {
    score: { positive, negative },
    hits: { positive: positiveMatches.size, negative: negativeMatches.size },
    signals: {
      ...EMPTY_SIGNALS,
      positivePhrases: Array.from(positiveMatches),
      negativePhrases: Array.from(negativeMatches),
    },
  }
}

function mergeSignals(parts: ToneSignals[]): ToneSignals {
  const mergeSet = (getter: (signals: ToneSignals) => string[]): string[] => {
    const set = new Set<string>()
    for (const part of parts) {
      for (const value of getter(part)) {
        if (value) set.add(value)
      }
    }
    return Array.from(set)
  }

  return {
    positiveSeeds: mergeSet((signals) => signals.positiveSeeds),
    negativeSeeds: mergeSet((signals) => signals.negativeSeeds),
    positiveTokens: mergeSet((signals) => signals.positiveTokens),
    negativeTokens: mergeSet((signals) => signals.negativeTokens),
    positivePhrases: mergeSet((signals) => signals.positivePhrases),
    negativePhrases: mergeSet((signals) => signals.negativePhrases),
  }
}

type LangHint = 'en' | 'fr' | 'de' | 'es' | 'jp'

function detectLangHintsFromRaw(raw: string): Set<LangHint> {
  const hints = new Set<LangHint>()
  if (!raw || typeof raw !== 'string') return hints
  // Japanese characters
  if (/[\u3040-\u30ff\u4e00-\u9faf]/.test(raw)) hints.add('jp')
  // Accented ranges
  if (/[éèêëàâîïôùûçÉÈÊËÀÂÎÏÔÙÛÇ]/.test(raw)) hints.add('fr')
  if (/[äöüÄÖÜß]/.test(raw)) hints.add('de')
  if (/[ñáéíóúÁÉÍÓÚÑ]/.test(raw)) hints.add('es')
  // If no strong non-EN marker, assume English context may apply
  if (!hints.size) hints.add('en')
  return hints
}

const GUARDED_POSITIVE_SEEDS: Record<string, LangHint[]> = {
  // normalized (accents stripped) -> allowed languages
  toll: ['de'],
  genial: ['fr', 'es', 'de'],
}

const SEED_WEIGHT_OVERRIDES: Record<string, number> = {
  // normalized seed -> weight delta
  super: 0.5,
  wow: 0.5,
  yay: 0.5,
  good: 0.75,
}

function seedDeltaForLang(seed: NormalizedKeyword, langHints: Set<LangHint>): number {
  const key = seed.normalized
  if (!key) return 1
  const override = SEED_WEIGHT_OVERRIDES[key]
  if (typeof override === 'number') return override
  const guard = GUARDED_POSITIVE_SEEDS[key]
  if (guard && guard.length) {
    for (const g of guard) {
      if (langHints.has(g)) return 1
    }
    return 0.5
  }
  return 1
}

export function computeToneScore(segments: readonly string[]): ToneScoreResult {
  const meaningful = segments
    .filter((segment): segment is string => typeof segment === 'string' && segment.trim().length > 0)
  if (!meaningful.length) {
    return { score: { positive: 0, negative: 0 }, signals: EMPTY_SIGNALS }
  }

  const rawText = meaningful.join(' ')
  const normalizedText = normalizeForSentiment(rawText)
  const langHints = detectLangHintsFromRaw(rawText)
  if (!normalizedText.trim()) {
    return { score: { positive: 0, negative: 0 }, signals: EMPTY_SIGNALS }
  }

  const tokens = normalizedText.split(/\s+/).filter(Boolean)

  const seedResult = evaluateSeeds(normalizedText, langHints)
  const tokenResult = evaluateTokenHeuristics(tokens, langHints)
  const phraseResult = evaluatePhraseHeuristics(normalizedText, langHints)

  let positive = seedResult.score.positive + tokenResult.score.positive + phraseResult.score.positive
  let negative = seedResult.score.negative + tokenResult.score.negative + phraseResult.score.negative

  const totalPositiveHits =
    seedResult.hits.positive + tokenResult.hits.positive + phraseResult.hits.positive
  const totalNegativeHits =
    seedResult.hits.negative + tokenResult.hits.negative + phraseResult.hits.negative

  if (totalPositiveHits >= 2 && totalNegativeHits === 0) {
    positive += totalPositiveHits >= 4 ? 2 : 1
  }

  if (totalNegativeHits >= 2 && totalPositiveHits === 0) {
    negative += totalNegativeHits >= 4 ? 2 : 1
  }

  const signals = mergeSignals([seedResult.signals, tokenResult.signals, phraseResult.signals])

  return {
    score: { positive, negative },
    signals,
  }
}

export function classifyTone(score: ToneScore): ToneClassification {
  const { positive, negative } = score
  const total = positive + negative

  if (total === 0) {
    return { tone: 'neutral', confidence: 0 }
  }

  if (positive === negative) {
    const tieConfidence = Math.min(0.45, Number((total * 0.08).toFixed(2)))
    return { tone: 'neutral', confidence: tieConfidence }
  }

  const tone = positive > negative ? 'positive' : 'negative'
  const diff = Math.abs(positive - negative)
  const base = diff / total
  const magnitudeBoost = Math.min(0.4, total / 6)
  const weighted = Math.min(1, Number(((base * 0.7) + magnitudeBoost).toFixed(2)))

  return { tone, confidence: weighted }
}

export function deriveToneFromSegments(segments: readonly string[]): ToneScoreResult & {
  classification: ToneClassification
} {
  const result = computeToneScore(segments)
  return {
    ...result,
    classification: classifyTone(result.score),
  }
}

export function summarizeSignals(signals: ToneSignals): {
  positive: string[]
  negative: string[]
} {
  const positive = [
    ...signals.positiveSeeds,
    ...signals.positiveTokens,
    ...signals.positivePhrases,
  ]
  const negative = [
    ...signals.negativeSeeds,
    ...signals.negativeTokens,
    ...signals.negativePhrases,
  ]
  return {
    positive: Array.from(new Set(positive)),
    negative: Array.from(new Set(negative)),
  }
}

export function getAllToneSeeds(): { positive: readonly string[]; negative: readonly string[] } {
  return {
    positive: POSITIVE_SEEDS_RAW,
    negative: NEGATIVE_SEEDS_RAW,
  }
}
