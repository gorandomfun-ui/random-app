import assert from 'node:assert/strict'
import test from 'node:test'

import { parseGossipsWeb, parseNeocitiesBrowse, parseUselessWeb } from '../../lib/v3/web/smallWeb'

// As the pages read on 12 October.
const NEOCITIES = `<ul class="row website-Gallery content int-Gall">
      <li id="username_ngmi">
        <a href="https://ngmi.neocities.org"
           class="neo-Screen-Shot"
           title="ngmi.work"
        >
          <span class="img-Holder" style="background:url(/site_screenshots/13/94/ngmi/index.html.540x405.webp) no-repeat;">
            <img src="/img/placeholder.png" alt="ngmi.work" />
          </span>
        </a>
        <div class="site-info">
          <div class="site-stats hide-on-mobile">
            <a href="/site/ngmi" title="Visitors">
              <span>
                <i class="fa fa-eye"></i>
              </span>
                258,083
            </a>
          </div>
          <div class="site-tags">
                <a class="" href="/browse?tag=pixelart">pixelart</a>,
                <a class="" href="/browse?tag=sound">sound</a>
          </div>
        </div>
      </li>
      <li id="username_cinni">
        <a href="https://cinni.net" class="neo-Screen-Shot" title="&#9825; cinni&#39;s dream home &#9825;">
          <span class="img-Holder" style="background:url(/site_screenshots/22/51/cinni/index.html.540x405.webp) no-repeat;"></span>
        </a>
      </li>
</ul>`

const GOSSIPS = `<main class="directory list">
<article id="239">
            <div class="dot" style="background-color: #b3344c"></div>
            <div class="info">
            <a href="https://maddybruster.com/" class="website" title="maddybruster.com">maddybruster.com</a>
            <div class="tags">
                  <a href="/tags/designer">designer</a>,
                  <a href="/tags/new york">new york</a>
            </div>
        </article>
<article id="240"><a href="/submit">submit yours</a></article>
</main>`

const USELESS = `  var sitesList = [
    'https://sliding.toys/mystic-square/8-puzzle/daily/',
    'https://longdogechallenge.com/',
    "https://optical.toys/troxler-fade/",
    'https://longdogechallenge.com/',
    'https://theuselessweb.com/sites/',
  ]`

test("Neocities' gallery: each site's address, name, visitors, tags and Neocities' own screenshot", () => {
  const sites = parseNeocitiesBrowse(NEOCITIES)
  assert.equal(sites.length, 2)
  assert.deepEqual(sites[0], {
    url: 'https://ngmi.neocities.org/', title: 'ngmi.work', tags: ['pixelart', 'sound'], visitors: 258_083, name: 'ngmi',
    image: 'https://neocities.org/site_screenshots/13/94/ngmi/index.html.540x405.webp',
  })
  assert.equal(sites[1].url, 'https://cinni.net/', 'a site under its own name is still one')
  assert.equal(sites[1].title, "♡ cinni's dream home ♡")
})

test("Gossip's Web: the handmade sites, not the directory's own links", () => {
  assert.deepEqual(parseGossipsWeb(GOSSIPS), [{ url: 'https://maddybruster.com/', title: 'maddybruster.com', tags: ['designer', 'new york'] }])
})

test('The Useless Web: each toy once, never the list itself', () => {
  assert.deepEqual(parseUselessWeb(USELESS).map((site) => site.url), ['https://sliding.toys/mystic-square/8-puzzle/daily/', 'https://longdogechallenge.com/', 'https://optical.toys/troxler-fade/'])
})
