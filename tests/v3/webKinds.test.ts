import assert from 'node:assert/strict'
import test from 'node:test'

import type { Db, Document } from 'mongodb'

import { brandCandidates, brandCountriesOf, isoCountry } from '../../lib/v3/web/brands'
import { DEFER_HOURS, settleCandidates, type Candidate } from '../../lib/v3/web/candidates'
import { funSite, medicalReason } from '../../lib/v3/web/kinds'

test('places of care are told by their name or address (the owner, 22 October: "les hôpitaux, les médecins")', () => {
  assert.ok(medicalReason({ title: 'Hospital Delicia Concepción Masvernat - Concordia, Entre Ríos', host: 'hdcm.gov.ar' }))
  assert.ok(medicalReason({ title: 'Cabinet dentaire Bredohl - Dentiste à Liège', host: 'cabinetdentairebredohl.be' }))
  assert.ok(medicalReason({ title: 'Accueil - Margaux Torres, psychologue libérale à Toulouse', host: 'margauxtorres-psychologue.fr' }))
  assert.ok(medicalReason({ title: 'Pharmacie du marché Saint-Symphorien sur coise', host: 'saint-symphorien.mediprix.fr' }))
  assert.ok(medicalReason({ title: 'Family & Cosmetic Dentist in Oakville, ON | Royal Oak Dental', host: 'royaloakdental.ca' }), 'a cosmetic dentist is still a dentist')
})

test('what stays: cosmetic surgery, vets, and the clinics that are not places of care', () => {
  assert.equal(medicalReason({ title: 'Clínica Juárez Lazer', host: 'juarezplasticsurgery.co' }), null, 'cosmetic surgery, "au cas où"')
  assert.equal(medicalReason({ title: 'La Jolla Cosmetic Laser Clinic & Dermatology', host: 'lajollalaser.com' }), null)
  assert.equal(medicalReason({ title: 'Veterinarian in Glencoe | Glencoe Animal Hospital', host: 'glencoeanimalhospital.ca' }), null)
  assert.equal(medicalReason({ title: 'L. Kerry Vickar Business Law Clinic – Helping Manitobans succeed', host: 'business-law-clinic.sites.umanitoba.ca' }), null)
  assert.equal(medicalReason({ title: 'Glazier Clinics | Football Coaching Clinics & Online Coach Education', host: 'glazierclinics.com' }), null)
  assert.equal(medicalReason({ title: 'AtmSitecore', host: 'la-clinique-toiture.fr' }), null)
  assert.equal(medicalReason({ title: 'Plombier à Douala', host: 'plombier-douala.cm' }), null)
})

test('illness goes too, read in the name and inside a glued address (the owner, 24 October, a cancer charity: "pas très drôle")', () => {
  assert.equal(medicalReason({ title: 'My Site', host: 'cancerpatientservices.ca' }), 'cancer')
  assert.ok(medicalReason({ title: 'Association Laurette Fugain – contre la leucémie', host: 'laurettefugain.org' }))
  assert.ok(medicalReason({ title: 'Hospice of the Valley', host: 'hov.org' }))
  assert.ok(medicalReason({ title: "Parkinson's UK", host: 'parkinsons.org.uk' }))
  assert.ok(medicalReason({ title: 'Startseite', host: 'alzheimer-forschung.de' }))
})

test('what the illness words leave: the Cancer of the horoscopes, a Krebs, a Parkinson, the Hospices de Beaune', () => {
  assert.equal(medicalReason({ title: 'Cancer : votre horoscope du jour', host: 'astro-cancer.fr' }), null)
  assert.equal(medicalReason({ title: 'Krebs Engineering', host: 'krebs-eng.com' }), null)
  assert.equal(medicalReason({ title: 'Parkinson Lighting', host: 'parkinsonlighting.com' }), null)
  assert.equal(medicalReason({ title: 'Hospices de Beaune – vente des vins', host: 'hospices-de-beaune.com' }), null)
  assert.equal(medicalReason({ title: 'Patient Zero – a zombie game', host: 'patientzero.example' }), null)
})

test('the fun third: hand-made sites, lists, Show HN, brands, and curious or funny names wherever they come from', () => {
  assert.equal(funSite({ provider: 'neocities', title: 'my page' }), true)
  assert.equal(funSite({ provider: 'wikidata-brand', title: 'Podravka' }), true)
  assert.equal(funSite({ provider: 'commoncrawl', title: 'The Museum of Weird Things' }), true)
  assert.equal(funSite({ provider: 'commoncrawl', title: 'Home', host: 'silly-games.net' }), true)
  assert.equal(funSite({ provider: 'commoncrawl', title: 'Plombier à Douala', host: 'plombier-douala.cm' }), false)
})

test("Wikidata's brands: the makers by their kind, the firms by what they make, one site each, the secure one first", () => {
  const binding = (item: string, label: string, site: string, kind: string, desc = '') => ({
    item: { value: `http://www.wikidata.org/entity/${item}` }, itemLabel: { value: label }, site: { value: site },
    kind: { value: `http://www.wikidata.org/entity/${kind}` }, ...(desc ? { desc: { value: desc } } : {}),
  })
  const answer = { results: { bindings: [
    binding('Q1', 'Zagrebačka pivovara', 'http://zagrebackapivovara.hr', 'Q131734'),
    binding('Q1', 'Zagrebačka pivovara', 'https://zagrebackapivovara.hr', 'Q131734'),
    binding('Q2', 'Gavrilović d.o.o.', 'http://www.gavrilovic.hr', 'Q4830453', 'Croatian meat industry limited liability company'),
    binding('Q3', 'RedCode Web Design', 'https://redcode-web.design/', 'Q4830453', 'web design and branding agency'),
  ] } }
  const sites = brandCandidates(answer, 'hr')
  assert.deepEqual(sites.map((site) => site.title), ['Zagrebačka pivovara', 'Gavrilović d.o.o.'])
  assert.equal(sites[0].url, 'https://zagrebackapivovara.hr')
  assert.equal(sites[0].source, 'wikidata-brand')
  assert.equal(sites[0].sourceUrl, 'https://www.wikidata.org/wiki/Q1')
  assert.equal(isoCountry('uk'), 'GB')
  assert.equal(isoCountry('hr'), 'HR')
})

test('the brands go round the world on their own turn, a few countries further each night', () => {
  const world = ['cm', 'sn', 'fr', 'us', 'jp', 'hr', 'de']
  const monday = new Date('2026-10-26T03:10:00Z')
  const tuesday = new Date('2026-10-27T03:10:00Z')
  const first = brandCountriesOf(world, 3, monday)
  const next = brandCountriesOf(world, 3, tuesday)
  assert.equal(first.length, 3)
  assert.equal(new Set(first).size, 3)
  assert.equal(world.indexOf(next[0]), (world.indexOf(first[0]) + 3) % world.length, 'the next night starts where this one ended')
  assert.deepEqual(brandCountriesOf(world, 10, monday).length, world.length, 'never more countries than there are')
  assert.deepEqual(brandCountriesOf([], 3, monday), [])
})

test("a site left unvisited by a pass waits six hours, its attempts untouched", async () => {
  const writes: Document[] = []
  const db = { collection: () => ({ bulkWrite: async (operations: Document[]) => { writes.push(...operations); return {} } }) } as unknown as Db
  const now = new Date('2026-10-22T20:00:00Z')
  const candidate = { _id: 'site.example', url: 'https://site.example/', host: 'site.example', source: 'commoncrawl', status: 'new', attempts: 0, rand: 0.5, createdAt: now, nextAt: now } as Candidate
  await settleCandidates(db, [{ candidate, status: 'new', outcome: 'plus tard' }], now)
  const set = (writes[0].updateOne as { update: { $set: Record<string, unknown> } }).update.$set
  assert.equal((set.nextAt as Date).getTime(), now.getTime() + DEFER_HOURS * 3_600_000)
  assert.equal(set.attempts, undefined)
  assert.equal(set.status, undefined)
})
