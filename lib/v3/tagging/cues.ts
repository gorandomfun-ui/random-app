/**
 * A universe read from the words of a title and its keywords, for what the
 * dictionaries did not recognise. Fifty-six per cent of the videos sat in
 * "other" while their titles said "gameplay", "recipe", "goal", "concert":
 * the cues put them where they belong, at insert and in a relabelling pass.
 *
 * Whole words of the title only, the most specific universes first:
 * "episode" alone is cinema, but "episode 3 gameplay" is gaming.
 */

import { wordsRegex } from '../cool/registers'
import type { Universe } from '../types'

export const UNIVERSE_CUES: ReadonlyArray<{ universe: Universe; words: string[] }> = [
  { universe: 'gaming', words: ['gameplay', 'walkthrough', 'speedrun', 'speedrunner', 'playthrough', "let's play", 'lets play', 'longplay', 'nintendo', 'playstation', 'ps1', 'ps2', 'ps3', 'ps4', 'ps5', 'xbox', 'sega', 'arcade', 'minecraft', 'fortnite', 'roblox', 'zelda', 'mario', 'pokemon', 'pokémon', 'gta', 'esports', 'esport', 'boss fight', 'retro game', 'retro games', 'retrogaming', 'videogame', 'videogames', 'video game', 'video games', 'jeu vidéo', 'jeux vidéo', 'emulator', 'rom hack', 'romhack', 'no hit', 'any%', 'nes', 'snes', 'n64', 'gamecube', 'dreamcast', 'game boy', 'gameboy', 'steam deck', 'twitch'] },
  { universe: 'sport', words: ['rally car', 'wrc', 'rallye', 'football', 'soccer', 'nba', 'nfl', 'nhl', 'mlb', 'basketball', 'tennis', 'goal', 'goals', 'highlights', 'match', 'marathon', 'olympic', 'olympics', 'olympique', 'skate', 'skateboard', 'skateboarding', 'surf', 'surfing', 'bmx', 'boxing', 'boxe', 'ufc', 'mma', 'wrestling', 'cycling', 'cyclisme', 'tour de france', 'f1', 'formula 1', 'formula one', 'rallye', 'golf', 'cricket', 'rugby', 'ski', 'snowboard', 'climbing', 'escalade', 'parkour', 'gymnastics', 'gymnastique', 'athletics', 'athlétisme', 'swimming', 'natation', 'handball', 'volleyball', 'volley', 'hockey', 'baseball', 'motocross', 'motogp', 'judo', 'karate', 'taekwondo', 'fitness', 'workout', 'crossfit'] },
  { universe: 'food', words: ['recipe', 'recipes', 'recette', 'recettes', 'receta', 'recetas', 'rezept', 'cooking', 'cuisine', 'kitchen', 'street food', 'food', 'restaurant', 'chef', 'baking', 'cake', 'pizza', 'ramen', 'bbq', 'barbecue', 'mukbang', 'dessert', 'pastry', 'pâtisserie', 'sushi', 'burger', 'tacos', 'kebab', 'cocktail', 'cocktails', 'wine', 'vin', 'beer', 'bière', 'coffee', 'café', 'gastronomie', 'gastronomy'] },
  { universe: 'music', words: ['official video', 'official music video', 'official audio', 'lyrics', 'lyric', 'letra', 'feat', 'ft', 'remix', 'concert', 'concerto', 'album', 'song', 'songs', 'chanson', 'chansons', 'canción', 'canciones', 'music', 'musique', 'musica', 'música', 'clip officiel', 'acoustic', 'acoustique', 'dj set', 'dj', 'band', 'orchestra', 'orchestre', 'symphony', 'symphonie', 'rap', 'hip hop', 'hip-hop', 'jazz', 'rock', 'punk', 'metal', 'techno', 'house music', 'disco', 'reggae', 'ska', 'blues', 'soul', 'funk', 'karaoke', 'guitar', 'guitare', 'piano', 'drums', 'batterie', 'violin', 'violon', 'saxophone', 'trumpet', 'trompette', 'accordion', 'accordéon', 'choir', 'chorale', 'opera', 'opéra', 'singer', 'chanteur', 'chanteuse', 'rapper', 'rappeur', 'mixtape', 'unplugged', 'live session', 'session live', 'tiny desk', 'music video', 'gig', 'setlist', 'tour 20', 'k-pop', 'kpop', 'j-pop', 'jpop', 'afrobeats', 'reggaeton', 'cumbia', 'salsa', 'bachata', 'flamenco', 'fado', 'chanson française'] },
  { universe: 'events-parties', words: ['birthday party', 'house party', 'pool party', 'dance party', 'street party', 'block party', 'soirée', 'fiesta', 'rave', 'nightclub', 'night club', 'clubbing', 'nightlife', 'carnival', 'carnaval', 'wedding', 'mariage', 'boda', 'hochzeit', 'celebration', 'new year', 'nouvel an', 'parade', 'défilé', 'bal', 'prom', 'birthday party', 'anniversaire', 'fête', 'fete'] },
  { universe: 'humor-memes', words: ['funny', 'fail', 'fails', 'prank', 'pranks', 'comedy', 'comédie', 'sketch', 'sketches', 'parody', 'parodie', 'meme', 'memes', 'lol', 'hilarious', 'joke', 'jokes', 'blooper', 'bloopers', 'stand-up', 'standup', 'stand up', 'humour', 'humor', 'drôle', 'blague', 'blagues', 'gag', 'gags', 'caméra cachée', 'hidden camera', 'try not to laugh'] },
  { universe: 'nature-animals', words: ['cat', 'cats', 'kitten', 'kittens', 'dog', 'dogs', 'chien', 'chiens', 'puppy', 'puppies', 'animal', 'animals', 'animaux', 'wildlife', 'nature', 'bird', 'birds', 'oiseau', 'oiseaux', 'fish', 'aquarium', 'zoo', 'pet', 'pets', 'horse', 'horses', 'cheval', 'shark', 'whale', 'dolphin', 'elephant', 'lion', 'tiger', 'safari', 'jungle', 'forest', 'forêt', 'volcano', 'volcan', 'storm', 'tempête', 'tornado', 'hurricane'] },
  { universe: 'craft', words: ['diy', 'handmade', 'fait main', 'woodworking', 'menuiserie', 'pottery', 'poterie', 'ceramic', 'ceramics', 'céramique', 'knitting', 'tricot', 'crochet', 'sewing', 'couture', 'embroidery', 'broderie', 'weaving', 'tissage', 'restoration', 'restauration', 'blacksmith', 'forge', 'leather', 'cuir', 'carpentry', 'workshop', 'atelier', 'origami', 'calligraphy', 'calligraphie', 'lego'] },
  { universe: 'vehicles', words: ['car', 'cars', 'voiture', 'voitures', 'motorcycle', 'moto', 'motorbike', 'truck', 'camion', 'trains', 'locomotive', 'aircraft', 'airplane', 'avion', 'boat', 'bateau', 'ship', 'yacht', 'supercar', 'ferrari', 'porsche', 'lamborghini', 'tesla', 'bmw', 'mercedes', 'audi', 'toyota', 'honda', 'harley', 'ducati', 'tractor', 'tracteur', 'bus', 'tram', 'metro', 'subway'] },
  { universe: 'fashion', words: ['fashion', 'runway', 'fashion week', 'haute couture', 'outfit', 'outfits', 'lookbook', 'makeup', 'maquillage', 'beauté', 'hairstyle', 'coiffure', 'sneakers', 'streetwear', 'vintage clothing', 'dior', 'chanel', 'gucci', 'prada', 'vogue'] },
  { universe: 'science', words: ['science', 'scientist', 'physics', 'physique', 'chemistry', 'chimie', 'biology', 'biologie', 'astronomy', 'astronomie', 'nasa', 'rocket', 'fusée', 'experiment', 'expérience', 'laboratory', 'laboratoire', 'mathematics', 'maths', 'planet', 'planète', 'telescope', 'microscope'] },
  { universe: 'tech', words: ['tech', 'technology', 'technologie', 'computer', 'ordinateur', 'software', 'logiciel', 'programming', 'programmation', 'coding', 'robot', 'robots', 'robotics', 'robotique', 'iphone', 'android', 'smartphone', 'gadget', 'gadgets', 'drone', 'drones', 'artificial intelligence', 'intelligence artificielle', 'vr', 'virtual reality', 'linux', 'macbook', 'keyboard', 'mechanical keyboard', 'retro computing', 'commodore', 'amiga'] },
  { universe: 'history', words: ['history', 'histoire', 'historical', 'historique', 'ww2', 'wwii', 'ww1', 'world war', 'guerre mondiale', 'medieval', 'médiéval', 'ancient', 'antique', 'archaeology', 'archéologie', 'civilization', 'civilisation', 'dynasty', 'dynastie', 'pharaoh', 'pharaon', 'viking', 'vikings', 'samurai', 'samouraï', 'documentary', 'documentaire', 'archive footage', 'newsreel'] },
  { universe: 'art', words: ['painting', 'peinture', 'painter', 'peintre', 'sculpture', 'sculpteur', 'drawing', 'dessin', 'illustration', 'gallery', 'galerie', 'museum', 'musée', 'exhibition', 'exposition', 'street art', 'graffiti', 'mural', 'fresque', 'photography', 'photographie', 'photographer', 'photographe', 'architecture', 'architect', 'architecte', 'performance art', 'timelapse painting'] },
  { universe: 'animation', words: ['animation', 'animated', 'animé', 'anime', 'cartoon', 'cartoons', 'dessin animé', 'manga', 'stop motion', 'stop-motion', 'claymation', 'pixar', 'ghibli', 'disney', 'looney tunes', 'cgi', '3d animation', 'short film animation'] },
  { universe: 'travel', words: ['travel', 'voyage', 'trip', 'road trip', 'vlog', 'explore', 'exploring', 'abandoned', 'abandonné', 'walking tour', 'city walk', 'walk in', 'drive in', 'driving in', 'hiking', 'randonnée', 'island', 'île', 'mountain', 'montagne', 'beach', 'plage', 'desert', 'désert', 'village', 'countryside', 'campagne', 'street view', 'streets of', 'rues de', 'temple', 'castle', 'château', 'cathedral', 'cathédrale', 'tourism', 'tourisme', 'backpacking', 'expedition', 'expédition', 'camping', 'van life'] },
  { universe: 'cinema-tv', words: ['trailer', 'bande-annonce', 'bande annonce', 'teaser', 'episode', 'épisode', 'episodio', 'full movie', 'film', 'films', 'movie', 'movies', 'series', 'série', 'séries', 'serie', 'season', 'saison', 'temporada', 'tv show', 'tv series', 'sitcom', 'scene', 'scène', 'clip from', 'behind the scenes', 'making of', 'actor', 'actress', 'acteur', 'actrice', 'hollywood', 'bollywood', 'nollywood', 'netflix', 'hbo', 'oscars', 'cannes', 'télé', 'tv'] },
]

const MATCHERS = UNIVERSE_CUES.map((entry) => ({ universe: entry.universe, regex: wordsRegex(entry.words) }))

/** The first universe whose words appear in the text; null when none does. */
export function universeFromCues(text: string | null | undefined): Universe | null {
  const haystack = (text ?? '').trim()
  if (!haystack) return null
  for (const { universe, regex } of MATCHERS) if (regex.test(haystack)) return universe
  return null
}

/**
 * The text the cues read on a row: the title, and nothing else. Keywords and
 * tags were tried and filed a camcorder review under parties and a rant
 * under animation: a provider's tags say what the uploader hoped for.
 */
export function cueText(row: { title?: string | null; keywords?: unknown; tags?: unknown }): string {
  return row.title ?? ''
}
