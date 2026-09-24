/**
 * The pools to fill: the big universes, each with the queries a nightly
 * pass asks Dailymotion — free, no quota — so that every one of them grows
 * a little every day. Genres, forms, decades, countries; a handful a day,
 * turning through the list so the same question is not asked twice in a
 * month. Nothing here steers shares or budgets: the pass only adds.
 */

import type { Universe } from '../types'

export type PoolUniverse = Extract<Universe, 'music' | 'sport' | 'gaming' | 'humor-memes' | 'events-parties' | 'food' | 'travel' | 'craft'>

export const POOL_UNIVERSES: readonly PoolUniverse[] = ['music', 'sport', 'gaming', 'humor-memes', 'events-parties', 'food', 'travel', 'craft']

export const POOL_LABELS: Record<PoolUniverse, string> = {
  music: 'musique', sport: 'sport', gaming: 'gaming', 'humor-memes': 'humour', 'events-parties': 'fête', food: 'food', travel: 'découverte', craft: 'astuces / artisanat',
}

export const POOL_QUERIES: Record<PoolUniverse, readonly string[]> = {
  music: [
    'live jazz trio', 'jazz club session', 'punk concert 1982', 'concert rock 90s', 'session acoustique', 'reggae live session', 'techno set warehouse', 'flamenco en vivo',
    'chanson française concert', 'blues club live', 'fanfare en fête', 'live hip hop cypher', 'soul singer live', 'funk band live', 'concert metal festival', 'orchestre symphonique concert',
    'chorale gospel live', 'live salsa orquesta', 'afrobeat concert', 'cumbia en vivo', 'samba de roda', 'fado lisboa', 'rebetiko live', 'rai concert', 'bhangra live', 'k-pop live stage',
    'j-pop live', 'enka live', 'mariachi en vivo', 'tango en vivo', 'ska band live', 'garage rock live', 'shoegaze live', 'post-punk live', 'new wave concert 1984', 'disco live 1978',
    'synthwave live', 'drum and bass set', 'dub soundsystem', 'folk session', 'bluegrass live', 'country live show', 'kora concert', 'oud concert', 'sitar live', 'gamelan performance',
    'taiko drums live', 'accordéon musette', 'brass band street', 'street musician amazing', 'busking violin', 'piano bar live', 'jam session live', 'clip officiel rock', 'clip officiel rap',
    'official video indie', 'unplugged session', 'tiny concert', 'live at festival', 'concert live 1995', 'concert live 2005',
  ],
  sport: [
    'skate video part', 'skateboarding street', 'match de rugby amateur', 'surf competition', 'big wave surf', 'boxe championnat', 'marathon finish', 'parkour freerun', 'bmx contest',
    'judo championship', 'karate kumite', 'sumo tournament', 'football amateur but', 'futsal skills', 'basketball streetball', 'volleyball beach', 'handball final', 'hockey sur glace',
    'cyclisme col', 'downhill mountain bike', 'trail running', 'escalade falaise', 'ski freeride', 'snowboard park', 'kitesurf', 'wingsuit', 'motocross race', 'rallye wrc onboard',
    'formule 1 1990', 'moto gp', 'course de chevaux', 'rodeo', 'pétanque championnat', 'boules lyonnaises', 'tennis de table', 'badminton final', 'escrime', 'gymnastique artistique',
    'athlétisme sprint', 'saut en hauteur', 'natation relais', 'water polo', 'aviron', 'kayak rivière', 'voile régate', 'cricket match', 'baseball highlights', 'sepak takraw',
    'kabaddi match', 'muay thai fight', 'capoeira roda', 'lutte gréco-romaine', 'strongman competition', 'crossfit games', 'e-bike race', 'skateboard 1990', 'sport insolite',
  ],
  gaming: [
    'speedrun world record', 'retro gaming longplay', 'arcade 1990 gameplay', 'gameplay nes', 'gameplay snes', 'gameplay mega drive', 'gameplay playstation 1', 'gameplay dreamcast',
    'gameplay n64', 'gameplay game boy', 'esport final', 'fighting game tournament', 'evo moment', 'lan party 2003', 'indie game gameplay', 'roguelike gameplay', 'metroidvania gameplay',
    'shmup 1cc', 'bullet hell gameplay', 'point and click gameplay', 'visual novel', 'rhythm game perfect', 'pinball machine', 'arcade cabinet restoration', 'demoscene demo', 'chiptune live',
    'mod gameplay', 'romhack gameplay', 'tas run', 'glitch gameplay', 'easter egg gameplay', 'cut content', 'unreleased game', 'beta gameplay', 'gameplay pc 1998', 'gameplay amiga',
    'gameplay commodore 64', 'gameplay msx', 'gameplay atari', 'gameplay ms-dos', 'jeu vidéo rétro', 'partie complète jeu', 'jeu de rythme', 'jeu de combat', 'jeu de course arcade',
    'simulateur de vol', 'jeu de stratégie', 'jeu de rôle japonais', 'mmo raid', 'minecraft build timelapse', 'fortnite montage', 'gta stunts', 'zelda speedrun', 'mario kart race',
    'pokemon nuzlocke', 'tetris world championship', 'street fighter tournament', 'tekken tournament', 'super smash bros tournament', 'gaming 2000s',
  ],
  'humor-memes': [
    'sketch comique', 'stand up comedy', 'caméra cachée', 'bêtisier', 'parodie', 'improv comedy', 'comedy club', 'humoriste scène', 'sketch télé', 'canular téléphonique', 'prank gone right',
    'funny animals', 'chat drôle', 'chien drôle', 'gag visuel', 'humour absurde', 'blooper reel', 'faux documentaire', 'satire', 'comedy short film', 'mime comedy', 'clown show',
    'ventriloque', 'magicien comique', 'jongleur comique', 'humour noir sketch', 'comédie musicale parodie', 'imitation célébrité', 'talk show funny moment', 'one man show', 'sitcom scene',
    'comedy sketch 1990', 'british comedy', 'comedia española', 'komedie', 'commedia', 'comédia brasileira', 'japanese comedy', 'korean comedy', 'india comedy', 'comedy roast',
    'improv show', 'silly walk', 'dad jokes', 'puns', 'awkward moments', 'reaction funny', 'fail compilation', 'wtf moments', 'trucs débiles', 'vidéo débile',
  ],
  'events-parties': [
    'carnaval de rio', 'carnaval de venise', 'fête de village', 'mariage traditionnel', 'street party', 'festival des lanternes', 'nouvel an chinois', 'oktoberfest', 'feria de sevilla',
    'holi festival', 'diwali celebration', 'songkran', 'fête de la musique', 'bal populaire', 'fête foraine', 'feu d artifice', 'défilé du 14 juillet', 'saint patrick parade', 'mardi gras',
    'notting hill carnival', 'burning man', 'rave 1992', 'free party', 'soirée mousse', 'block party', 'pool party', 'quinceañera', 'bar mitzvah party', 'baptême fête', 'fête de fin d année',
    'réveillon', 'halloween party', 'dia de los muertos', 'fête des morts', 'festival de musique foule', 'concert de rue', 'flash mob', 'bal masqué', 'fête costumée', 'anniversaire surprise',
    'mariage indien', 'mariage africain', 'mariage japonais', 'fête nationale', 'fête de la bière', 'fête du vin', 'fête des vendanges', 'fête médiévale', 'tomatina', 'san fermin',
  ],
  food: [
    'street food', 'recette traditionnelle', 'marché aux poissons', 'ramen kitchen', 'boulangerie artisanale', 'barbecue argentin', 'pâtisserie française', 'cuisine de rue asiatique',
    'recette de grand-mère', 'cuisine italienne nonna', 'pizza napolitaine four', 'sushi master', 'dim sum', 'tacos al pastor', 'couscous maison', 'tajine', 'pho hanoi', 'banh mi',
    'kebab berlin', 'currywurst', 'paella valenciana', 'jamón ibérico', 'fromage affinage', 'fabrication du pain', 'chocolaterie', 'confiserie artisanale', 'crêpes bretonnes',
    'raclette', 'fondue', 'bouillabaisse', 'cassoulet', 'poutine', 'jerk chicken', 'jollof rice', 'injera', 'biryani', 'thali', 'dumplings', 'hot pot', 'korean bbq', 'kimchi',
    'bento', 'onigiri', 'mochi', 'gelato', 'churros', 'baklava', 'restaurant cuisine ouverte', 'chef étoilé service', 'cuisine de camp', 'cuisine au feu de bois', 'mukbang',
  ],
  travel: [
    'walking tour', 'village abandonné', 'road trip', 'marché flottant', 'temple bouddhiste', 'randonnée montagne', 'train journey', 'île déserte', 'exploration urbaine', 'lieu abandonné',
    'grotte exploration', 'désert traversée', 'safari', 'jungle trek', 'aurore boréale', 'volcan éruption', 'cascade', 'canyon', 'fjord', 'glacier', 'ville la nuit', 'quartier historique',
    'medina', 'souk', 'bazar', 'temple angkor', 'machu picchu', 'petra', 'sahara', 'patagonie', 'islande road trip', 'norvège fjords', 'japon village', 'corée village', 'vietnam moto',
    'inde train', 'népal trek', 'mongolie steppe', 'sibérie', 'transsibérien', 'route 66', 'amazonie', 'andes', 'himalaya', 'alpes randonnée', 'pyrénées', 'corse sentier', 'bretagne côte',
    'ferry traversée', 'cargo voyage', 'vélo voyage', 'van life', 'camping sauvage', 'plongée récif', 'snorkeling', 'découverte insolite',
  ],
  craft: [
    'diy', 'restauration meuble', 'poterie tour', 'forge couteau', 'tricot', 'origami', 'menuiserie', 'réparation vélo', 'ébénisterie', 'tournage sur bois', 'soufflage de verre',
    'vitrail', 'reliure', 'calligraphie', 'gravure', 'sérigraphie', 'tissage', 'broderie', 'couture', 'crochet', 'macramé', 'vannerie', 'céramique raku', 'émail', 'bijouterie', 'horlogerie',
    'luthier', 'facteur de piano', 'cordonnier', 'sellier', 'maroquinerie', 'tannage', 'savon artisanal', 'bougie artisanale', 'fabrication couteau', 'fabrication guitare', 'restauration voiture',
    'restauration vélo', 'restauration montre', 'restauration jouet', 'réparation électronique', 'bricolage maison', 'astuce bricolage', 'astuce cuisine', 'astuce rangement', 'astuce jardin',
    'life hack', 'trucs et astuces', 'how it is made', 'fabrication artisanale', 'atelier artisan', 'métier d art', 'savoir-faire',
  ],
}

/** How many of a universe's queries one night asks. */
export const QUERIES_PER_NIGHT = 8

/** The night's queries for a universe: a window that slides along the list, day after day, round the end. */
export function queriesForDay(universe: PoolUniverse, day: Date, perNight = QUERIES_PER_NIGHT): string[] {
  const list = POOL_QUERIES[universe]
  if (!list.length) return []
  const dayIndex = Math.floor(day.getTime() / 86_400_000)
  const start = (dayIndex * perNight) % list.length
  return Array.from({ length: Math.min(perNight, list.length) }, (_, index) => list[(start + index) % list.length])
}
