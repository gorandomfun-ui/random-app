/**
 * The hand-written theme list.
 *
 * Entities (people, films, bands) come from Wikipedia; themes do not — nobody
 * writes an encyclopaedia article called "street food" that trends. So they
 * are written once, here, with the spellings the five site languages use.
 *
 * Adding a theme is cheap and safe: a new entry re-tags the whole catalogue on
 * the next alias pass. Aliases must be specific enough not to fire by accident
 * — "art" alone would match everything, "street art" is fine.
 */

import type { Universe } from '../types'

export type ThemeSeed = {
  /** Becomes "topic:<slug>". */
  slug: string
  label: string
  universe: Universe
  /** Spellings in fr, en, de, es, ja. The label itself is added automatically. */
  aliases: string[]
}

export const THEMES: ThemeSeed[] = [
  // ---- vehicles -------------------------------------------------------
  { slug: 'moto', label: 'moto', universe: 'vehicles', aliases: ['motorcycle', 'motorbike', 'motorrad', 'motocicleta', 'バイク', 'オートバイ'] },
  { slug: 'road-trip', label: 'road trip', universe: 'travel', aliases: ['roadtrip', 'voyage en voiture', 'ロードトリップ'] },
  { slug: 'voiture-ancienne', label: 'voiture ancienne', universe: 'vehicles', aliases: ['classic car', 'vintage car', 'oldtimer', 'coche clasico', 'クラシックカー'] },
  { slug: 'camion', label: 'camion', universe: 'vehicles', aliases: ['truck', 'lkw', 'camion', 'トラック'] },
  { slug: 'velo', label: 'vélo', universe: 'vehicles', aliases: ['bicycle', 'cycling', 'fahrrad', 'bicicleta', '自転車'] },
  { slug: 'train', label: 'train', universe: 'vehicles', aliases: ['railway', 'eisenbahn', 'tren', '鉄道', '電車'] },
  { slug: 'avion', label: 'avion', universe: 'vehicles', aliases: ['aircraft', 'airplane', 'flugzeug', 'avion', '飛行機'] },
  { slug: 'bateau', label: 'bateau', universe: 'vehicles', aliases: ['sailing', 'voilier', 'segelboot', 'barco', 'ヨット'] },
  { slug: 'tracteur', label: 'tracteur', universe: 'vehicles', aliases: ['tractor', 'traktor', 'トラクター'] },

  // ---- travel ---------------------------------------------------------
  { slug: 'desert', label: 'désert', universe: 'travel', aliases: ['desert', 'desierto', 'wuste', 'wüste', '砂漠'] },
  { slug: 'montagne', label: 'montagne', universe: 'nature-animals', aliases: ['mountain', 'berg', 'montana', 'montaña', '山'] },
  { slug: 'randonnee', label: 'randonnée', universe: 'travel', aliases: ['hiking', 'trekking', 'wandern', 'senderismo', 'ハイキング'] },
  { slug: 'camping', label: 'camping', universe: 'travel', aliases: ['bivouac', 'campen', 'acampada', 'キャンプ'] },
  { slug: 'plage', label: 'plage', universe: 'travel', aliases: ['beach', 'strand', 'playa', 'ビーチ', '海岸'] },
  { slug: 'ile', label: 'île', universe: 'travel', aliases: ['island', 'insel', 'isla', '島'] },
  { slug: 'metro', label: 'métro', universe: 'travel', aliases: ['subway', 'underground', 'u-bahn', 'metro', '地下鉄'] },
  { slug: 'marche', label: 'marché', universe: 'travel', aliases: ['street market', 'marche de rue', 'markt', 'mercado', '市場'] },

  // ---- food -----------------------------------------------------------
  { slug: 'cuisine-de-rue', label: 'cuisine de rue', universe: 'food', aliases: ['street food', 'streetfood', 'comida callejera', '屋台'] },
  { slug: 'patisserie', label: 'pâtisserie', universe: 'food', aliases: ['pastry', 'baking', 'konditorei', 'reposteria', 'repostería', 'お菓子作り'] },
  { slug: 'pain', label: 'pain', universe: 'food', aliases: ['bread', 'sourdough', 'brot', 'pan casero', 'パン作り'] },
  { slug: 'barbecue', label: 'barbecue', universe: 'food', aliases: ['bbq', 'grillen', 'asado', 'バーベキュー'] },
  { slug: 'pizza', label: 'pizza', universe: 'food', aliases: ['pizzeria', 'ピザ'] },
  { slug: 'ramen', label: 'ramen', universe: 'food', aliases: ['ラーメン'] },
  { slug: 'sushi', label: 'sushi', universe: 'food', aliases: ['寿司', 'すし'] },
  { slug: 'cafe', label: 'café', universe: 'food', aliases: ['coffee', 'barista', 'kaffee', 'コーヒー'] },
  { slug: 'vin', label: 'vin', universe: 'food', aliases: ['wine', 'wein', 'vino', 'ワイン'] },
  { slug: 'fromage', label: 'fromage', universe: 'food', aliases: ['cheese', 'kase', 'käse', 'queso', 'チーズ'] },
  { slug: 'chocolat', label: 'chocolat', universe: 'food', aliases: ['chocolate', 'schokolade', 'チョコレート'] },

  // ---- craft ----------------------------------------------------------
  { slug: 'poterie', label: 'poterie', universe: 'craft', aliases: ['pottery', 'ceramics', 'ceramique', 'céramique', 'topferei', 'töpferei', 'ceramica', '陶芸'] },
  { slug: 'menuiserie', label: 'menuiserie', universe: 'craft', aliases: ['woodworking', 'carpentry', 'holzarbeit', 'carpinteria', 'carpintería', '木工'] },
  { slug: 'tricot', label: 'tricot', universe: 'craft', aliases: ['knitting', 'crochet', 'stricken', 'tejer', '編み物'] },
  { slug: 'couture', label: 'couture', universe: 'craft', aliases: ['sewing', 'nahen', 'nähen', 'costura', '裁縫'] },
  { slug: 'forge', label: 'forge', universe: 'craft', aliases: ['blacksmith', 'forgeron', 'schmieden', 'herreria', 'herrería', '鍛冶'] },
  { slug: 'restauration-objet', label: 'restauration d_objet', universe: 'craft', aliases: ['restoration', 'restauration', 'restaurierung', 'restauracion', '修復'] },
  { slug: 'origami', label: 'origami', universe: 'craft', aliases: ['折り紙'] },
  { slug: 'bricolage', label: 'bricolage', universe: 'craft', aliases: ['diy', 'do it yourself', 'heimwerken', 'hazlo tu mismo', 'diy工作'] },
  { slug: 'jardinage', label: 'jardinage', universe: 'craft', aliases: ['gardening', 'gartnern', 'gärtnern', 'jardineria', 'jardinería', 'ガーデニング'] },

  // ---- art ------------------------------------------------------------
  { slug: 'street-art', label: 'street art', universe: 'art', aliases: ['graffiti', 'art urbain', 'strassenkunst', 'arte urbano', 'ストリートアート'] },
  { slug: 'peinture', label: 'peinture', universe: 'art', aliases: ['painting', 'malerei', 'pintura', '絵画'] },
  { slug: 'sculpture', label: 'sculpture', universe: 'art', aliases: ['skulptur', 'escultura', '彫刻'] },
  { slug: 'photographie', label: 'photographie', universe: 'art', aliases: ['photography', 'fotografie', 'fotografia', 'fotografía', '写真'] },
  { slug: 'tatouage', label: 'tatouage', universe: 'art', aliases: ['tattoo', 'tatowierung', 'tätowierung', 'tatuaje', 'タトゥー'] },
  { slug: 'calligraphie', label: 'calligraphie', universe: 'art', aliases: ['calligraphy', 'kalligrafie', 'caligrafia', '書道'] },

  // ---- music ----------------------------------------------------------
  { slug: 'guitare', label: 'guitare', universe: 'music', aliases: ['guitar', 'gitarre', 'guitarra', 'ギター'] },
  { slug: 'piano', label: 'piano', universe: 'music', aliases: ['klavier', 'ピアノ'] },
  { slug: 'batterie', label: 'batterie', universe: 'music', aliases: ['drums', 'drummer', 'schlagzeug', 'bateria', 'batería', 'ドラム'] },
  { slug: 'chorale', label: 'chorale', universe: 'music', aliases: ['choir', 'chor', 'coro', '合唱'] },
  { slug: 'fanfare', label: 'fanfare', universe: 'music', aliases: ['brass band', 'marching band', 'blaskapelle', 'ブラスバンド'] },
  { slug: 'karaoke', label: 'karaoké', universe: 'music', aliases: ['karaoke', 'カラオケ'] },
  { slug: 'dj', label: 'dj set', universe: 'music', aliases: ['deejay', 'turntable', 'platines', 'dj セット'] },
  { slug: 'opera', label: 'opéra', universe: 'music', aliases: ['opera', 'オペラ'] },
  { slug: 'jazz', label: 'jazz', universe: 'music', aliases: ['ジャズ'] },
  { slug: 'reggae', label: 'reggae', universe: 'music', aliases: ['レゲエ'] },
  { slug: 'metal', label: 'heavy metal', universe: 'music', aliases: ['death metal', 'black metal', 'ヘヴィメタル'] },
  { slug: 'rap', label: 'rap', universe: 'music', aliases: ['hip hop', 'hiphop', 'ラップ'] },
  { slug: 'musique-traditionnelle', label: 'musique traditionnelle', universe: 'music', aliases: ['folk music', 'volksmusik', 'musica tradicional', '民族音楽'] },

  // ---- sport ----------------------------------------------------------
  { slug: 'skate', label: 'skateboard', universe: 'sport', aliases: ['skate', 'skateboarding', 'スケートボード'] },
  { slug: 'surf', label: 'surf', universe: 'sport', aliases: ['surfing', 'サーフィン'] },
  { slug: 'escalade', label: 'escalade', universe: 'sport', aliases: ['climbing', 'bouldering', 'klettern', 'escalada', 'クライミング'] },
  { slug: 'plongee', label: 'plongée', universe: 'sport', aliases: ['diving', 'scuba', 'tauchen', 'buceo', 'ダイビング'] },
  { slug: 'course-a-pied', label: 'course à pied', universe: 'sport', aliases: ['running', 'marathon', 'laufen', 'correr', 'ランニング'] },
  { slug: 'natation', label: 'natation', universe: 'sport', aliases: ['swimming', 'schwimmen', 'natacion', 'natación', '水泳'] },
  { slug: 'boxe', label: 'boxe', universe: 'sport', aliases: ['boxing', 'boxen', 'boxeo', 'ボクシング'] },
  { slug: 'arts-martiaux', label: 'arts martiaux', universe: 'sport', aliases: ['martial arts', 'karate', 'judo', 'kampfsport', 'artes marciales', '武道'] },
  { slug: 'equitation', label: 'équitation', universe: 'sport', aliases: ['horse riding', 'reiten', 'equitacion', 'equitación', '乗馬'] },
  { slug: 'peche', label: 'pêche', universe: 'sport', aliases: ['fishing', 'angeln', 'pesca', '釣り'] },
  { slug: 'parkour', label: 'parkour', universe: 'sport', aliases: ['freerunning', 'パルクール'] },
  { slug: 'danse', label: 'danse', universe: 'sport', aliases: ['dance', 'dancing', 'tanz', 'baile', 'ダンス'] },

  // ---- nature-animals -------------------------------------------------
  { slug: 'chat', label: 'chat', universe: 'nature-animals', aliases: ['cat', 'kitten', 'katze', 'gato', '猫', 'ねこ'] },
  { slug: 'chien', label: 'chien', universe: 'nature-animals', aliases: ['dog', 'puppy', 'hund', 'perro', '犬'] },
  { slug: 'cheval', label: 'cheval', universe: 'nature-animals', aliases: ['horse', 'pferd', 'caballo', '馬'] },
  { slug: 'oiseau', label: 'oiseau', universe: 'nature-animals', aliases: ['bird', 'birdwatching', 'vogel', 'pajaro', 'pájaro', '鳥'] },
  { slug: 'insecte', label: 'insecte', universe: 'nature-animals', aliases: ['insect', 'insekt', 'insecto', '昆虫'] },
  { slug: 'ocean', label: 'océan', universe: 'nature-animals', aliases: ['ocean', 'ozean', 'oceano', 'océano', '海'] },
  { slug: 'foret', label: 'forêt', universe: 'nature-animals', aliases: ['forest', 'wald', 'bosque', '森'] },
  { slug: 'volcan', label: 'volcan', universe: 'nature-animals', aliases: ['volcano', 'vulkan', 'volcan', 'volcán', '火山'] },
  { slug: 'orage', label: 'orage', universe: 'nature-animals', aliases: ['thunderstorm', 'lightning', 'gewitter', 'tormenta', '雷'] },
  { slug: 'aurore-boreale', label: 'aurore boréale', universe: 'nature-animals', aliases: ['northern lights', 'aurora borealis', 'nordlicht', 'オーロラ'] },

  // ---- science / tech -------------------------------------------------
  { slug: 'espace', label: 'espace', universe: 'science', aliases: ['space', 'astronomy', 'astronomie', 'espacio', '宇宙'] },
  { slug: 'chimie', label: 'chimie', universe: 'science', aliases: ['chemistry', 'chemie', 'quimica', 'química', '化学'] },
  { slug: 'mathematiques', label: 'mathématiques', universe: 'science', aliases: ['mathematics', 'maths', 'mathematik', 'matematicas', '数学'] },
  { slug: 'experience-scientifique', label: 'expérience scientifique', universe: 'science', aliases: ['science experiment', 'experiment', 'experimento', '実験'] },
  { slug: 'robotique', label: 'robotique', universe: 'tech', aliases: ['robotics', 'robot', 'roboter', 'robotica', 'ロボット'] },
  { slug: 'informatique-retro', label: 'informatique rétro', universe: 'tech', aliases: ['retro computing', 'commodore', 'amiga', 'ms-dos', 'レトロpc'] },
  { slug: 'electronique', label: 'électronique', universe: 'tech', aliases: ['electronics', 'elektronik', 'electronica', 'electrónica', '電子工作'] },
  { slug: 'impression-3d', label: 'impression 3D', universe: 'tech', aliases: ['3d printing', '3d-druck', 'impresion 3d', '3dプリンター'] },

  // ---- history --------------------------------------------------------
  { slug: 'archeologie', label: 'archéologie', universe: 'history', aliases: ['archaeology', 'archaologie', 'archäologie', 'arqueologia', '考古学'] },
  { slug: 'chateau', label: 'château', universe: 'history', aliases: ['castle', 'schloss', 'castillo', '城'] },
  { slug: 'urbex', label: 'urbex', universe: 'history', aliases: ['lieu abandonne', 'lieu abandonné', 'abandoned place', 'lost place', 'lugar abandonado', '廃墟'] },
  { slug: 'seconde-guerre-mondiale', label: 'seconde guerre mondiale', universe: 'history', aliases: ['world war ii', 'ww2', 'zweiter weltkrieg', 'segunda guerra mundial', '第二次世界大戦'] },
  { slug: 'egypte-ancienne', label: 'Égypte ancienne', universe: 'history', aliases: ['ancient egypt', 'altes agypten', 'antiguo egipto', '古代エジプト'] },

  // ---- gaming / animation ---------------------------------------------
  { slug: 'speedrun', label: 'speedrun', universe: 'gaming', aliases: ['speedrunning', 'any%', 'スピードラン'] },
  { slug: 'jeu-retro', label: 'jeu rétro', universe: 'gaming', aliases: ['retro gaming', 'retrogaming', 'レトロゲーム'] },
  { slug: 'arcade', label: 'arcade', universe: 'gaming', aliases: ['borne d_arcade', 'spielhalle', 'アーケード'] },
  { slug: 'jeu-de-societe', label: 'jeu de société', universe: 'gaming', aliases: ['board game', 'brettspiel', 'juego de mesa', 'ボードゲーム'] },
  { slug: 'animation-image-par-image', label: 'animation image par image', universe: 'animation', aliases: ['stop motion', 'stopmotion', 'claymation', 'ストップモーション'] },

  // ---- events / everyday ----------------------------------------------
  { slug: 'mariage', label: 'mariage', universe: 'events-parties', aliases: ['wedding', 'hochzeit', 'boda', '結婚式'] },
  { slug: 'carnaval', label: 'carnaval', universe: 'events-parties', aliases: ['carnival', 'karneval', '카니발', 'カーニバル'] },
  { slug: 'fete-foraine', label: 'fête foraine', universe: 'events-parties', aliases: ['funfair', 'amusement park', 'jahrmarkt', 'feria', '遊園地'] },
  { slug: 'feu-d-artifice', label: 'feu d_artifice', universe: 'events-parties', aliases: ['fireworks', 'feuerwerk', 'fuegos artificiales', '花火'] },
  { slug: 'manifestation', label: 'manifestation', universe: 'news-society', aliases: ['protest', 'demonstration', 'manifestacion', 'manifestación', 'デモ'] },
  { slug: 'demenagement', label: 'déménagement', universe: 'people-everyday', aliases: ['moving house', 'umzug', 'mudanza', '引っ越し'] },
  { slug: 'coiffure', label: 'coiffure', universe: 'fashion', aliases: ['hairstyle', 'haircut', 'frisur', 'peinado', 'ヘアスタイル'] },
  { slug: 'maquillage', label: 'maquillage', universe: 'fashion', aliases: ['makeup', 'make-up', 'schminke', 'maquillaje', 'メイク'] },
  { slug: 'mode-vintage', label: 'mode vintage', universe: 'fashion', aliases: ['vintage fashion', 'thrift', 'friperie', 'segunda mano', '古着'] },

  // ---- humour ---------------------------------------------------------
  { slug: 'blague-camera-cachee', label: 'caméra cachée', universe: 'humor-memes', aliases: ['hidden camera', 'prank', 'versteckte kamera', 'camara oculta', 'ドッキリ'] },
  { slug: 'fail', label: 'fail', universe: 'humor-memes', aliases: ['bêtisier', 'betisier', 'bloopers', 'panne', 'fracaso', '失敗'] },
  { slug: 'publicite-retro', label: 'publicité rétro', universe: 'humor-memes', aliases: ['retro commercial', 'vintage ad', 'alte werbung', 'anuncio antiguo', '昔のcm'] },
]

/** Fails the build if two themes share a slug. */
export function duplicateThemeSlugs(): string[] {
  const seen = new Set<string>()
  const duplicates: string[] = []
  for (const theme of THEMES) {
    if (seen.has(theme.slug)) duplicates.push(theme.slug)
    seen.add(theme.slug)
  }
  return duplicates
}
