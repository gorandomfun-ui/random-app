/**
 * Two kinds of sites the owner named on 22 October, told from a site's name and address (pure: the door, the sweep and
 * the marking of what is stored use the same words).
 *
 * The medical ones — hospitals, clinics, doctors, dentists, pharmacies, therapists, laboratories — are not shown ("les
 * hôpitaux, les médecins… on peut enlever"); cosmetic surgery stays ("sauf chirurgie esthétique, au cas où").
 *
 * The fun ones are a third of the sites a visitor gets ("on essaye de montrer plus souvent les trucs marrants… un site
 * sur 3"): hand-made sites, curiosity lists, the projects shown on Hacker News, brands, and any site whose name says
 * something curious or funny, wherever it was found.
 */

import { CURIOUS } from './quality'

/** Cosmetic surgery, which stays: the owner kept it "au cas où". */
const COSMETIC = /chirurgi(?:e|en)[\s-]?(?:esth[ée]tique|plastique)|plastic[\s-]?surg|cosmetic|aesthetic|esth[ée]tique|est[ée]tic[ao]|estetic[ao]|sch[öo]nheits|[äa]sthetisch|beaut[ée]|beauty|belleza|rhinoplast|liposuc|botox|sculpt|d[ée]pilation|depilaci[óo]n|hair (?:removal|transplant)|injerto capilar|implante capilar|capilar\b/i

/** A dentist who calls the work cosmetic is still a dentist: the exception is for surgery and aesthetic clinics. */
const DENTAL = /dent(?:ist|al|aire|ista)|odonto|orthodont/i

/** Care for animals, which stays: a vet is not the doctor the owner meant. */
const ANIMALS = /\bvets?\b|veterin\w*|v[ée]t[ée]rinaire|animal (?:hospital|clinic)|tier(?:arzt|klinik|[äa]rzt)\w*|wildlife|\bcats?\b|\bdogs?\b|perros|gatos|mascotas|\bpets?\b/i
/** A "clinic" that is not a place of care: a law clinic, a football clinic, a roof's, a piece of software for dentists. */
const NOT_CARE = /\b(?:law|legal|business|tax|roof(?:ing)?|toiture|marketing|coaching|football|soccer|golf|tennis|basketball|baseball|hockey|sports? clinics?|computer|bike|v[ée]lo|software|nuclear|nucl[ée]aire|wordpress theme)\b/i

/** A place of care or a carer, by its name: the words that name the place or the trade, not the ones that merely mention health. */
const MEDICAL = /\b(?:hospitals?|h[ôo]pita(?:l|ux)|hospitais|hospitales|ospedal[ei]|krankenh[äa]us(?:er)?|szpital|nemocnice|ziekenhuis|sjukhus|sykehus|hastanesi?|rumah sakit|b[ệe]nh vi[ệe]n|clini(?:c|cs|que|ques|ca|cas)|cl[íi]nicas?|klini(?:k|ken|ka)|poli(?:clinic|clinique|cl[íi]nica|klinik|klinika)|medical (?:cent(?:er|re)|clinic|group|practice|office)|cent(?:re|ro) (?:m[ée]dic(?:al|o)|de sa(?:lud|[úu]de))|health (?:cent(?:er|re)|clinic)|cabinet (?:m[ée]dical|dentaire|de kin[ée]|d'orthophonie)|maison (?:m[ée]dicale|de sant[ée])|m[ée]decins?(?: g[ée]n[ée]raliste)?|docteurs?|arztpraxis|hausarzt|fach[äa]rzt|zahnarzt(?:praxis)?|praxis f[üu]r|consult[óo]rio|consultorio m[ée]dico|dentists?|dentistry|dental (?:clinic|care|office|practice|surgery|group)|dentaire|dentistas?|odontolog[ií]a|zahnmedizin|orthodont\w*|pharmac(?:y|ies|ie|ien)|farm[áa]cias?|farmacia|apotheke|physiotherap\w*|kin[ée]sith[ée]rap\w*|fisioterap\w*|ost[ée]opath\w*|chiropract\w*|psychoth[ée]rap\w*|psycholog(?:ue|ist|ists|e)\b|psychiatr\w*|orthophon\w*|logop[äa]d\w*|cardiolog\w*|dermatolog\w*|gyn[ée]colog\w*|p[ée]diatr\w*|ophtalmolog\w*|ophthalmolog\w*|radiolog\w*|urolog\w*|oncolog\w*|neurolog\w*|orthop[ée]di\w*|laboratoire d'analyses|medical laborator\w*|laborat[óo]rio cl[íi]nico|urgent care|nursing home|ehpad|maternit[ée]|maternity hospital)\b/i

/**
 * Illness and the care around it, which the owner does not want either (24 October, a cancer patients' charity: "pas
 * très drôle"). Words that are also names or ordinary words stay out: Krebs alone, Parkinson alone, "aids", "patient".
 */
const ILLNESS = /\b(?:cancers?|c[áâ]ncer|cancro|krebs(?:hilfe|gesellschaft|beratung|zentrum|forschung|kranke\w*|patient\w*)|leuk(?:a)?emi\w*|leuc[ée]mi\w*|leucemia|leuk[äa]mie|tum(?:or|our|eur|ore)s?|chemotherap\w*|chimioth[ée]rap\w*|quimioterapi\w*|palliati\w*|paliativ\w*|hospice|dialys\w*|di[áa]lisis|alzheimer\w*|parkinson'?s|maladie de parkinson|scl[ée]rose en plaques|multiple sclerosis|mucoviscidose|cystic fibrosis|hiv|vih)\b/i
/** The same, read inside an address, whose words come glued together ("cancerpatientservices.ca"): the longest stems only. */
const ILLNESS_GLUED = /cancer|oncolog|onkolog|leuk(?:a)?emi|leucemi|chemotherap|chimiotherap|palliativ|dialys|alzheimer/i
/** The sign of the Cancer is not the illness, and an old hospice that became a museum is a museum: they stay. */
const NOT_ILLNESS = /horoscop|horoskop|hor[óo]scopo|oroscopo|zodia|zod[íi]aco|astrolog|mus[ée]e|museum|museo/i

/** Why a site is a place of care or about an illness, or null; cosmetic surgery is never one. Read from its name and its address. */
export function medicalReason(site: { title?: unknown; host?: unknown; url?: unknown }): string | null {
  const host = typeof site.host === 'string' ? site.host : ''
  const name = [site.title, host].filter((value): value is string => typeof value === 'string' && value.length > 0).join(' · ')
  if (!name || (COSMETIC.test(name) && !DENTAL.test(name)) || ANIMALS.test(name) || NOT_CARE.test(name)) return null
  const found = MEDICAL.exec(name)
  if (found) return found[0].toLowerCase()
  if (NOT_ILLNESS.test(name)) return null
  const illness = ILLNESS.exec(name) ?? ILLNESS_GLUED.exec(host.split('.').slice(0, -1).join('.'))
  return illness ? illness[0].toLowerCase() : null
}

/** The sources whose sites are fun by nature: hand-made sites, curiosity lists, projects shown on Hacker News, brands. */
export const FUN_SOURCES: ReadonlySet<string> = new Set(['neocities', 'curated-list', 'hn', 'wikidata-brand'])

/** Words that make a name smile, beside the curious ones the sort already keeps (lib/v3/web/quality.ts, CURIOUS). */
const FUNNY = /\b(?:games?|jeux|juegos?|spiele?|arcade|puzzles?|quiz(?:zes)?|toys?|jouets?|funny|humou?r|useless|absurd|silly|memes?|jokes?|blagues?|pixels?|8-?bit|webring|kittens?|doodles?|emojis?|unicorns?|dinosaurs?|ufo|ovni|aliens?|zombies?|monsters?|pirates?|ninjas?|wizards?|magic|magie|circus|cirque|carnival|carnaval|clowns?|comics?|cartoons?|bd|manga)\b/i

/** Whether a site belongs to the fun third: by where it was found, or by a name that says something curious or funny. */
export function funSite(site: { provider?: unknown; title?: unknown; host?: unknown }): boolean {
  if (typeof site.provider === 'string' && FUN_SOURCES.has(site.provider)) return true
  const title = typeof site.title === 'string' ? site.title : ''
  const host = typeof site.host === 'string' ? site.host : ''
  return CURIOUS.test(title) || FUNNY.test(`${title} ${host.replace(/[.-]/g, ' ')}`)
}
