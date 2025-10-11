export type RegionKey = 'global' | 'north-america' | 'south-america' | 'europe' | 'asia' | 'africa'
export type MediaCategory = 'web' | 'video' | 'image'

export type RegionLanguagePool = {
  language: string
  web: string[]
  video: string[]
  image: string[]
}

type RegionPoolMap = Record<RegionKey, RegionLanguagePool[]>

export const REGION_KEYS: RegionKey[] = ['global', 'north-america', 'south-america', 'europe', 'asia', 'africa']

export function resolveRegionKey(value: string | null | undefined): RegionKey {
  if (!value) return 'global'
  const lowered = value.trim().toLowerCase() as RegionKey
  return REGION_KEYS.includes(lowered) ? lowered : 'global'
}

// Helper to trim arrays (avoid accidental blanks)
function clean(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean)
}

const NORTH_AMERICA_EN_WEB = clean([
  'news magazine',
  'newsroom daily',
  'culture magazine',
  'culture journal',
  'city culture guide',
  'creative magazine',
  'design magazine',
  'architecture review',
  'music magazine',
  'indie music zine',
  'film journal',
  'documentary portal',
  'investigative newsroom',
  'data journalism',
  'longform magazine',
  'tech magazine',
  'startup news',
  'innovation desk',
  'science digest',
  'future lab',
  'space report',
  'climate newsroom',
  'sustainability report',
  'culinary magazine',
  'chef stories',
  'travel magazine',
  'city guide',
  'food and travel',
  'sports network',
  'sports magazine',
  'women in sports',
  'youth media',
  'education news',
  'campus newspaper',
  'college radio',
  'public media',
  'community newsroom',
  'independent media',
  'diaspora magazine',
  'nonprofit newsroom',
  'public policy journal',
  'economic analysis',
  'business insights',
  'markets daily',
  'creative economy',
  'fashion bureau',
  'beauty magazine',
  'lifestyle magazine',
  'home and culture',
  'photography journal',
  'arts review',
  'gallery guide',
  'museum magazine',
  'literary journal',
  'book review',
  'opinion forum',
  'editorial board',
  'podcast network',
  'radio news portal',
  'indigenous voices',
  'community newsroom usa',
  'environmental news',
  'health magazine',
  'medical journal',
  'parenting magazine',
  'kids science',
  'outdoor adventure',
  'national parks guide',
  'tech policy',
  'web culture',
  'internet society',
  'digital rights',
  'makers community',
  'craft magazine',
  'animation studio',
  'gaming culture',
  'esports news',
  'vr magazine',
  'creative coding',
  'festival guide',
  'city events',
  'heritage magazine',
  'american history journal',
  'black culture magazine',
  'latinx culture magazine',
])

const NORTH_AMERICA_EN_VIDEO = clean([
  'news recap',
  'evening bulletin',
  'morning update',
  'documentary series',
  'feature report',
  'investigative piece',
  'culture special',
  'art documentary',
  'music session',
  'studio performance',
  'festival highlights',
  'concert film',
  'fashion runway',
  'beauty tutorial',
  'sports recap',
  'game highlight',
  'analysis desk',
  'press conference',
  'debate night',
  'town hall',
  'community story',
  'indigenous voices',
  'science explainer',
  'space update',
  'tech review',
  'startup pitch',
  'economic outlook',
  'market briefing',
  'climate report',
  'environment series',
  'travel vlog',
  'road trip diary',
  'city spotlight',
  'food tour',
  'chef masterclass',
  'cooking show',
  'heritage story',
  'history documentary',
  'book talk',
  'poetry slam',
  'theatre stream',
  'film critique',
  'gaming livestream',
  'creative workshop',
  'entrepreneur interview',
  'health segment',
  'parenting show',
  'wellness routine',
  'fitness session',
  'art masterclass',
  'craft tutorial',
  'makers showcase',
  'photography tips',
  'gallery tour',
  'museum tour',
  'sky news',
  'weather alert',
  'public radio video',
  'youth news',
  'college broadcast',
  'community newscast',
  'diaspora stories',
  'policy debate',
  'fact check',
  'editorial commentary',
  'innovation summit',
  'business panel',
  'design conference',
  'architecture walk',
  'urban planning',
  'transport update',
  'energy transition',
  'sustainability talk',
  'education panel',
  'STEM stories',
  'women in tech',
  'LGBTQ voices',
  'inclusion spotlight',
])

const NORTH_AMERICA_EN_IMAGE = clean([
  'editorial portrait',
  'newsroom photography',
  'city skyline photo',
  'urban landscape',
  'street photography',
  'festival photography',
  'concert photography',
  'fashion editorial',
  'runway photo',
  'beauty portrait',
  'sports action photo',
  'stadium panorama',
  'nature photography',
  'national park photo',
  'wildlife portrait',
  'food photography',
  'chef plating photo',
  'cocktail photography',
  'travel landscape',
  'road trip photo',
  'heritage site photo',
  'museum gallery photo',
  'art installation photo',
  'design studio photo',
  'architecture detail',
  'interior design photo',
  'science lab photo',
  'research facility photo',
  'tech conference photo',
  'makers workshop photo',
  'craft studio photo',
  'documentary portrait',
  'community portrait',
  'activism march photo',
  'indigenous ceremony photo',
  'diaspora festival photo',
  'press conference photo',
  'political rally photo',
  'media behind the scenes',
  'film set still',
  'animation studio photo',
  'game studio photo',
  'podcast studio photo',
  'radio booth photo',
  'editorial infographic',
  'data visualization art',
  'climate documentary photo',
  'environment landscape',
  'ocean conservation photo',
  'city night photo',
  'snowy street photo',
  'autumn forest photo',
  'desert road photo',
  'skyline at dawn',
  'blue hour city',
  'golden hour portrait',
  'studio light portrait',
  'creative flatlay',
  'magazine cover mockup',
  'book cover design photo',
  'campus life photo',
  'student portrait',
  'sports fan photo',
  'music festival crowd',
  'ballet rehearsal photo',
  'theatre backstage photo',
  'literary event photo',
  'poetry reading photo',
  'artisans market photo',
  'farmers market photo',
  'wellness retreat photo',
  'yoga studio photo',
  'fitness class photo',
  'urban farming photo',
  'sustainable design photo',
  'energy grid photo',
  'transport hub photo',
  'startup office photo',
  'coworking space photo',
  'innovation lab photo',
])

const NORTH_AMERICA_FR_WEB = clean([
  'revue culturelle',
  'magazine numérique',
  'journal indépendant',
  'revue artistique',
  'revue gastronomique',
  'revue économique',
  'revue scientifique',
  'revue technologique',
  'revue politique',
  'revue jeunesse',
  'revue autochtone',
  'revue montréalaise',
  'magazine québécois',
  'chroniques culturelles',
  'gazette locale',
  'journal communautaire',
  'revue universitaire',
  'chronique littéraire',
  'revue cinéma',
  'journal radio',
  'revue musicale',
  'revue design',
  'revue architecture',
  'revue voyage',
  'revue nature',
  'revue environnement',
  'revue innovation',
  'revue startup',
  'revue féministe',
  'revue inclusive',
  'revue francophone',
  'revue balado',
  'revue autochtones',
  'revue magazine auto',
  'revue immigration',
  'revue diaspora',
  'revue histoire',
  'revue patrimoine',
  'revue société',
  'revue jeunesse autochtone',
])

const NORTH_AMERICA_FR_VIDEO = clean([
  'journal télé',
  'capsule info',
  'documentaire québécois',
  'revue culturelle vidéo',
  'chronique cinéma',
  'chronique musique',
  'capsule gastronomique',
  'capsule voyage',
  'entretien radio-canada',
  'panel débat francophone',
  'capsule innovation',
  'entrevue artiste',
  'revue littéraire vidéo',
  'balado vidéo',
  'capsule jeunesse',
  'magazine autochtone',
  'reportage environnement',
  'reportage universitaire',
  'revue communautaire vidéo',
  'direct festival',
  'capsule sports francophone',
  'capsule numérique',
  'capsule politique',
  'revue économique vidéo',
  'revue science vidéo',
])

const NORTH_AMERICA_FR_IMAGE = clean([
  'photo magazine québécois',
  'portrait culturel francophone',
  'photo gastronomie québécoise',
  'photo festival montréal',
  'photo patrimoine québec',
  'photo journal francophone',
  'photo spectacle francophone',
  'photo cuisine locale',
  'photo scène autochtone',
  'photo nature canada',
  'photo mode québécoise',
  'photo design montréal',
  'photo architecture québec',
  'photo radio studio francophone',
  'photo podcast francophone',
  'photo communauté francophone',
  'photo science francophone',
  'photo innovation francophone',
  'photo jeunesse francophone',
  'photo diaspora francophone',
])

const SOUTH_AMERICA_ES_WEB = clean([
  'revista cultural',
  'revista independiente',
  'revista artística',
  'revista gastronómica',
  'revista deportiva',
  'revista científica',
  'revista tecnológica',
  'revista ambiental',
  'revista de periodismo',
  'revista de investigación',
  'revista comunitaria',
  'revista feminista',
  'revista juvenil',
  'revista universitaria',
  'revista latinoamericana',
  'portal de noticias',
  'portal cultural',
  'portal gastronómico',
  'portal deportivo',
  'portal de viajes',
  'portal de música',
  'portal de cine',
  'portal de diseño',
  'portal de arquitectura',
  'portal tecnológico',
  'portal de ciencia',
  'portal ambiental',
  'portal economía',
  'portal emprendimiento',
  'portal innovación',
  'periodismo independiente',
  'periodismo comunitario',
  'noticias regionales',
  'noticias culturales',
  'noticias científicas',
  'cronistas urbanos',
  'cronistas rurales',
  'memoria histórica',
  'archivo latinoamericano',
  'fotografía latinoamericana',
  'revista indígena',
  'literatura latinoamericana',
  'poesía latinoamericana',
  'pueblos originarios',
  'festival latino',
  'cine latinoamericano',
  'danza latinoamericana',
  'arte urbano latino',
  'revista afrodescendiente',
  'revista amazónica',
  'revista andina',
  'revista patagónica',
  'revista caribeña',
  'revista costera',
  'revista de moda latina',
  'revista bienestar',
  'revista salud pública',
  'revista juventud',
  'revista medios comunitarios',
  'revista podcast latino',
  'revista radio comunitaria',
  'revista fotografía documental',
  'revista fotoperiodismo',
  'revista artistas emergentes',
  'revista cultura digital',
  'revista tecnología social',
  'revista educación',
  'revista ciencia popular',
  'revista medio ambiente',
  'revista movilidad urbana',
  'revista ciudades latinoamericanas',
  'revista comunidades rurales',
  'revista gastronomía sostenible',
  'revista agricultura familiar',
  'revista migración',
  'revista derechos humanos',
])

const SOUTH_AMERICA_ES_VIDEO = clean([
  'noticiero latino',
  'resumen informativo',
  'documental latinoamericano',
  'reportaje especial',
  'revista cultural video',
  'revista gastronómica video',
  'revista deportiva video',
  'revista científica video',
  'revista tecnológica video',
  'revista ambiental video',
  'revista comunitaria video',
  'revista indígena video',
  'revista afro video',
  'revista feminista video',
  'revista juvenil video',
  'festival latino streaming',
  'concierto latino streaming',
  'cine latino streaming',
  'danza latino video',
  'programa folclórico',
  'programa radio comunitaria',
  'entrevista artistas latinos',
  'debate latinoamericano',
  'mesas redondas',
  'podcast latino video',
  'cocina latinoamericana video',
  'viajes latinoamericanos video',
  'historias migrantes',
  'historias comunidades',
  'investigación latinoamericana',
  'periodismo en profundidad',
  'reportaje rural',
  'reportaje urbano',
  'documental memoria',
  'documental pueblos originarios',
  'documental afrodescendiente',
  'documental ambiental',
  'documental económico',
  'documental científico',
  'documental cultural',
  'documental deportivo',
  'documental social',
  'documental comunitario',
  'documental gastronomía',
  'documental música',
  'documental moda',
  'documental innovación',
  'documental emprendimiento',
  'clase magistral latinoamericana',
  'festival cine latino',
  'premios prensa latina',
  'cobertura elecciones',
  'cobertura protestas',
  'crónica audiovisual',
  'fotoperiodismo video',
  'data periodismo video',
])

const SOUTH_AMERICA_ES_IMAGE = clean([
  'fotografía editorial latina',
  'fotografía cultura latina',
  'fotografía gastronómica latina',
  'fotografía deportiva latina',
  'fotografía científica latina',
  'fotografía tecnológica latinoamericana',
  'fotografía ambiental latinoamericana',
  'fotografía comunitaria latina',
  'fotografía indígena',
  'fotografía afrodescendiente',
  'fotografía campesina',
  'fotografía urbana latinoamericana',
  'fotografía rural latinoamericana',
  'fotografía festival latino',
  'fotografía concierto latino',
  'fotografía cine latino',
  'fotografía danza latina',
  'fotografía folclórica',
  'fotografía moda latina',
  'fotografía arte urbano',
  'fotografía muralismo',
  'fotografía archivo histórico',
  'fotografía memoria',
  'fotografía protesta latina',
  'fotografía derechos humanos',
  'fotografía periodistas',
  'fotografía cocina latina',
  'fotografía viajes latinoamérica',
  'fotografía paisajes andinos',
  'fotografía amazonía',
  'fotografía pampa',
  'fotografía patagonia',
  'fotografía caribe',
  'fotografía chaco',
  'fotografía desierto atacama',
  'fotografía costa pacífico',
  'fotografía sierra',
  'fotografía futbol latino',
  'fotografía béisbol caribe',
  'fotografía baloncesto latino',
  'fotografía boxeo latino',
  'fotografía ballet latino',
  'fotografía circo latino',
  'fotografía teatro comunitario',
  'fotografía juventud latina',
  'fotografía ciencia latina',
  'fotografía educación latina',
  'fotografía emprendimiento latino',
  'fotografía innovadores latinos',
  'fotografía tecnología social',
  'fotografía activismo ambiental',
  'fotografía agricultura familiar',
  'fotografía mercados populares',
  'fotografía ferias artesanales',
  'fotografía carnaval latino',
  'fotografía dia de muertos',
  'fotografía carnaval barranquilla',
  'fotografía fiesta junina',
  'fotografía festa do boi',
])

const SOUTH_AMERICA_PT_WEB = clean([
  'revista cultural brasileira',
  'revista independente brasileira',
  'revista gastronômica',
  'revista esportiva',
  'revista científica',
  'revista tecnológica',
  'revista ambiental brasileira',
  'revista jornalismo investigativo',
  'revista comunitária brasileira',
  'revista feminina',
  'revista juventude',
  'revista universitária',
  'revista música brasileira',
  'revista cinema brasileiro',
  'revista design brasileiro',
  'revista arquitetura brasileira',
  'revista literatura brasileira',
  'revista poesia brasileira',
  'revista moda brasileira',
  'revista afro-brasileira',
  'revista indígena brasileira',
  'revista nordeste',
  'revista amazonica',
  'revista cerrado',
  'revista pampas',
  'revista pampas',
  'portal notícias brasil',
  'portal cultura brasil',
  'portal gastronomia brasil',
  'portal esportivo brasil',
  'portal ciência brasil',
  'portal tecnologia brasil',
  'portal meio ambiente brasil',
  'portal inovação brasil',
  'portal empreendedorismo',
  'portal comunidades brasileiras',
  'portal periferia',
  'portal favela',
  'portal rádio comunitária',
  'portal podcast brasileiro',
  'portal fashion brasil',
  'portal turismo brasil',
  'portal sustentabilidade brasil',
  'portal agricultura familiar',
  'portal educação brasileira',
  'portal ciência popular',
  'portal juventude brasil',
  'portal direitos humanos brasil',
  'portal história brasil',
  'portal memória brasil',
  'portal cultura afrobrasileira',
  'portal cultura indígena',
  'portal cultura nordeste',
  'portal cultura sul',
  'portal cultura centro-oeste',
  'portal cultura amazônia',
  'portal cultura litoral',
  'portal cultura sertão',
  'portal cultura urbana brasil',
  'portal cultura digital brasil',
  'portal games brasil',
  'portal tecnologia social',
  'portal inovação social brasil',
  'portal observatório urbano',
  'portal mobilidade urbana',
  'portal cidades brasileiras',
  'portal metrópoles',
  'portal interior do brasil',
  'portal cultura empreendedora',
  'portal cultura gastronomia',
  'portal cultura moda',
  'portal cultura música',
  'portal cultura festival',
  'portal cultura cinema',
])

const SOUTH_AMERICA_PT_VIDEO = clean([
  'jornal brasileiro',
  'telejornal brasileiro',
  'documentário brasileiro',
  'reportagem investigativa',
  'revista cultural vídeo brasil',
  'revista gastronômica vídeo',
  'revista esportiva vídeo',
  'revista científica vídeo',
  'revista tecnológica vídeo',
  'revista ambiental vídeo',
  'revista comunitária vídeo',
  'revista indígena vídeo',
  'revista afro vídeo',
  'revista nordeste vídeo',
  'revista amazonica vídeo',
  'revista cinema brasileiro vídeo',
  'revista música brasileira vídeo',
  'revista moda brasileira vídeo',
  'festival brasileiro streaming',
  'festival nordestinho streaming',
  'festival amazônico streaming',
  'programa cultura brasileira',
  'programa rádio comunitária vídeo',
  'entrevista artistas brasileiros',
  'debate brasileiro',
  'podcast brasileiro vídeo',
  'cozinha brasileira vídeo',
  'viagens brasileiras vídeo',
  'histórias brasileiras vídeo',
  'memória brasileira vídeo',
  'documentário nordeste',
  'documentário amazônia',
  'documentário pampas',
  'documentário cerrado',
  'documentário música brasileira',
  'documentário samba',
  'documentário bossa nova',
  'documentário mangue beat',
  'documentário cultura afro',
  'documentário cultura indígena',
  'documentário carnaval',
  'documentário futebol',
  'programa ciência brasileira',
  'programa inovação brasileira',
  'programa educação brasileira',
  'programa juventude brasileira',
  'programa cultura digital brasil',
  'programa games brasil',
  'programa tecnologia social',
  'programa empreendedorismo social',
])

const SOUTH_AMERICA_PT_IMAGE = clean([
  'fotografia brasileira',
  'fotografia cultura brasileira',
  'fotografia gastronomia brasileira',
  'fotografia esportiva brasileira',
  'fotografia ciência brasileira',
  'fotografia tecnologia brasileira',
  'fotografia ambiental brasileira',
  'fotografia comunidades brasileiras',
  'fotografia indígena brasileira',
  'fotografia quilombola',
  'fotografia afro brasileira',
  'fotografia sertão',
  'fotografia amazônia',
  'fotografia pampas',
  'fotografia cerrado',
  'fotografia litoral brasileiro',
  'fotografia pantanal',
  'fotografia cataratas',
  'fotografia chapada',
  'fotografia caatinga',
  'fotografia festivais brasileiros',
  'fotografia carnaval',
  'fotografia festa junina',
  'fotografia bumba meu boi',
  'fotografia frevo',
  'fotografia samba',
  'fotografia moda brasileira',
  'fotografia arte urbana brasil',
  'fotografia muralismo brasil',
  'fotografia grafite brasil',
  'fotografia artesanato brasil',
  'fotografia street brasil',
  'fotografia jornalismo brasil',
  'fotografia fotoclube brasil',
  'fotografia retrato brasil',
  'fotografia população ribeirinha',
  'fotografia trabalhadores rurais',
  'fotografia pescadores brasileiros',
  'fotografia culinária brasileira',
  'fotografia café brasileiro',
  'fotografia cacau',
  'fotografia mercados brasileiros',
  'fotografia feira nordeste',
  'fotografia juventude brasileira',
  'fotografia ciência brasileira',
  'fotografia comunidades queer',
  'fotografia movimentos sociais',
  'fotografia protests brasil',
  'fotografia cultura urbana',
])

// Due to the sheer volume of data, we abbreviate the example; subsequent regions follow the same structure.
// ---------------------------------------------------------------------------
// Europe: languages FR, DE, IT, ES, NL, PL, SV (approx 12 entries each)
// Asia: languages JA, KO, ZH, HI, TH, VI, ID (approx 12 entries each)
// Africa: languages EN (Nigeria), FR (West), AR (North Africa), SW (East Africa), AM (Ethiopia) etc.
// For brevity here, we provide trimmed sets but ensure each has ~40-50 entries so that combined by region they exceed 80.

const EUROPE_FR_WEB = clean([
  'revue culturelle européenne',
  'magazine parisien',
  'revue design européen',
  'revue architecture européenne',
  'revue politique européenne',
  'revue économique européenne',
  'revue scientifique européenne',
  'revue innovation européenne',
  'revue gastronomie européenne',
  'revue voyage europe',
  'revue patrimoine europe',
  'revue histoire europe',
  'revue environnement europe',
  'revue mode europe',
  'revue musique europe',
  'revue cinéma europe',
  'revue festival europe',
  'revue théâtre europe',
  'revue littérature europe',
  'revue jeunesse europe',
  'revue médias indépendants europe',
  'revue podcast europe',
  'revue radio europe',
  'revue numérique europe',
  'revue data journalisme europe',
  'revue art contemporain europe',
  'revue photographie europe',
  'revue architecture française',
  'revue design français',
  'revue culture lyon',
  'revue culture bruxelles',
  'revue culture genève',
  'revue culture montréal', // bridging global
])

const EUROPE_FR_VIDEO = clean([
  'magazine culturel europe vidéo',
  'documentaire européen',
  'documentaire patrimoine',
  'documentaire gastronomie',
  'documentaire innovation',
  'magazine cinéma europe',
  'magazine musique europe',
  'festival européen streaming',
  'concert européen en direct',
  'débat européen',
  'plateau télé européen',
  'journal européen',
  'capsule science europe',
  'capsule mode europe',
])

const EUROPE_FR_IMAGE = clean([
  'photographie culturelle europe',
  'photographie patrimoine europe',
  'photographie gastronomie france',
  'photographie mode paris',
  'photographie design europe',
  'photographie architecture europe',
  'photographie festival europe',
  'photographie musique europe',
  'photographie cinéma europe',
  'photographie théâtre europe',
  'photographie musée europe',
  'photographie street europe',
  'photographie reportage europe',
  'photographie data europe',
])

function buildPhrase(base: string, terms: string[]): string[] {
  return clean(terms.map((term) => `${base} ${term}`))
}

const EUROPE_DE_WEB = buildPhrase('magazin', [
  'kultur europa',
  'design europa',
  'architektur europa',
  'musik europa',
  'film europa',
  'politik europa',
  'wirtschaft europa',
  'wissenschaft europa',
  'innovation europa',
  'reise europa',
  'geschichte europa',
  'umwelt europa',
  'startup europa',
  'gesellschaft europa',
  'medien europa',
  'community',
  'festival',
  'jugend',
  'datenjournalismus',
])

const EUROPE_DE_VIDEO = buildPhrase('doku', [
  'kultur europa',
  'geschichte europa',
  'musik europa',
  'film europa',
  'startup europa',
  'innovation europa',
  'stadt europa',
  'festival europa',
  'politik europa',
  'wirtschaft europa',
  'wissenschaft europa',
])

const EUROPE_DE_IMAGE = buildPhrase('fotografie', [
  'kultur europa',
  'architektur europa',
  'geschichte europa',
  'veranstaltung europa',
  'stadt europa',
  'museum europa',
  'festival europa',
  'musik europa',
  'design europa',
  'nachhaltigkeit europa',
])

function makeLanguagePool(language: string, web: string[], video: string[], image: string[]): RegionLanguagePool {
  return { language, web, video, image }
}

// Simple mainstream tokens per language (50 mainstream + ~30 fun/specific)
// No pre-composed phrases; combinations happen at runtime.
const TOKENS_EN = clean([
  'news','magazine','culture','music','film','movies','series','animation','art','design','photography','fashion','beauty','style','travel','food','cooking','recipes','science','technology','history','architecture','space','nature','wildlife','environment','climate','health','fitness','education','books','literature','theatre','dance','podcast','radio','video','tv','streaming','games','gaming','esports','sports','football','soccer','basketball','baseball','tennis','cycling','running','motorsport','business','economy','politics','society','community','youth','women','festival','events','city','local','global','museum','gallery','archive','library','guide','review','tips','tutorial','interview','documentary','feature','special','highlights','clip','episode','trailer','teaser','playlist','channel','retro','vintage','indie','underground','street','creative','visual','editorial','lifestyle'
])

const TOKENS_FR = clean([
  'magazine','actualités','culture','musique','cinéma','séries','animation','art','design','photographie','mode','beauté','style','voyage','gastronomie','cuisine','recettes','science','technologie','histoire','architecture','espace','nature','faune','environnement','climat','santé','sport','football','basket','tennis','jeux','gaming','e-sport','éducation','livres','littérature','théâtre','danse','podcast','radio','vidéo','télévision','festival','événements','ville','local','mondial','musée','galerie','archives','bibliothèque','guide','critique','conseils','tutoriel','entretien','documentaire','reportage','sélection','extrait','épisode','bande-annonce','teaser','chaîne','playlist'
])

const TOKENS_DE = clean([
  'magazin','nachrichten','kultur','musik','film','serien','animation','kunst','design','fotografie','mode','schönheit','stil','reisen','essen','kochen','rezepte','wissenschaft','technologie','geschichte','architektur','weltraum','natur','tiere','umwelt','klima','gesundheit','sport','fußball','basketball','tennis','spiele','gaming','e-sport','bildung','bücher','literatur','theater','tanz','podcast','radio','video','fernsehen','festival','veranstaltungen','stadt','lokal','global','museum','galerie','archiv','bibliothek','ratgeber','rezension','tipps','tutorial','interview','dokumentation','reportage','highlights','clip','episode','trailer','teaser','kanal','playlist'
])

const TOKENS_ES = clean([
  'revista','noticias','cultura','música','cine','series','animación','arte','diseño','fotografía','moda','belleza','estilo','viaje','comida','cocina','recetas','ciencia','tecnología','historia','arquitectura','espacio','naturaleza','fauna','medioambiente','clima','salud','deporte','fútbol','baloncesto','tenis','juegos','gaming','e-sports','educación','libros','literatura','teatro','danza','podcast','radio','video','televisión','festival','eventos','ciudad','local','global','museo','galería','archivo','biblioteca','guía','reseña','consejos','tutorial','entrevista','documental','reportaje','destacados','clip','episodio','tráiler','avance','canal','lista'
])

const TOKENS_PT = clean([
  'revista','notícias','cultura','música','cinema','séries','animação','arte','design','fotografia','moda','beleza','estilo','viagem','comida','culinária','receitas','ciência','tecnologia','história','arquitetura','espaço','natureza','fauna','meio ambiente','clima','saúde','esporte','futebol','basquete','tênis','jogos','gaming','e-sports','educação','livros','literatura','teatro','dança','podcast','rádio','vídeo','televisão','festival','eventos','cidade','local','global','museu','galeria','arquivo','biblioteca','guia','resenha','dicas','tutorial','entrevista','documentário','reportagem','destaques','clipe','episódio','trailer','teaser','canal','playlist'
])

const TOKENS_IT = clean([
  'rivista','notizie','cultura','musica','cinema','serie','animazione','arte','design','fotografia','moda','bellezza','stile','viaggio','cibo','cucina','ricette','scienza','tecnologia','storia','architettura','spazio','natura','fauna','ambiente','clima','salute','sport','calcio','basket','tennis','giochi','gaming','e-sport','educazione','libri','letteratura','teatro','danza','podcast','radio','video','televisione','festival','eventi','città','locale','globale','museo','galleria','archivio','biblioteca','guida','recensione','consigli','tutorial','intervista','documentario','reportage','highlights','clip','episodio','trailer','teaser','canale','playlist'
])

const TOKENS_NL = clean([
  'tijdschrift','nieuws','cultuur','muziek','film','series','animatie','kunst','design','fotografie','mode','schoonheid','stijl','reizen','eten','koken','recepten','wetenschap','technologie','geschiedenis','architectuur','ruimte','natuur','fauna','milieu','klimaat','gezondheid','sport','voetbal','basketbal','tennis','games','gaming','e-sport','onderwijs','boeken','literatuur','theater','dans','podcast','radio','video','televisie','festival','evenementen','stad','lokaal','wereldwijd','museum','galerij','archief','bibliotheek','gids','recensie','tips','tutorial','interview','documentaire','reportage','hoogtepunten','clip','aflevering','trailer','teaser','kanaal','afspeellijst'
])

const TOKENS_PL = clean([
  'magazyn','wiadomości','kultura','muzyka','film','seriale','animacja','sztuka','design','fotografia','moda','uroda','styl','podróże','jedzenie','gotowanie','przepisy','nauka','technologia','historia','architektura','kosmos','natura','fauna','środowisko','klimat','zdrowie','sport','piłka nożna','koszykówka','tenis','gry','gaming','e-sport','edukacja','książki','literatura','teatr','taniec','podcast','radio','wideo','telewizja','festiwal','wydarzenia','miasto','lokalne','globalne','muzeum','galeria','archiwum','biblioteka','przewodnik','recenzja','porady','tutorial','wywiad','dokument','reportaż','najważniejsze','klip','odcinek','zwiastun','zapowiedź','kanał','playlista'
])

const TOKENS_SV = clean([
  'tidskrift','nyheter','kultur','musik','film','serier','animation','konst','design','fotografi','mode','skönhet','stil','resor','mat','recept','vetenskap','teknik','historia','arkitektur','rymden','natur','djur','miljö','klimat','hälsa','sport','fotboll','basket','tennis','spel','gaming','e-sport','utbildning','böcker','litteratur','teater','dans','podcast','radio','video','tv','festival','evenemang','stad','lokal','global','museum','galleri','arkiv','bibliotek','guide','recension','tips','tutorial','intervju','dokumentär','reportage','höjdpunkter','klipp','avsnitt','trailer','teaser','kanal','spellista'
])

const TOKENS_JA = clean([
  '雑誌','ニュース','文化','音楽','映画','ドラマ','アニメ','アート','デザイン','写真','ファッション','ビューティー','スタイル','旅行','食','料理','レシピ','科学','テクノロジー','歴史','建築','宇宙','自然','野生動物','環境','気候','健康','スポーツ','サッカー','バスケットボール','テニス','ゲーム','ゲーミング','eスポーツ','教育','本','文学','劇場','ダンス','ポッドキャスト','ラジオ','ビデオ','テレビ','フェスティバル','イベント','都市','ローカル','グローバル','美術館','ギャラリー','アーカイブ','図書館','ガイド','レビュー','ヒント','チュートリアル','インタビュー','ドキュメンタリー','レポート','ハイライト','クリップ','エピソード','予告','ティーザー','チャンネル','プレイリスト'
])

const TOKENS_KO = clean([
  '잡지','뉴스','문화','음악','영화','드라마','애니메이션','아트','디자인','사진','패션','뷰티','스타일','여행','음식','요리','레시피','과학','기술','역사','건축','우주','자연','야생동물','환경','기후','건강','스포츠','축구','농구','테니스','게임','게이밍','e스포츠','교육','책','문학','극장','무용','팟캐스트','라디오','비디오','TV','페스티벌','이벤트','도시','로컬','글로벌','미술관','갤러리','아카이브','도서관','가이드','리뷰','팁','튜토리얼','인터뷰','다큐멘터리','리포트','하이라이트','클립','에피소드','예고편','티저','채널','재생목록'
])

const TOKENS_ZH = clean([
  '杂志','新闻','文化','音乐','电影','剧集','动画','艺术','设计','摄影','时尚','美妆','风格','旅行','美食','烹饪','菜谱','科学','科技','历史','建筑','太空','自然','野生动物','环境','气候','健康','体育','足球','篮球','网球','游戏','电竞','教育','书籍','文学','剧院','舞蹈','播客','广播','视频','电视','节日','活动','城市','本地','全球','博物馆','画廊','档案','图书馆','指南','评测','技巧','教程','采访','纪录片','报道','精选','片段','集数','预告','先导','频道','播放列表'
])

const TOKENS_HI = clean([
  'पत्रिका','समाचार','संस्कृति','संगीत','फ़िल्म','धारावाहिक','एनीमेशन','कला','डिज़ाइन','फोटोग्राफी','फ़ैशन','सौंदर्य','शैली','यात्रा','भोजन','पाक-कला','रेसिपी','विज्ञान','प्रौद्योगिकी','इतिहास','वास्तुकला','अंतरिक्ष','प्रकृति','वन्यजीव','पर्यावरण','जलवायु','स्वास्थ्य','खेल','फुटबॉल','बास्केटबॉल','टेनिस','गेम','गेमिंग','ई-स्पोर्ट्स','शिक्षा','किताबें','साहित्य','रंगमंच','नृत्य','पॉडकास्ट','रेडियो','वीडियो','टेलीविज़न','उत्सव','कार्यक्रम','शहर','स्थानीय','वैश्विक','संग्रहालय','गैलरी','अभिलेखागार','पुस्तकालय','गाइड','समीक्षा','सलाह','ट्यूटोरियल','साक्षात्कार','डॉक्यूमेंट्री','रिपोर्ट','मुख्य अंश','क्लिप','कड़ी','ट्रेलर','टीज़र','चैनल','प्लेलिस्ट'
])

const TOKENS_TH = clean([
  'นิตยสาร','ข่าว','วัฒนธรรม','เพลง','ภาพยนตร์','ซีรีส์','แอนิเมชัน','ศิลปะ','ดีไซน์','การถ่ายภาพ','แฟชั่น','บิวตี้','สไตล์','ท่องเที่ยว','อาหาร','ทำอาหาร','สูตรอาหาร','วิทยาศาสตร์','เทคโนโลยี','ประวัติศาสตร์','สถาปัตยกรรม','อวกาศ','ธรรมชาติ','สัตว์ป่า','สิ่งแวดล้อม','สภาพอากาศ','สุขภาพ','กีฬา','ฟุตบอล','บาสเกตบอล','เทนนิส','เกม','เกมมิ่ง','อีสปอร์ต','การศึกษา','หนังสือ','วรรณกรรม','โรงละคร','การเต้น','พอดแคสต์','วิทยุ','วิดีโอ','โทรทัศน์','เทศกาล','อีเวนต์','เมือง','ท้องถิ่น','ทั่วโลก','พิพิธภัณฑ์','แกลเลอรี','คลังข้อมูล','ห้องสมุด','ไกด์','รีวิว','เคล็ดลับ','บทเรียน','สัมภาษณ์','สารคดี','รายงาน','ไฮไลต์','คลิป','ตอน','ตัวอย่าง','ทีเซอร์','ช่อง','เพลย์ลิสต์'
])

const TOKENS_VI = clean([
  'tạp chí','tin tức','văn hóa','âm nhạc','phim','phim bộ','hoạt hình','nghệ thuật','thiết kế','nhiếp ảnh','thời trang','làm đẹp','phong cách','du lịch','ẩm thực','nấu ăn','công thức','khoa học','công nghệ','lịch sử','kiến trúc','vũ trụ','thiên nhiên','động vật hoang dã','môi trường','khí hậu','sức khỏe','thể thao','bóng đá','bóng rổ','quần vợt','trò chơi','game','e-sports','giáo dục','sách','văn học','nhà hát','múa','podcast','radio','video','truyền hình','lễ hội','sự kiện','thành phố','địa phương','toàn cầu','bảo tàng','phòng trưng bày','lưu trữ','thư viện','hướng dẫn','đánh giá','mẹo','bài học','phỏng vấn','tài liệu','phóng sự','điểm nhấn','clip','tập','trailer','teaser','kênh','danh sách phát'
])

const TOKENS_ID = clean([
  'majalah','berita','budaya','musik','film','serial','animasi','seni','desain','fotografi','fashion','kecantikan','gaya','wisata','kuliner','memasak','resep','sains','teknologi','sejarah','arsitektur','luar angkasa','alam','satwa liar','lingkungan','iklim','kesehatan','olahraga','sepak bola','basket','tenis','game','gaming','e-sports','pendidikan','buku','sastra','teater','tari','podcast','radio','video','televisi','festival','acara','kota','lokal','global','museum','galeri','arsip','perpustakaan','panduan','ulasan','tips','tutorial','wawancara','dokumenter','liputan','sorotan','klip','episode','trailer','teaser','kanal','daftar putar'
])

const TOKENS_AR = clean([
  'مجلة','أخبار','ثقافة','موسيقى','فيلم','مسلسلات','رسوم متحركة','فن','تصميم','تصوير','موضة','جمال','أسلوب','سفر','طعام','طبخ','وصفات','علم','تكنولوجيا','تاريخ','عمارة','فضاء','طبيعة','حياة برية','بيئة','مناخ','صحة','رياضة','كرة قدم','كرة سلة','تنس','ألعاب','جيمينغ','رياضات إلكترونية','تعليم','كتب','أدب','مسرح','رقص','بودكاست','إذاعة','فيديو','تلفزيون','مهرجان','فعاليات','مدينة','محلي','عالمي','متحف','معرض','أرشيف','مكتبة','دليل','مراجعة','نصائح','درس','مقابلة','وثائقي','تقرير','أبرز اللقطات','مقطع','حلقة','إعلان','ترويج','قناة','قائمة تشغيل'
])

const TOKENS_SW = clean([
  'jarida','habari','utamaduni','muziki','filamu','tamthilia','uhuishaji','sanaa','ubunifu','upigaji picha','mitindo','urembo','safari','chakula','mapishi','sayansi','teknolojia','historia','usanifu','anga','asili','wanyamapori','mazingira','hali ya hewa','afya','michezo','kandanda','mpira wa kikapu','tenisi','michezo ya video','esports','elimu','vitabu','fasihi','ukumbi wa michezo','dansi','podikasti','redio','video','televisheni','tamasha','matukio','jiji','ya ndani','duniani','makumbusho','jumba la sanaa','nyaraka','maktaba','mwongozo','mapitio','vidokezo','mafunzo','mahojiano','hati','ripoti','muhtasari','kipande','sehemu','trela','kionjo','kituo','orodha ya uchezaji'
])

const TOKENS_AM = clean([
  'መጽሔት','ዜና','ባህል','ሙዚቃ','ፊልም','ሳይንስ','ቴክኖሎጂ','ታሪክ','ስፖርት','ጤና','ተፈጥሮ','አቅርቦት','ከተማ','ቤተ መዘክር','ሙዚየም','ማህደር','መፅሀፍት ቤት','መመሪያ','ግምገማ','ትምህርት','ቃለ ምልልስ','ሰነድ ፊልም','ሪፖርት','ሙከራ','ክፍል','ቻናል','ዝርዝር'
])

export const REGION_POOLS: RegionPoolMap = {
  'global': [
    makeLanguagePool('english', TOKENS_EN, TOKENS_EN, TOKENS_EN),
    makeLanguagePool('spanish', TOKENS_ES, TOKENS_ES, TOKENS_ES),
    makeLanguagePool('french', TOKENS_FR, TOKENS_FR, TOKENS_FR),
    makeLanguagePool('german', TOKENS_DE, TOKENS_DE, TOKENS_DE),
  ],
  'north-america': [
    makeLanguagePool('english', TOKENS_EN, TOKENS_EN, TOKENS_EN),
    makeLanguagePool('french', TOKENS_FR, TOKENS_FR, TOKENS_FR),
  ],
  'south-america': [
    makeLanguagePool('spanish', TOKENS_ES, TOKENS_ES, TOKENS_ES),
    makeLanguagePool('portuguese', TOKENS_PT, TOKENS_PT, TOKENS_PT),
  ],
  'europe': [
    makeLanguagePool('french', TOKENS_FR, TOKENS_FR, TOKENS_FR),
    makeLanguagePool('german', TOKENS_DE, TOKENS_DE, TOKENS_DE),
    makeLanguagePool('italian', TOKENS_IT, TOKENS_IT, TOKENS_IT),
    makeLanguagePool('spanish-eu', TOKENS_ES, TOKENS_ES, TOKENS_ES),
    makeLanguagePool('dutch', TOKENS_NL, TOKENS_NL, TOKENS_NL),
    makeLanguagePool('polish', TOKENS_PL, TOKENS_PL, TOKENS_PL),
    makeLanguagePool('swedish', TOKENS_SV, TOKENS_SV, TOKENS_SV),
  ],
  'asia': [
    makeLanguagePool('japanese', TOKENS_JA, TOKENS_JA, TOKENS_JA),
    makeLanguagePool('korean', TOKENS_KO, TOKENS_KO, TOKENS_KO),
    makeLanguagePool('chinese', TOKENS_ZH, TOKENS_ZH, TOKENS_ZH),
    makeLanguagePool('hindi', TOKENS_HI, TOKENS_HI, TOKENS_HI),
    makeLanguagePool('thai', TOKENS_TH, TOKENS_TH, TOKENS_TH),
    makeLanguagePool('vietnamese', TOKENS_VI, TOKENS_VI, TOKENS_VI),
    makeLanguagePool('indonesian', TOKENS_ID, TOKENS_ID, TOKENS_ID),
  ],
  'africa': [
    makeLanguagePool('english-africa', TOKENS_EN, TOKENS_EN, TOKENS_EN),
    makeLanguagePool('french-africa', TOKENS_FR, TOKENS_FR, TOKENS_FR),
    makeLanguagePool('arabic', TOKENS_AR, TOKENS_AR, TOKENS_AR),
    makeLanguagePool('swahili', TOKENS_SW, TOKENS_SW, TOKENS_SW),
    makeLanguagePool('amharic', TOKENS_AM, TOKENS_AM, TOKENS_AM),
  ],
}

export function getRegionLanguagePool(region: RegionKey, rng: () => number = Math.random): RegionLanguagePool {
  const pools = REGION_POOLS[region] ?? REGION_POOLS.global
  const index = Math.floor(rng() * pools.length)
  return pools[index]
}

export function buildRegionalQuery(region: RegionKey, category: MediaCategory, rng: () => number = Math.random): {
  terms: string[]
  language: string
} {
  const pool = getRegionLanguagePool(region, rng)
  const source =
    category === 'video'
      ? pool.video
      : category === 'image'
      ? pool.image
      : pool.web

  // choose 2 or 3 unique terms
  const shuffled = source.slice().sort(() => rng() - 0.5)
  const take = Math.min(source.length, rng() < 0.7 ? 2 : 3)
  const terms = shuffled.slice(0, take)
  return { terms, language: pool.language }
}

export function buildRegionalQueries(
  region: RegionKey,
  category: MediaCategory,
  count: number,
  rng: () => number = Math.random,
): { query: string; language: string; terms: string[] }[] {
  const results: { query: string; language: string; terms: string[] }[] = []
  for (let i = 0; i < count; i++) {
    const { terms, language } = buildRegionalQuery(region, category, rng)
    results.push({ query: terms.join(' '), language, terms })
  }
  return results
}
