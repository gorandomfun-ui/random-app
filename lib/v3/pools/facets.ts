/**
 * The pools to fill, each with the queries a nightly pass asks Dailymotion —
 * free, no quota — so that every one of them grows every day. Genres, forms,
 * decades, countries, and since 26 September the odd, the simple and the
 * niche side of each; a handful a night, turning through the list. The
 * smaller a pool, the more of its queries a night asks (`queriesTonight`),
 * until it reaches the floor. Cinema and news have no pool here.
 */

import type { Universe } from '../types'

export type PoolUniverse = Extract<Universe, 'music' | 'sport' | 'gaming' | 'humor-memes' | 'events-parties' | 'food' | 'travel' | 'craft'
  | 'art' | 'science' | 'history' | 'tech' | 'animation' | 'fashion' | 'vehicles' | 'people-everyday' | 'nature-animals'>

export const POOL_UNIVERSES: readonly PoolUniverse[] = [
  'music', 'sport', 'gaming', 'humor-memes', 'events-parties', 'food', 'travel', 'craft',
  'art', 'science', 'history', 'tech', 'animation', 'fashion', 'vehicles', 'people-everyday', 'nature-animals',
]

export const POOL_LABELS: Record<PoolUniverse, string> = {
  music: 'musique', sport: 'sport', gaming: 'gaming', 'humor-memes': 'humour', 'events-parties': 'fête', food: 'food', travel: 'découverte', craft: 'astuces / artisanat',
  art: 'art', science: 'science', history: 'histoire', tech: 'tech', animation: 'animation', fashion: 'mode', vehicles: 'véhicules', 'people-everyday': 'gens',
  'nature-animals': 'animaux / nature',
}

export const POOL_QUERIES: Record<PoolUniverse, readonly string[]> = {
  music: [
    // Added 26/09 for the catch-up: the odd, the simple, the niche side of the same pool.
    'instrument bizarre', 'weird instrument', 'musique avec des objets', 'vegetable orchestra', 'thérémine', 'hang drum', 'harmonica de verre',
    'orgue de barbarie', 'one man band', 'homme orchestre', 'chant diphonique', 'throat singing', 'yodel', 'musique expérimentale',
    'orchestre de jouets', 'toy piano', 'musique de rue insolite', 'fanfare déjantée',
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
    // Added 26/09 for the catch-up: the odd, the simple, the niche side of the same pool.
    'sketch surréaliste', 'comédie muette', 'slapstick', 'humour visuel sans paroles', 'burlesque', 'sketch amateur drôle', 'parodie publicité',
    'humour belge', 'humour québécois', 'clown de rue', 'théâtre d impro insolite',
    'sketch comique', 'stand up comedy', 'caméra cachée', 'bêtisier', 'parodie', 'improv comedy', 'comedy club', 'humoriste scène', 'sketch télé', 'canular téléphonique', 'prank gone right',
    'funny animals', 'chat drôle', 'chien drôle', 'gag visuel', 'humour absurde', 'blooper reel', 'faux documentaire', 'satire', 'comedy short film', 'mime comedy', 'clown show',
    'ventriloque', 'magicien comique', 'jongleur comique', 'humour noir sketch', 'comédie musicale parodie', 'imitation célébrité', 'talk show funny moment', 'one man show', 'sitcom scene',
    'comedy sketch 1990', 'british comedy', 'comedia española', 'komedie', 'commedia', 'comédia brasileira', 'japanese comedy', 'korean comedy', 'india comedy', 'comedy roast',
    'improv show', 'silly walk', 'dad jokes', 'puns', 'awkward moments', 'reaction funny', 'fail compilation', 'wtf moments', 'trucs débiles', 'vidéo débile',
  ],
  'events-parties': [
    // Added 26/09 for the catch-up: the odd, the simple, the niche side of the same pool.
    'fête insolite', 'weird festival', 'course de baignoires', 'festival bizarre', 'concours de grimaces', 'lancer de bottes',
    'course de garçons de café', 'fête du citron', 'bataille de fleurs', 'fête de la courge géante', 'concours de moustaches', 'fête des lumières',
    'procession insolite', 'carnaval de village',
    'carnaval de rio', 'carnaval de venise', 'fête de village', 'mariage traditionnel', 'street party', 'festival des lanternes', 'nouvel an chinois', 'oktoberfest', 'feria de sevilla',
    'holi festival', 'diwali celebration', 'songkran', 'fête de la musique', 'bal populaire', 'fête foraine', 'feu d artifice', 'défilé du 14 juillet', 'saint patrick parade', 'mardi gras',
    'notting hill carnival', 'burning man', 'rave 1992', 'free party', 'soirée mousse', 'block party', 'pool party', 'quinceañera', 'bar mitzvah party', 'baptême fête', 'fête de fin d année',
    'réveillon', 'halloween party', 'dia de los muertos', 'fête des morts', 'festival de musique foule', 'concert de rue', 'flash mob', 'bal masqué', 'fête costumée', 'anniversaire surprise',
    'mariage indien', 'mariage africain', 'mariage japonais', 'fête nationale', 'fête de la bière', 'fête du vin', 'fête des vendanges', 'fête médiévale', 'tomatina', 'san fermin',
  ],
  food: [
    // Added 26/09 for the catch-up: the odd, the simple, the niche side of the same pool.
    'recette insolite', 'weird food', 'cuisine bizarre', 'nourriture étrange', 'plat oublié', 'recette ancienne', 'cuisine de survie', 'food hack',
    'marché nocturne', 'cuisine de rue insolite', 'plat géant', 'record culinaire', 'cuisine au four solaire', 'dessert étrange',
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
    // Added 26/09 for the catch-up: the odd, the simple, the niche side of the same pool.
    'objet détourné', 'invention maison', 'restauration objet rouillé', 'fabrication insolite', 'bricolage absurde', 'machine en bois',
    'jouet en bois fait main', 'sculpture en fil de fer',
    'diy', 'restauration meuble', 'poterie tour', 'forge couteau', 'tricot', 'origami', 'menuiserie', 'réparation vélo', 'ébénisterie', 'tournage sur bois', 'soufflage de verre',
    'vitrail', 'reliure', 'calligraphie', 'gravure', 'sérigraphie', 'tissage', 'broderie', 'couture', 'crochet', 'macramé', 'vannerie', 'céramique raku', 'émail', 'bijouterie', 'horlogerie',
    'luthier', 'facteur de piano', 'cordonnier', 'sellier', 'maroquinerie', 'tannage', 'savon artisanal', 'bougie artisanale', 'fabrication couteau', 'fabrication guitare', 'restauration voiture',
    'restauration vélo', 'restauration montre', 'restauration jouet', 'réparation électronique', 'bricolage maison', 'astuce bricolage', 'astuce cuisine', 'astuce rangement', 'astuce jardin',
    'life hack', 'trucs et astuces', 'how it is made', 'fabrication artisanale', 'atelier artisan', 'métier d art', 'savoir-faire',
  ],
  // The pools the catch-up fills from 26/09: none of them had a nightly pass before. Odd, simple and niche, never political.
  art: [
    'peinture performance', 'speed painting', 'street art timelapse', 'graffiti jam', 'sculpture sur glace', 'sand art performance', 'land art',
    'art brut', 'outsider art', 'peintre amateur', 'dessin au stylo bille', 'calligraphie japonaise', 'aquarelle paysage', 'art performance absurde',
    'installation artistique insolite', 'musée étrange', 'exposition bizarre', 'sculpture cinétique', 'art avec des déchets', 'art recyclé',
    'miniature diorama', 'body painting', 'fresque murale village', 'portrait en 60 secondes', 'caricaturiste de rue', 'dessin rapide croquis',
    'ukiyo-e', 'mosaïque romaine', 'photographie argentique', 'photo de rue', 'sténopé photographie', 'architecture brutaliste',
    'maison d architecte insolite', 'art naïf', 'illusion d optique peinture', 'anamorphose', 'dessin 3d trompe l oeil', 'light painting',
    'sculpture de sable géante', 'latte art', 'marionnettes géantes', 'théâtre d ombres', 'statue vivante', 'artiste de rue incroyable',
    'surrealist painting', 'art déco', 'art nouveau', 'peinture chinoise encre', 'alebrijes', 'azulejos', 'papier découpé art', 'kirigami',
    'sculpture bois tronçonneuse', 'peinture au doigt', 'art sonore installation',
  ],
  science: [
    'expérience scientifique maison', 'weird science experiment', 'slow motion science', 'machine de rube goldberg', 'rube goldberg machine',
    'microscope eau de mare', 'tardigrade microscope', 'expérience chimie spectaculaire', 'réaction chimique colorée', 'fluide non newtonien',
    'ferrofluid', 'bobine tesla', 'tesla coil music', 'électricité statique expérience', 'aimant néodyme expérience', 'lévitation acoustique',
    'hydraulic press', 'presse hydraulique', 'ballon stratosphérique caméra', 'fusée amateur', 'amateur rocket launch', 'astronomie amateur',
    'télescope fait maison', 'éclipse solaire', 'physique amusante', 'fractal zoom', 'cymatics', 'chladni plate', 'invention insolite',
    'inventeur amateur', 'machine étrange invention', 'insectes macro', 'fourmilière artificielle', 'myxomycète', 'champignons timelapse',
    'plantes carnivores', 'bioluminescence', 'créatures des abysses', 'fouille paléontologie', 'météorite découverte', 'azote liquide expérience',
    'dry ice experiment', 'bulles de savon géantes', 'croissance de cristaux', 'crystal growing', 'film éducatif 1960', 'vieux film scientifique',
    'expérience de foudre', 'tornade en laboratoire', 'volcan maquette expérience', 'robot insecte', 'mathématiques visuelles',
    'optique laser expérience',
  ],
  history: [
    'film d archives 1920', 'images d archives colorisées', 'colorized footage 1900', 'paris 1900', 'new york 1930 footage', 'london 1920s footage',
    'vieux métiers', 'métier disparu', 'la vie en 1900', 'reconstitution historique', 'combat médiéval reconstitution', 'fouille archéologique',
    'trésor découverte', 'château fort visite', 'ruines romaines', 'pompéi', 'égypte ancienne', 'cité maya', 'reconstitution viking',
    'objets anciens mystérieux', 'vieille publicité', 'publicité années 60', 'old commercials 1970s', 'actualités 1950', 'newsreel 1940s',
    'train à vapeur historique', 'avion ancien restauré', 'costume historique', 'mode des années 20 archives', 'charleston 1926',
    'école d autrefois', 'village d antan', 'vie paysanne ancienne', 'outils anciens', 'machine ancienne restaurée', 'horlogerie ancienne',
    'carte ancienne', 'manuscrit médiéval', 'enluminure', 'imprimerie ancienne', 'histoire insolite', 'anecdote historique', 'mystère historique',
    'exposition universelle 1900', 'world fair 1939', 'cartes postales anciennes', 'jeux d autrefois', 'cuisine médiévale',
    'vieux cinéma de quartier', 'fête foraine ancienne', 'amphithéâtre romain', 'temple grec',
  ],
  tech: [
    'robot fait maison', 'homemade robot', 'vieux ordinateur', 'retro computing', 'ordinateur 1980', 'minitel', 'walkman', 'cassette audio',
    'machine à écrire', 'typewriter', 'gadget insolite', 'weird gadget', 'invention bizarre', 'course de drones', 'fpv drone', 'projet arduino',
    'raspberry pi project', 'réparation électronique', 'teardown', 'démontage appareil', 'téléphone à cadran', 'impression 3d timelapse',
    'machine cnc', 'découpe laser', 'hologramme', 'réalité virtuelle insolite', 'robot danse', 'automate ancien', 'automaton',
    'machine à vapeur miniature', 'circuit bending', 'modular synth', 'jeu électronique vintage', 'console oubliée', 'prototype insolite',
    'internet 1995', 'démonstration informatique ancienne', 'ordinateur soviétique', 'calculatrice ancienne', 'oscilloscope art', 'led art',
    'robot cuisinier', 'vieux logiciel', 'windows 95', 'disquette', 'magnétoscope', 'télévision cathodique', 'radio à galène',
    'jukebox restauration', 'horloge nixie', 'clavier mécanique fait maison', 'pc dans une boîte insolite',
  ],
  animation: [
    'court métrage d animation', 'animation étudiante', 'student animation', 'stop motion', 'claymation', 'animation papier découpé',
    'cutout animation', 'pixilation', 'animation expérimentale', 'animation soviétique', 'soyuzmultfilm', 'animation tchèque',
    'animation japonaise ancienne', 'dessin animé 1930', 'cartoon 1940s', 'fleischer cartoon', 'rubber hose animation', 'animation indépendante',
    'animation absurde', 'surreal animation', 'animation courte drôle', 'flipbook', 'folioscope', 'animation de sable', 'sand animation',
    'peinture sur verre animation', 'brickfilm', 'animation lego', 'blender short film', 'pixel art animation', 'animatic',
    'pâte à modeler animation', 'marionnette animation', 'dessin animé oublié', 'générique dessin animé années 80', 'cartoon intro 90s',
    'anime opening 80s', 'festival d annecy', 'animation festival', 'rotoscopie', 'rotoscope animation', 'animation 2d fait main',
    'dessin animé français ancien', 'animation polonaise', 'animation canadienne onf', 'norman mclaren', 'animation musicale',
    'motion design expérimental', 'animation dessin à la craie', 'animation sur tableau noir',
  ],
  fashion: [
    'défilé étudiant', 'mode vintage', 'friperie', 'thrift flip', 'upcycling vêtement', 'création couture', 'costume fait maison',
    'fabrication cosplay', 'mode années 70', 'mode des années 50', 'lookbook vintage', 'street style tokyo', 'harajuku', 'mode africaine',
    'tissu wax', 'la sape congo', 'sapeurs', 'costume traditionnel', 'kimono', 'sari drapé', 'chapelier', 'fabrication chapeau', 'sneakers custom',
    'coiffure extravagante', 'coiffure années 60', 'maquillage artistique', 'maquillage théâtral', 'drag makeup', 'défilé insolite', 'mode bizarre',
    'fashion week backstage', 'atelier haute couture', 'broderie haute couture', 'accessoires faits main', 'bijoux fantaisie fabrication',
    'tailleur sur mesure', 'bespoke tailoring', 'teinture naturelle', 'tie and dye', 'tricot mode', 'défilé de mode rétro', 'mode des années 80',
    'mode punk', 'mode gothique', 'lolita fashion', 'mode des années 20', 'robe en papier', 'vêtement recyclé défilé', 'mode écologique',
    'uniformes anciens', 'défilé de chapeaux', 'perruque fabrication',
  ],
  vehicles: [
    'voiture ancienne', 'rétromobile', 'vieux tracteur', 'fête du tracteur', 'moissonneuse batteuse', 'camion américain', 'voiture insolite',
    'weird car', 'microcar', 'voiture sans permis', '2cv rassemblement', 'side-car', 'mobylette', 'solex', 'vespa rassemblement',
    'course de caisses à savon', 'soapbox race', 'course de tondeuses', 'lawn mower race', 'monster truck', 'demolition derby', 'stock car',
    'train miniature', 'modélisme ferroviaire', 'train de montagne', 'funiculaire', 'tramway ancien', 'bus ancien', 'meeting aérien ancien',
    'hydravion', 'dirigeable', 'montgolfière', 'bateau à vapeur', 'péniche', 'visite sous-marin', 'vélo insolite', 'tall bike', 'vélo couché',
    'rat rod', 'lowrider', 'dekotora', 'jeepney', 'tuk tuk', 'art car', 'voiture amphibie', 'autogire', 'char à voile', 'draisine',
    'bus scolaire aménagé', 'camion de pompier ancien', 'locomotive à vapeur', 'voiture à pédales',
  ],
  'people-everyday': [
    'une journée ordinaire', 'métier insolite', 'une journée avec un artisan', 'portrait d artisan', 'petit commerce de quartier', 'marché local',
    'boulanger de village', 'vie à la campagne', 'vie dans un van', 'grand-mère raconte', 'souvenirs d enfance', 'talent caché',
    'talent amateur incroyable', 'passion insolite', 'collectionneur', 'collection bizarre', 'record du monde insolite', 'concours insolite',
    'championnat bizarre', 'fête de quartier', 'rencontre inattendue', 'home video 1990', 'film de famille super 8', 'vacances années 80',
    'caméscope vhs', 'anniversaire vhs', 'routine du matin', 'petit déjeuner du monde', 'école du bout du monde', 'maison insolite', 'tiny house',
    'cabane dans les arbres', 'vivre sans électricité', 'ermite', 'village isolé', 'gardien de phare', 'berger', 'pêcheur artisanal',
    'facteur rural', 'barbier de rue', 'cireur de chaussures', 'vendeur de rue', 'chauffeur de taxi histoires', 'veilleur de nuit', 'bibliothécaire',
    'apiculteur amateur', 'jardinier passionné', 'club de retraités', 'bal des seniors', 'colocation insolite', 'famille nombreuse journée',
  ],
  'nature-animals': [
    'animaux insolites', 'weird animals', 'animal rare', 'oiseau étrange', 'danse oiseau de paradis', 'mimétisme animal', 'caméléon',
    'poulpe camouflage', 'seiche', 'axolotl', 'paresseux', 'tatou', 'pangolin', 'capybara', 'loutre', 'hérisson', 'ferme pédagogique',
    'animaux de ferme drôles', 'chèvres', 'alpagas', 'canards', 'poules', 'escargots', 'insectes étranges', 'phasme', 'mante religieuse',
    'araignée paon', 'fourmis coupe-feuille', 'ruche abeilles', 'apiculture', 'termitière', 'poissons abyssaux', 'méduses', 'animaux qui jouent',
    'chat bizarre', 'chien talentueux', 'caméra piège', 'trail camera', 'faune nocturne', 'animaux sauvages en ville', 'renard', 'hibou',
    'nature timelapse', 'forêt primaire', 'orage supercellule', 'phénomène naturel étrange', 'migration des oiseaux', 'nid d oiseau', 'tortues',
    'grenouilles', 'lézards', 'papillons éclosion',
  ],
}

/** How many of a universe's queries one night asks, when nothing says it is behind. */
export const QUERIES_PER_NIGHT = 8

/**
 * The catch-up, decided with the owner on 26 September: every pool should
 * hold at least this many drawable videos. Below it, a pool gets up to twice
 * the night's queries, the more the further behind; above it, it keeps
 * growing, a little slower. Cinema and news are not pools: they get nothing.
 */
export const POOL_FLOOR = 20_000
export const QUERIES_ABOVE_FLOOR = 6
export const QUERIES_MAX = 16

export function queriesTonight(drawable: number | null | undefined): number {
  if (typeof drawable !== 'number' || !Number.isFinite(drawable) || drawable < 0) return QUERIES_PER_NIGHT
  if (drawable >= POOL_FLOOR) return QUERIES_ABOVE_FLOOR
  const behind = (POOL_FLOOR - drawable) / POOL_FLOOR
  return Math.min(QUERIES_MAX, QUERIES_PER_NIGHT + Math.round(QUERIES_PER_NIGHT * behind))
}

/** The night's queries for a universe: a window that slides along the list, day after day, round the end. */
export function queriesForDay(universe: PoolUniverse, day: Date, perNight = QUERIES_PER_NIGHT): string[] {
  const list = POOL_QUERIES[universe]
  if (!list.length) return []
  const dayIndex = Math.floor(day.getTime() / 86_400_000)
  const start = (dayIndex * perNight) % list.length
  return Array.from({ length: Math.min(perNight, list.length) }, (_, index) => list[(start + index) % list.length])
}
