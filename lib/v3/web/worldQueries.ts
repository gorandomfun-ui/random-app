/**
 * What to ask Google for the web part: the small sites of the whole world, in
 * their own language — a plumber in Douala, a bakery in Cusco, a luthier in
 * Cremona, a guesthouse in Luang Prabang (the owner, 28 September: "des sites
 * de plombier au Cameroun … pas forcément des trucs toujours intéressants
 * mais pas des pages avec que du texte"). One search in four looks for
 * something curious instead: a small museum, an archive, a map.
 *
 * A result is kept as the front page of its site (lib/v3/web/quality.ts
 * frontPageOf); the server then visits it for its preview.
 */

export type WorldQuery = { q: string; gl: string; lr?: string }

type Language = 'fr' | 'es' | 'pt' | 'en' | 'de' | 'it' | 'nl' | 'pl' | 'sv' | 'id' | 'vi' | 'tr'

const TRADES: Record<Language, string[]> = {
  fr: ['plombier', 'boulangerie', 'garage automobile', 'menuiserie', 'salon de coiffure', 'photographe', 'imprimerie', 'traiteur', 'école de musique', 'école de danse', 'apiculteur', 'fromagerie', 'brasserie artisanale', 'atelier de couture', 'auto-école', 'maison d\'hôtes', 'pépinière', 'forgeron', 'luthier', 'poterie', 'librairie', 'radio locale', 'club de football', 'chorale', 'réparation vélo', 'serrurier', 'vétérinaire', 'cirque', 'marionnettes', 'club d\'astronomie', 'ferme', 'chocolatier', 'glacier', 'club de plongée', 'centre équestre', 'tatoueur'],
  es: ['plomero', 'panadería', 'taller mecánico', 'carpintería', 'peluquería', 'fotógrafo', 'imprenta', 'catering', 'escuela de música', 'academia de baile', 'apicultor', 'quesería', 'cervecería artesanal', 'taller de costura', 'autoescuela', 'hostal', 'vivero', 'herrería', 'luthier', 'alfarería', 'librería', 'radio comunitaria', 'club de fútbol', 'coro', 'taller de bicicletas', 'cerrajero', 'veterinaria', 'circo', 'títeres', 'club de astronomía', 'granja', 'chocolatería', 'heladería', 'escuela de buceo', 'escuela de equitación', 'tatuajes'],
  pt: ['encanador', 'padaria', 'oficina mecânica', 'marcenaria', 'barbearia', 'fotógrafo', 'gráfica', 'buffet', 'escola de música', 'escola de dança', 'apicultor', 'queijaria', 'cervejaria artesanal', 'ateliê de costura', 'autoescola', 'pousada', 'viveiro de plantas', 'ferreiro', 'luthier', 'olaria', 'livraria', 'rádio comunitária', 'clube de futebol', 'coral', 'bicicletaria', 'chaveiro', 'veterinário', 'circo', 'teatro de bonecos', 'clube de astronomia', 'fazenda', 'chocolataria', 'sorveteria', 'escola de mergulho', 'hípica', 'estúdio de tatuagem'],
  en: ['plumber', 'bakery', 'auto repair', 'carpenter', 'barber shop', 'photographer', 'print shop', 'caterer', 'music school', 'dance school', 'beekeeper', 'cheese maker', 'craft brewery', 'tailor', 'driving school', 'guesthouse', 'plant nursery', 'blacksmith', 'luthier', 'pottery studio', 'bookshop', 'community radio', 'football club', 'choir', 'bicycle repair', 'locksmith', 'veterinary clinic', 'circus school', 'puppet theatre', 'astronomy club', 'family farm', 'chocolatier', 'ice cream parlour', 'dive shop', 'riding school', 'tattoo studio'],
  de: ['Klempner', 'Bäckerei', 'Autowerkstatt', 'Schreinerei', 'Friseur', 'Fotograf', 'Druckerei', 'Partyservice', 'Musikschule', 'Tanzschule', 'Imkerei', 'Käserei', 'Brauerei', 'Schneiderei', 'Fahrschule', 'Pension', 'Gärtnerei', 'Schmiede', 'Geigenbauer', 'Töpferei', 'Buchhandlung', 'Bürgerradio', 'Fußballverein', 'Chor', 'Fahrradwerkstatt', 'Schlüsseldienst', 'Tierarzt', 'Zirkus', 'Puppentheater', 'Sternwarte', 'Hofladen', 'Chocolatier', 'Eiscafé', 'Tauchschule', 'Reitschule', 'Tattoostudio'],
  it: ['idraulico', 'panificio', 'officina meccanica', 'falegnameria', 'barbiere', 'fotografo', 'tipografia', 'catering', 'scuola di musica', 'scuola di danza', 'apicoltore', 'caseificio', 'birrificio artigianale', 'sartoria', 'autoscuola', 'agriturismo', 'vivaio', 'fabbro', 'liutaio', 'ceramica artigianale', 'libreria', 'radio locale', 'squadra di calcio', 'coro', 'ciclofficina', 'fabbro serrature', 'veterinario', 'circo', 'teatro dei burattini', 'osservatorio astronomico', 'fattoria', 'cioccolateria', 'gelateria', 'diving', 'maneggio', 'tatuatore'],
  nl: ['loodgieter', 'bakkerij', 'autogarage', 'timmerman', 'kapper', 'fotograaf', 'drukkerij', 'muziekschool', 'dansschool', 'imker', 'kaasboerderij', 'bierbrouwerij', 'kleermaker', 'rijschool', 'bed and breakfast', 'kwekerij', 'smid', 'vioolbouwer', 'pottenbakkerij', 'boekhandel', 'lokale omroep', 'voetbalvereniging', 'koor', 'fietsenmaker', 'dierenarts', 'poppentheater', 'volkssterrenwacht', 'zorgboerderij', 'ijssalon', 'manege'],
  pl: ['hydraulik', 'piekarnia', 'warsztat samochodowy', 'stolarz', 'fryzjer', 'fotograf', 'drukarnia', 'szkoła muzyczna', 'szkoła tańca', 'pasieka', 'serowarnia', 'browar rzemieślniczy', 'krawiec', 'szkoła jazdy', 'agroturystyka', 'szkółka roślin', 'kowal', 'lutnik', 'pracownia ceramiki', 'księgarnia', 'radio lokalne', 'klub piłkarski', 'chór', 'serwis rowerowy', 'weterynarz', 'teatr lalek', 'obserwatorium', 'gospodarstwo', 'lodziarnia', 'stadnina'],
  sv: ['rörmokare', 'bageri', 'bilverkstad', 'snickare', 'frisör', 'fotograf', 'tryckeri', 'musikskola', 'dansskola', 'biodlare', 'gårdsmejeri', 'bryggeri', 'skräddare', 'trafikskola', 'vandrarhem', 'handelsträdgård', 'smedja', 'fiolbyggare', 'keramikverkstad', 'bokhandel', 'närradio', 'fotbollsklubb', 'kör', 'cykelverkstad', 'veterinär', 'dockteater', 'observatorium', 'gårdsbutik', 'glasskiosk', 'ridskola'],
  id: ['tukang ledeng', 'toko roti', 'bengkel mobil', 'tukang kayu', 'pangkas rambut', 'fotografer', 'percetakan', 'katering', 'sekolah musik', 'sanggar tari', 'peternak lebah', 'kedai kopi', 'penjahit', 'kursus mengemudi', 'homestay', 'pembibitan tanaman', 'pandai besi', 'kerajinan gerabah', 'toko buku', 'radio komunitas', 'klub sepak bola', 'paduan suara', 'bengkel sepeda', 'dokter hewan', 'wayang', 'peternakan', 'batik', 'sekolah selam'],
  vi: ['thợ sửa ống nước', 'tiệm bánh', 'gara ô tô', 'xưởng mộc', 'tiệm cắt tóc', 'nhiếp ảnh gia', 'nhà in', 'trường nhạc', 'lớp học múa', 'nuôi ong', 'cà phê', 'tiệm may', 'trường dạy lái xe', 'homestay', 'vườn ươm', 'lò rèn', 'gốm', 'nhà sách', 'câu lạc bộ bóng đá', 'dàn hợp xướng', 'sửa xe đạp', 'thú y', 'múa rối nước', 'trang trại'],
  tr: ['tesisatçı', 'fırın', 'oto tamir', 'marangoz', 'berber', 'fotoğrafçı', 'matbaa', 'müzik okulu', 'dans okulu', 'arıcılık', 'peynirci', 'bira fabrikası', 'terzi', 'sürücü kursu', 'pansiyon', 'fidanlık', 'demirci', 'saz yapımı', 'çömlek atölyesi', 'kitabevi', 'yerel radyo', 'futbol kulübü', 'koro', 'bisiklet tamir', 'veteriner', 'karagöz', 'çiftlik', 'dondurmacı'],
}

/** Where to look, with the language people there write their sites in, and a few towns of every size. */
const PLACES: Array<{ gl: string; lang: Language; towns: string[] }> = [
  { gl: 'cm', lang: 'fr', towns: ['Douala', 'Yaoundé', 'Bafoussam', 'Garoua', 'Kribi', 'Limbé'] },
  { gl: 'sn', lang: 'fr', towns: ['Dakar', 'Saint-Louis', 'Ziguinchor', 'Thiès', 'Mbour'] },
  { gl: 'ci', lang: 'fr', towns: ['Abidjan', 'Bouaké', 'Yamoussoukro', 'San-Pédro', 'Grand-Bassam'] },
  { gl: 'bf', lang: 'fr', towns: ['Ouagadougou', 'Bobo-Dioulasso', 'Koudougou'] },
  { gl: 'bj', lang: 'fr', towns: ['Cotonou', 'Porto-Novo', 'Ouidah', 'Parakou'] },
  { gl: 'cd', lang: 'fr', towns: ['Kinshasa', 'Lubumbashi', 'Goma', 'Kisangani'] },
  { gl: 'mg', lang: 'fr', towns: ['Antananarivo', 'Toamasina', 'Antsirabe', 'Nosy Be'] },
  { gl: 'ma', lang: 'fr', towns: ['Casablanca', 'Fès', 'Essaouira', 'Tanger', 'Agadir', 'Chefchaouen'] },
  { gl: 'tn', lang: 'fr', towns: ['Tunis', 'Sfax', 'Sousse', 'Djerba', 'Kairouan'] },
  { gl: 'ht', lang: 'fr', towns: ['Port-au-Prince', 'Cap-Haïtien', 'Jacmel'] },
  { gl: 're', lang: 'fr', towns: ['Saint-Denis de La Réunion', 'Saint-Pierre La Réunion', 'Cilaos'] },
  { gl: 'fr', lang: 'fr', towns: ['Aurillac', 'Dieppe', 'Millau', 'Guéret', 'Morlaix', 'Pontarlier', 'Bastia', 'Figeac', 'Cayenne'] },
  { gl: 'be', lang: 'fr', towns: ['Namur', 'Liège', 'Bastogne', 'Dinant', 'Tournai'] },
  { gl: 'ch', lang: 'fr', towns: ['Fribourg', 'Neuchâtel', 'Sion', 'Porrentruy'] },
  { gl: 'ca', lang: 'fr', towns: ['Rimouski', 'Chicoutimi', 'Trois-Rivières', 'Gaspé', 'Sherbrooke'] },
  { gl: 'mx', lang: 'es', towns: ['Oaxaca', 'Mérida', 'San Cristóbal de las Casas', 'Zacatecas', 'Mazatlán', 'Puebla'] },
  { gl: 'gt', lang: 'es', towns: ['Quetzaltenango', 'Antigua Guatemala', 'Cobán', 'Flores Petén'] },
  { gl: 'hn', lang: 'es', towns: ['Tegucigalpa', 'San Pedro Sula', 'La Ceiba', 'Copán'] },
  { gl: 'co', lang: 'es', towns: ['Medellín', 'Manizales', 'Popayán', 'Santa Marta', 'Villa de Leyva'] },
  { gl: 'pe', lang: 'es', towns: ['Cusco', 'Arequipa', 'Trujillo', 'Iquitos', 'Huaraz', 'Puno'] },
  { gl: 'ec', lang: 'es', towns: ['Quito', 'Cuenca', 'Otavalo', 'Loja', 'Baños de Agua Santa'] },
  { gl: 'bo', lang: 'es', towns: ['La Paz', 'Sucre', 'Cochabamba', 'Potosí'] },
  { gl: 'cl', lang: 'es', towns: ['Valparaíso', 'Valdivia', 'Punta Arenas', 'Chiloé', 'La Serena'] },
  { gl: 'ar', lang: 'es', towns: ['Rosario', 'Salta', 'Bariloche', 'Mendoza', 'Ushuaia', 'Tandil'] },
  { gl: 'uy', lang: 'es', towns: ['Montevideo', 'Colonia del Sacramento', 'Salto', 'Rocha'] },
  { gl: 'py', lang: 'es', towns: ['Asunción', 'Encarnación', 'Ciudad del Este'] },
  { gl: 'do', lang: 'es', towns: ['Santiago de los Caballeros', 'Puerto Plata', 'Samaná'] },
  { gl: 'es', lang: 'es', towns: ['Teruel', 'Lugo', 'Cáceres', 'Soria', 'Almería', 'Tenerife'] },
  { gl: 'br', lang: 'pt', towns: ['Belém', 'Ouro Preto', 'São Luís', 'Florianópolis', 'Cuiabá', 'Paraty', 'Manaus'] },
  { gl: 'pt', lang: 'pt', towns: ['Braga', 'Évora', 'Viseu', 'Tavira', 'Funchal', 'Ponta Delgada'] },
  { gl: 'ao', lang: 'pt', towns: ['Luanda', 'Benguela', 'Lubango'] },
  { gl: 'mz', lang: 'pt', towns: ['Maputo', 'Beira', 'Inhambane'] },
  { gl: 'cv', lang: 'pt', towns: ['Praia', 'Mindelo', 'Sal'] },
  { gl: 'ng', lang: 'en', towns: ['Lagos', 'Ibadan', 'Enugu', 'Jos', 'Calabar'] },
  { gl: 'gh', lang: 'en', towns: ['Accra', 'Kumasi', 'Cape Coast', 'Tamale'] },
  { gl: 'ke', lang: 'en', towns: ['Nairobi', 'Kisumu', 'Mombasa', 'Nakuru', 'Lamu'] },
  { gl: 'ug', lang: 'en', towns: ['Kampala', 'Jinja', 'Gulu', 'Mbarara'] },
  { gl: 'tz', lang: 'en', towns: ['Arusha', 'Dar es Salaam', 'Zanzibar', 'Moshi'] },
  { gl: 'rw', lang: 'en', towns: ['Kigali', 'Musanze', 'Huye'] },
  { gl: 'et', lang: 'en', towns: ['Addis Ababa', 'Gondar', 'Bahir Dar', 'Lalibela'] },
  { gl: 'zm', lang: 'en', towns: ['Lusaka', 'Livingstone', 'Ndola'] },
  { gl: 'na', lang: 'en', towns: ['Windhoek', 'Swakopmund', 'Lüderitz'] },
  { gl: 'za', lang: 'en', towns: ['Durban', 'Knysna', 'Bloemfontein', 'Stellenbosch', 'Makhanda'] },
  { gl: 'in', lang: 'en', towns: ['Pondicherry', 'Shillong', 'Udaipur', 'Kochi', 'Leh', 'Madurai'] },
  { gl: 'np', lang: 'en', towns: ['Kathmandu', 'Pokhara', 'Bhaktapur'] },
  { gl: 'lk', lang: 'en', towns: ['Kandy', 'Galle', 'Jaffna', 'Ella'] },
  { gl: 'bd', lang: 'en', towns: ['Dhaka', 'Chittagong', 'Sylhet'] },
  { gl: 'ph', lang: 'en', towns: ['Cebu', 'Baguio', 'Iloilo', 'Dumaguete', 'Siargao'] },
  { gl: 'my', lang: 'en', towns: ['Penang', 'Ipoh', 'Kuching', 'Melaka'] },
  { gl: 'th', lang: 'en', towns: ['Chiang Mai', 'Pai', 'Hat Yai', 'Khon Kaen', 'Koh Lanta'] },
  { gl: 'kh', lang: 'en', towns: ['Phnom Penh', 'Siem Reap', 'Kampot', 'Battambang'] },
  { gl: 'la', lang: 'en', towns: ['Luang Prabang', 'Vientiane', 'Vang Vieng'] },
  { gl: 'mn', lang: 'en', towns: ['Ulaanbaatar', 'Kharkhorin'] },
  { gl: 'jp', lang: 'en', towns: ['Kanazawa', 'Onomichi', 'Hakodate', 'Matsumoto'] },
  { gl: 'kr', lang: 'en', towns: ['Jeonju', 'Gyeongju', 'Busan', 'Jeju'] },
  { gl: 'au', lang: 'en', towns: ['Hobart', 'Alice Springs', 'Broome', 'Ballarat', 'Byron Bay'] },
  { gl: 'nz', lang: 'en', towns: ['Dunedin', 'Nelson', 'Napier', 'Invercargill'] },
  { gl: 'fj', lang: 'en', towns: ['Suva', 'Nadi', 'Levuka'] },
  { gl: 'pg', lang: 'en', towns: ['Port Moresby', 'Madang', 'Goroka'] },
  { gl: 'us', lang: 'en', towns: ['Marfa Texas', 'Bisbee Arizona', 'Astoria Oregon', 'Asheville', 'Duluth', 'Taos', 'Bangor Maine', 'Paducah'] },
  { gl: 'ca', lang: 'en', towns: ['Whitehorse', 'Lunenburg', 'Nelson BC', 'Thunder Bay'] },
  { gl: 'ie', lang: 'en', towns: ['Galway', 'Dingle', 'Westport', 'Kilkenny'] },
  { gl: 'uk', lang: 'en', towns: ['Hebden Bridge', 'Whitby', 'Stornoway', 'Aberystwyth', 'Penzance', 'Shetland'] },
  { gl: 'is', lang: 'en', towns: ['Akureyri', 'Ísafjörður', 'Seyðisfjörður'] },
  { gl: 'lb', lang: 'fr', towns: ['Beyrouth', 'Byblos', 'Tripoli Liban'] },
  { gl: 'jo', lang: 'en', towns: ['Amman', 'Madaba', 'Aqaba'] },
  { gl: 'de', lang: 'de', towns: ['Görlitz', 'Husum', 'Passau', 'Quedlinburg', 'Bamberg', 'Flensburg'] },
  { gl: 'at', lang: 'de', towns: ['Graz', 'Hallstatt', 'Linz', 'Bregenz'] },
  { gl: 'ch', lang: 'de', towns: ['Appenzell', 'Chur', 'Luzern', 'St. Gallen'] },
  { gl: 'it', lang: 'it', towns: ['Matera', 'Cremona', 'Trieste', 'Lecce', 'Nuoro', 'Bolzano', 'Ragusa'] },
  { gl: 'nl', lang: 'nl', towns: ['Leeuwarden', 'Zwolle', 'Middelburg', 'Texel'] },
  { gl: 'be', lang: 'nl', towns: ['Gent', 'Brugge', 'Leuven', 'Hasselt'] },
  { gl: 'pl', lang: 'pl', towns: ['Zakopane', 'Toruń', 'Białystok', 'Lublin', 'Gdańsk'] },
  { gl: 'se', lang: 'sv', towns: ['Kiruna', 'Visby', 'Östersund', 'Umeå', 'Ystad'] },
  { gl: 'id', lang: 'id', towns: ['Yogyakarta', 'Bandung', 'Ubud', 'Makassar', 'Medan', 'Flores'] },
  { gl: 'vn', lang: 'vi', towns: ['Hội An', 'Huế', 'Đà Lạt', 'Hà Nội', 'Cần Thơ'] },
  { gl: 'tr', lang: 'tr', towns: ['Trabzon', 'Mardin', 'Kars', 'Eskişehir', 'Antakya'] },
]

/** Curious things any town may have; searched in English, where most such pages are written. */
const CURIOUS = ['small museum', 'local history archive', 'virtual museum', 'online archive of', 'interactive map of', 'folk museum', 'collection of old', 'strange museum', 'amateur radio club', 'model railway club', 'puppet museum', 'toy museum', 'music box museum', 'botanical garden', 'observatory']

const pick = <T,>(values: readonly T[], random: () => number): T => values[Math.floor(random() * values.length)]

/** `count` searches, every one somewhere else when possible: places are drawn without repeat. */
export function worldWebQueries(count: number, random: () => number = Math.random): WorldQuery[] {
  const places = [...PLACES]
  const out: WorldQuery[] = []
  while (out.length < count) {
    if (!places.length) places.push(...PLACES)
    const place = places.splice(Math.floor(random() * places.length), 1)[0]
    const town = pick(place.towns, random)
    if (out.length % 4 === 3) {
      out.push({ q: `${pick(CURIOUS, random)} ${town}`, gl: place.gl })
    } else {
      out.push({ q: `${pick(TRADES[place.lang], random)} ${town}`, gl: place.gl, lr: `lang_${place.lang}` })
    }
  }
  return out
}

export const WORLD_PLACES = PLACES.length
/** The countries of the places, as their domains (cm, sn, pe…): the sources that work by country read this list. */
export const WORLD_COUNTRIES: readonly string[] = [...new Set(PLACES.map((place) => place.gl))]
