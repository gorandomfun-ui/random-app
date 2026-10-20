/*
 * Test pages of 20 October: three ways to show a content's source under it on the Random page (Bandeau, Légende,
 * Onglet), on the owner's phone before anything is built in the page. The Bandeau page also tests Bilibili's own
 * picture over its phone player, whose black square hides the picture until it is touched. Static: nothing here
 * calls the site; the contents are real ones of the base.
 */
(function () {
  var PATHS = {"youtube": "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z", "dailymotion": "M21.823 7.327a11.928 11.928 0 0 0-2.606-3.814 12.126 12.126 0 0 0-3.866-2.57A12.246 12.246 0 0 0 10.617 0H1.831a.602.602 0 0 0-.609.603v3.764c0 .162.064.312.179.426l4.164 4.123a.612.612 0 0 0 .439.177h4.56c.806 0 1.56.313 2.125.88.557.559.856 1.296.843 2.075-.029 1.571-1.343 2.849-2.931 2.849h-6.74a.613.613 0 0 0-.432.176.619.619 0 0 0-.178.427v3.764c0 .162.063.312.178.427l4.139 4.099a.647.647 0 0 0 .476.21h2.572a12.276 12.276 0 0 0 4.733-.945 12.145 12.145 0 0 0 3.866-2.571 11.959 11.959 0 0 0 2.607-3.813c.633-1.479.956-3.051.956-4.67 0-1.619-.321-3.19-.956-4.669l.001-.005ZM2.441 4.118V1.982l2.945 2.755.001 2.297-2.946-2.916Zm4.975 17.813-2.945-2.917v-2.137l2.945 2.755v2.299Zm-2.004-5.832h5.19c2.248 0 4.107-1.807 4.147-4.03a4.027 4.027 0 0 0-1.192-2.937 4.203 4.203 0 0 0-2.996-1.239H6.606V5.216h3.996c1.831 0 3.553.706 4.849 1.986a6.724 6.724 0 0 1-.152 9.736 6.875 6.875 0 0 1-4.697 1.84H8.275L5.412 16.1v-.001Zm15.289.1a10.753 10.753 0 0 1-2.345 3.431 10.91 10.91 0 0 1-3.48 2.314 11.018 11.018 0 0 1-4.26.847H8.633v-2.814h1.916c2.145 0 4.161-.802 5.675-2.254a7.88 7.88 0 0 0 2.451-5.728c0-2.177-.87-4.21-2.451-5.728-1.514-1.454-3.528-2.254-5.675-2.254h-4.16L3.383 1.202h7.234c1.479 0 2.911.285 4.259.847a10.957 10.957 0 0 1 3.48 2.313 10.769 10.769 0 0 1 2.345 3.432c.571 1.33.86 2.743.86 4.202 0 1.46-.289 2.873-.86 4.203Z", "bilibili": "M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373Z", "giphy": "M2.666 0v24h18.668V8.666l-2.668 2.668v10H5.334V2.668H10L12.666 0zm10.668 0v8h8V5.334h-2.668V2.668H16V0", "wikipedia": "M12.09 13.119c-.936 1.932-2.217 4.548-2.853 5.728-.616 1.074-1.127.931-1.532.029-1.406-3.321-4.293-9.144-5.651-12.409-.251-.601-.441-.987-.619-1.139-.181-.15-.554-.24-1.122-.271C.103 5.033 0 4.982 0 4.898v-.455l.052-.045c.924-.005 5.401 0 5.401 0l.051.045v.434c0 .119-.075.176-.225.176l-.564.031c-.485.029-.727.164-.727.436 0 .135.053.33.166.601 1.082 2.646 4.818 10.521 4.818 10.521l.136.046 2.411-4.81-.482-1.067-1.658-3.264s-.318-.654-.428-.872c-.728-1.443-.712-1.518-1.447-1.617-.207-.023-.313-.05-.313-.149v-.468l.06-.045h4.292l.113.037v.451c0 .105-.076.15-.227.15l-.308.047c-.792.061-.661.381-.136 1.422l1.582 3.252 1.758-3.504c.293-.64.233-.801.111-.947-.07-.084-.305-.22-.812-.24l-.201-.021c-.052 0-.098-.015-.145-.051-.045-.031-.067-.076-.067-.129v-.427l.061-.045c1.247-.008 4.043 0 4.043 0l.059.045v.436c0 .121-.059.178-.193.178-.646.03-.782.095-1.023.439-.12.186-.375.589-.646 1.039l-2.301 4.273-.065.135 2.792 5.712.17.048 4.396-10.438c.154-.422.129-.722-.064-.895-.197-.172-.346-.273-.857-.295l-.42-.016c-.061 0-.105-.014-.152-.045-.043-.029-.072-.075-.072-.119v-.436l.059-.045h4.961l.041.045v.437c0 .119-.074.18-.209.18-.648.03-1.127.18-1.443.421-.314.255-.557.616-.736 1.067 0 0-4.043 9.258-5.426 12.339-.525 1.007-1.053.917-1.503-.031-.571-1.171-1.773-3.786-2.646-5.71l.053-.036z"}
  var CREAM = '#F8F5E6', DEEP = '#121210', INK = '#191916'
  var SAMPLES = [
    { kind: 'video', provider: 'youtube', theme: '#AF3BF2', label: 'VIDÉOS', icon: '/icons/Video.svg',
      title: 'JASUN MARJU FEAT LAILA AYU - NYIDAM JEMBLEM (OFFICIAL LIVE MUSIC VIDEO)', author: 'DC. PRODUCTION',
      url: 'https://youtu.be/s_0d65nje8E', embed: 'https://www.youtube.com/embed/s_0d65nje8E?playsinline=1&rel=0' },
    { kind: 'video', provider: 'dailymotion', theme: '#0FC55D', label: 'VIDÉOS', icon: '/icons/Video.svg',
      title: 'Heroic moment woman and her dogs are rescued from frozen pond', author: null,
      url: 'https://www.dailymotion.com/video/x9cbsyu', embed: 'https://geo.dailymotion.com/player/x1nqcm.html?video=x9cbsyu' },
    { kind: 'bilibili', provider: 'bilibili', theme: '#E5972B', label: 'VIDÉOS', icon: '/icons/Video.svg',
      title: '听我的，赶紧回县城！', author: '写手一条城', url: 'https://www.bilibili.com/video/BV1TPp26iEiJ',
      embed: 'https://player.bilibili.com/player.html?aid=117438817501454&cid=42736879859&page=1&autoplay=1&danmaku=0&high_quality=1',
      thumb: 'https://i2.hdslb.com/bfs/archive/7734b5103f3496bce5effcf7d13e2ef775a9a685.jpg' },
    { kind: 'gif', provider: 'giphy', theme: '#D90845', label: 'IMAGES', icon: '/icons/image.svg',
      title: 'And I Am Not Sorry — Jim Carrey', author: null, url: 'https://giphy.com/gifs/101HDlPpCsDDEI',
      gif: 'https://media1.giphy.com/media/101HDlPpCsDDEI/giphy.gif' },
    { kind: 'web', provider: 'web', theme: '#3D42CC', label: 'SITES', icon: '/icons/web.svg',
      title: 'Alsacias Television', domain: 'atv.hn', url: 'http://www.atv.hn/' },
    { kind: 'fact', provider: 'wikipedia', theme: '#FF978F', label: 'LE SAVIEZ-VOUS ?', icon: '/icons/fact.svg',
      text: 'Pour participer aux Jeux olympiques d’été de 1932, la délégation brésilienne a vendu du café sur le bateau qui la transportait.',
      title: 'Brésil aux Jeux olympiques d’été de 1932', author: 'Wikipédia',
      url: 'https://fr.wikipedia.org/wiki/Br%C3%A9sil_aux_Jeux_olympiques_d%27%C3%A9t%C3%A9_de_1932' },
  ]
  var GIPHY_BADGE = '/PoweredBy_640_Horizontal_Light-Backgrounds_With_Logo.gif'

  function esc(text) { return String(text).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  /** A platform's mark, once and never its name in words. YouTube keeps its own colours: red, white or almost black. */
  function mark(sample, tone, size) {
    if (sample.provider === 'web') return '<img src="/icons/web.svg" width="' + size + '" height="' + size + '" alt="" style="' + (tone === 'dark' ? 'filter:brightness(0.15)' : '') + '">'
    var colour = tone === 'dark' ? '#1C1C1A' : tone === 'theme' && sample.provider !== 'youtube' ? sample.theme : '#FFFFFF'
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" aria-label="' + sample.provider + '" role="img"><path fill="' + colour + '" d="' + PATHS[sample.provider] + '"/></svg>'
  }
  function meta(sample) { return sample.kind === 'web' ? sample.domain : sample.author }

  function frame(sample, style, index) {
    if (sample.kind === 'video') return '<div class="frame"><iframe src="' + sample.embed + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title="' + esc(sample.title) + '"></iframe></div>'
    if (sample.kind === 'bilibili') return bilibiliFrame(sample, style === 'bandeau' ? ['un', 'deux'] : ['un'], index)
    if (sample.kind === 'gif') return '<div class="frame gif"><img src="' + sample.gif + '" alt="' + esc(sample.title) + '"></div>'
    if (sample.kind === 'web') return '<div class="frame web"><div><span class="dom">' + esc(sample.domain) + '</span><span class="hint">Le site s’ouvrirait ici, dans Random</span></div></div>'
    return '<div class="frame fact"><p>' + esc(sample.text) + '</p></div>'
  }

  /**
   * Bilibili's phone player: its black square with its play button hides the picture until touched. "un": our
   * picture over it lets the touch through to the player, and goes away when the page sees the touch reach it
   * (window blur or the player's focus). "deux": our picture takes the first touch and goes away, the player's own
   * button takes the second.
   */
  function bilibiliFrame(sample, ways, index) {
    return ways.map(function (way) {
      var id = 'bili-' + index + '-' + way
      return '<div class="bili-way">' + (ways.length > 1 ? '<p class="way">' + (way === 'un' ? 'Essai A — un seul toucher' : 'Essai B — deux touchers') + '</p>' : '') +
        '<div class="frame bili" id="' + id + '" data-way="' + way + '">' +
        '<img class="blur" src="' + sample.thumb + '" referrerpolicy="no-referrer" alt="">' +
        '<iframe src="' + sample.embed + '" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title="' + esc(sample.title) + '"></iframe>' +
        '<div class="poster' + (way === 'un' ? ' through' : '') + '"><img src="' + sample.thumb + '" referrerpolicy="no-referrer" alt=""><span class="play" aria-hidden="true"></span></div>' +
        '</div><p class="log" id="' + id + '-log">' + (way === 'un' ? 'Touche le bouton : la vidéo doit démarrer et l’image partir d’elle-même.' : 'Touche l’image, puis le bouton de lecture de Bilibili.') + '</p>' +
        (way === 'un' ? '<button class="spare" data-for="' + id + '">L’image reste ? Touche ici pour l’enlever</button>' : '') + '</div>'
    }).join('')
  }

  function bandeau(sample) {
    if (sample.provider === 'giphy') return '<div class="src bandeau giphy"><span class="rule"></span><img class="badge" src="' + GIPHY_BADGE + '" alt="Powered by GIPHY"><span class="title">' + esc(sample.title) + '</span><a class="open" href="' + sample.url + '" target="_blank" rel="noreferrer" aria-label="Ouvrir la source">↗</a></div>'
    var m = meta(sample)
    return '<div class="src bandeau"><span class="rule"></span>' + mark(sample, 'light', 18) + '<span class="title">' + esc(sample.title) + '</span>' + (m ? '<span class="sep">│</span><span class="author">' + esc(m) + '</span>' : '') + '<a class="open" href="' + sample.url + '" target="_blank" rel="noreferrer" aria-label="Ouvrir la source">↗</a></div>'
  }
  function legende(sample) {
    var m = meta(sample)
    var line = sample.provider === 'giphy'
      ? '<img class="badge small" src="' + GIPHY_BADGE + '" alt="Powered by GIPHY">'
      : mark(sample, 'theme', 13) + (m ? '<span>' + esc(m) + '</span>' : '')
    return '<div class="src legende"><div class="scan"></div><div class="title glitch" data-text="' + esc(sample.title) + '">' + esc(sample.title) + '</div><div class="meta">' + line + '<a class="open" href="' + sample.url + '" target="_blank" rel="noreferrer" aria-label="Ouvrir la source">↗</a></div></div>'
  }
  function tab(sample) {
    if (sample.provider === 'giphy') return '<span class="tab giphy"><img class="badge" src="' + GIPHY_BADGE + '" alt="Powered by GIPHY"></span>'
    var m = meta(sample)
    return '<span class="tab">' + mark(sample, 'dark', 15) + (m ? '<span class="who">' + esc(m) + '</span>' : '') + '</span>'
  }
  function onglet(sample) { return '<div class="src onglet"><a href="' + sample.url + '" target="_blank" rel="noreferrer">' + esc(sample.title) + '</a></div>' }

  function screen(sample, style, index) {
    return '<section class="screen" style="--c:' + sample.theme + '">' +
      '<div class="bar"><img src="' + sample.icon + '" alt=""><span class="label">' + sample.label + '</span>' + (style === 'onglet' ? tab(sample) : '') + '</div>' +
      frame(sample, style, index) +
      (style === 'bandeau' ? bandeau(sample) : style === 'legende' ? legende(sample) : onglet(sample)) +
      '<div class="actions"><img src="/icons/Heart.svg" alt="" class="heart"><span class="encore">ENCORE</span><img src="/icons/share.svg" alt="" class="share"></div></section>'
  }

  function wireBilibili() {
    document.querySelectorAll('.frame.bili').forEach(function (box) {
      var poster = box.querySelector('.poster'), iframe = box.querySelector('iframe'), log = document.getElementById(box.id + '-log')
      var started = Date.now(), done = false
      function hide(why) {
        if (done) return
        done = true
        poster.classList.add('gone')
        if (log) log.textContent = 'Image enlevée (' + why + ', ' + ((Date.now() - started) / 1000).toFixed(1) + ' s). Dis-moi si la vidéo joue.'
      }
      if (box.dataset.way === 'deux') {
        poster.addEventListener('click', function () { hide('premier toucher') })
        return
      }
      // The touch goes through our picture to Bilibili's player: the page only sees its focus leave for the player.
      window.addEventListener('blur', function () { setTimeout(function () { if (document.activeElement === iframe) hide('toucher vu par la page') }, 0) })
      var poll = setInterval(function () { if (done) return clearInterval(poll); if (document.activeElement === iframe) hide('le lecteur a pris la main') }, 250)
      window.addEventListener('message', function (event) {
        if (!/bilibili/.test(event.origin)) return
        var text = typeof event.data === 'string' ? event.data : JSON.stringify(event.data)
        if (log && !done) log.textContent = 'Message de Bilibili : ' + String(text).slice(0, 90)
      })
      var spare = document.querySelector('.spare[data-for="' + box.id + '"]')
      if (spare) spare.addEventListener('click', function () { hide('bouton de secours') })
    })
  }

  window.renderEssai = function (style) {
    var root = document.getElementById('screens')
    root.innerHTML = SAMPLES.map(function (sample, index) { return screen(sample, style, index) }).join('')
    wireBilibili()
    // The title's glitch on arrival, as a new content comes: once on load, again on demand.
    var again = document.getElementById('again')
    if (again) again.addEventListener('click', function () {
      document.querySelectorAll('.glitch').forEach(function (el) { el.classList.remove('run'); void el.offsetWidth; el.classList.add('run') })
    })
    document.querySelectorAll('.glitch').forEach(function (el) { el.classList.add('run') })
  }
})()
