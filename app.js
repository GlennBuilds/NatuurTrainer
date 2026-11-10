// Natuur — leer de flora en fauna van Nederland herkennen.
// Geen framework, geen build-stap: alles in deze module.

const CATS = [
  { id: 'vogels', name: 'Vogels', cover: 'ijsvogel' },
  { id: 'zoogdieren', name: 'Zoogdieren', cover: 'vos' },
  { id: 'bomen', name: 'Bomen & struiken', cover: 'zomereik' },
  { id: 'bloemen', name: 'Wilde bloemen', cover: 'grote-klaproos' },
  { id: 'paddenstoelen', name: 'Paddenstoelen', cover: 'vliegenzwam' },
  { id: 'vlinders', name: 'Vlinders', cover: 'dagpauwoog' },
  { id: 'insecten', name: 'Insecten & kleine dieren', cover: 'zevenstippelig-lieveheersbeestje' },
  { id: 'amfibieen', name: 'Amfibieën & reptielen', cover: 'boomkikker' },
];
const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));
const ALL_CATS = CATS.map(c => c.id);

const HOUR = 36e5, DAY = 24 * HOUR;
const INTERVAL = [0, 10 * 60e3, DAY, 3 * DAY, 8 * DAY, 21 * DAY]; // per niveau 0–5
const LEARNED = 3;
const KEY = 'natuur.v1';

const ICON = {
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  cross: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 8 13"><path d="M1.5 1.5l5 5-5 5"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 4.5L7.5 12l7.5 7.5"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.8v14.4a1.2 1.2 0 0 0 1.8 1l11.5-7.2a1.2 1.2 0 0 0 0-2L8.8 3.8A1.2 1.2 0 0 0 7 4.8Z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><path d="M10 3a7 7 0 0 1 5.6 11.2l4.6 4.6a1 1 0 0 1-1.4 1.4l-4.6-4.6A7 7 0 1 1 10 3Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"/></svg>',
  close: '<svg viewBox="0 0 12 12"><path d="M1.5 1.5l9 9M10.5 1.5l-9 9"/></svg>',
};

// ---------- Opslag ----------
const defaults = () => ({ settings: { cats: [...ALL_CATS], mode: 'quiz', region: 'nl', len: 10 }, prog: {}, days: [] });
let store = loadStore();
function loadStore() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.settings) return { ...defaults(), ...s, settings: { ...defaults().settings, ...s.settings } };
  } catch { /* leeg of geblokkeerd */ }
  return defaults();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* privémodus */ } }
const P = id => store.prog[id];

// ---------- Hulpjes ----------
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rnd = a => a[Math.random() * a.length | 0];
const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const img = (sp, i = 0, size = 'large') => sp.photos[i % sp.photos.length].u.replace('{s}', size);
const credit = (sp, i = 0) => { const p = sp.photos[i % sp.photos.length]; return `${p.a}, ${p.l.replace('-', ' ')}`; };
const today = () => new Date().toISOString().slice(0, 10);
const plural = (n, one, more) => `${n} ${n === 1 ? one : more}`;

let SPECIES = [], BY_ID = {}, DATA_DATE = '';
let INFO = null, infoP = null;
function loadInfo() {
  infoP ||= fetch('data/info.json?v=1').then(r => r.json()).then(d => (INFO = d)).catch(() => { infoP = null; return null; });
  return infoP;
}

function pool(settings = store.settings) {
  return SPECIES.filter(s => settings.cats.includes(s.cat) && (settings.region === 'nl' || s.bestObs > 0));
}
function obsKey(s) { return store.settings.region === 'best' ? s.bestObs * 50 + s.nlObs : s.nlObs; }
function isDue(s, now = Date.now()) { const p = P(s.id); return p && p.n > 0 && p.due <= now; }
function boxOf(id) { return P(id)?.b || 0; }
function cover(cat) { return BY_ID[CAT[cat].cover] || SPECIES.find(s => s.cat === cat); }
function dots5(id, cls = 'dots5') {
  const b = boxOf(id);
  return `<span class="${cls}" aria-label="niveau ${b} van 5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= b ? 'on' : ''}"></i>`).join('')}</span>`;
}
function ring(frac, size, label, stroke = 9) {
  const r = 50 - stroke / 2 - 1, c = 2 * Math.PI * r;
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 100 100"><circle class="bgc" cx="50" cy="50" r="${r}" stroke-width="${stroke}"/><circle class="fgc" cx="50" cy="50" r="${r}" stroke-width="${stroke}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}"/></svg><div class="pct">${label}</div></div>`;
}
function hash(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// ---------- Router ----------
const view = { tab: 'leren', gidsCat: 'alles', query: '', scroll: {} };

function route() {
  const [, a, b] = (location.hash || '#/leren').split('/');
  if (a === 'soort' && BY_ID[b]) return renderDetail(BY_ID[b]);
  view.tab = ['leren', 'gids', 'voortgang'].includes(a) ? a : 'leren';
  if (view.tab === 'gids' && b) view.gidsCat = CAT[b] ? b : 'alles';
  renderTab();
}
function go(hash) { if (location.hash !== hash) location.hash = hash; else route(); }
function setActiveTab(tab) { document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab)); }

function renderTab() {
  setActiveTab(view.tab);
  $('#app').innerHTML = { leren: pageLeren, gids: pageGids, voortgang: pageVoortgang }[view.tab]();
  window.scrollTo(0, view.scroll[view.tab] || 0);
  onScroll();
  if (view.tab === 'gids') bindSearch();
}

function navbar(title, { back = false } = {}) {
  return `<header class="navbar" data-threshold="${back ? 'photo' : 40}">
    <div>${back ? `<button class="round-btn glass" data-act="back" aria-label="Terug">${ICON.back}</button>` : ''}</div>
    <div class="title">${esc(title)}</div><div></div></header>`;
}
function onScroll() {
  const nb = document.querySelector('.navbar');
  if (!nb) return;
  const th = nb.dataset.threshold === 'photo' ? ($('.photo-hero')?.offsetHeight || 300) - 90 : 40;
  nb.classList.toggle('solid', window.scrollY > th);
}
window.addEventListener('scroll', () => { onScroll(); if (!location.hash.startsWith('#/soort')) view.scroll[view.tab] = window.scrollY; }, { passive: true });

// ---------- Leren ----------
function pageLeren() {
  const s = store.settings;
  const pl = pool();
  const learned = pl.filter(x => boxOf(x.id) >= LEARNED).length;
  const due = pl.filter(x => isDue(x)).length;
  const all = s.cats.length === ALL_CATS.length;
  const count = cat => SPECIES.filter(x => x.cat === cat && (s.region === 'nl' || x.bestObs > 0)).length;
  const st = streak();
  const day = pl.length ? pl[hash(today() + s.cats.join()) % pl.length] : SPECIES[0];
  const dateTxt = new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });

  const status = due ? plural(due, 'soort om te herhalen', 'soorten om te herhalen')
    : learned === pl.length && pl.length ? 'Alles geleerd, knap!'
    : `${pl.length - pl.filter(x => P(x.id)?.n).length} nieuw`;

  return `<main class="page">
    ${navbar('Leren')}
    <div class="head">
      <div><h1 class="large-title">Leren</h1><div class="sub">${dateTxt.charAt(0).toUpperCase() + dateTxt.slice(1)}</div></div>
      ${st > 1 ? `<span class="streak">🔥 ${st}</span>` : ''}
    </div>

    <section class="hero">
      <img src="${img(day, 0)}" alt="">
      <a class="hero-top" href="#/soort/${day.id}">
        <div><div class="hero-tag">Soort van de dag</div><div class="hero-name">${esc(day.nl)}</div></div>
      </a>
      <div class="hero-panel glass">
        ${ring(pl.length ? learned / pl.length : 0, 52, `${pl.length ? Math.round(100 * learned / pl.length) : 0}%`, 10)}
        <div class="txt"><div class="big">${learned}/${pl.length} geleerd</div><div class="small">${status}</div></div>
        <button class="play" data-act="start" ${pl.length < 4 ? 'disabled' : ''}>${ICON.play}Start</button>
      </div>
    </section>

    <section class="block">
      <h2 class="h2">Wat wil je leren?</h2>
      <div class="tiles ${all ? '' : 'some'}">
        <button class="tile wide ${all ? 'on' : ''}" data-act="cat-all">
          <span class="mosaic">${['eekhoorn', 'koolmees', 'dotterbloem', 'gehakkelde-aurelia'].filter(id => BY_ID[id]).map(id => `<img src="${img(BY_ID[id], 0, 'small')}" alt="">`).join('')}</span>
          <span class="nm">Alles door elkaar<span class="ct">${pool({ ...s, cats: ALL_CATS }).length} soorten</span></span>
          <span class="tick">${ICON.check}</span>
        </button>
        ${CATS.map(c => `
        <button class="tile ${!all && s.cats.includes(c.id) ? 'on' : ''}" data-act="cat" data-id="${c.id}" aria-pressed="${s.cats.includes(c.id)}">
          <img src="${img(cover(c.id), 0, 'medium')}" alt="" loading="lazy">
          <span class="nm">${c.name}<span class="ct">${count(c.id)} soorten</span></span>
          <span class="tick">${ICON.check}</span>
        </button>`).join('')}
      </div>
      <p class="foot-note">Tik op een categorie om alleen die te oefenen, of op meerdere om ze te combineren.</p>
    </section>

    <section class="block">
      <h2 class="h2">Instellingen</h2>
      <div class="group">
        <div class="setting"><div class="lbl">Oefenvorm</div>${seg('mode', [['quiz', 'Quiz'], ['kaarten', 'Flitskaarten']], s.mode)}
          <div class="hint">${s.mode === 'quiz' ? 'Kies uit vier namen of vier foto’s. Nieuwe soorten zie je eerst voordat ze gevraagd worden.' : 'Bekijk de foto, bedenk de naam en draai de kaart om.'}</div></div>
        <div class="setting"><div class="lbl">Gebied</div>${seg('region', [['nl', 'Heel Nederland'], ['best', 'Rond Best']], s.region)}</div>
        <div class="setting"><div class="lbl">Soorten per ronde</div>${seg('len', [[10, '10'], [20, '20'], [30, '30']], s.len)}</div>
      </div>
      <p class="foot-note">Nieuwe soorten komen in volgorde van hoe vaak ze worden gezien: de algemeenste eerst. Wat je fout doet komt snel terug, wat je kent pas na een paar dagen.</p>
    </section>
  </main>`;
}
function seg(key, opts, cur) {
  return `<div class="seg" role="tablist">${opts.map(([v, l]) => `<button role="tab" aria-selected="${v == cur}" class="${v == cur ? 'on' : ''}" data-act="set" data-key="${key}" data-val="${v}">${l}</button>`).join('')}</div>`;
}
function streak() {
  const set = new Set(store.days);
  let n = 0; const d = new Date();
  if (!set.has(today())) d.setDate(d.getDate() - 1);
  while (set.has(d.toISOString().slice(0, 10))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// ---------- Gids ----------
function pageGids() {
  return `<main class="page">
    ${navbar('Gids')}
    <div class="head"><h1 class="large-title">Gids</h1></div>
    <div class="search">${ICON.search}<input id="q" type="search" placeholder="Zoek een soort" value="${esc(view.query)}" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search"></div>
    <div class="pills">
      <button class="pill ${view.gidsCat === 'alles' ? 'on' : ''}" data-act="gcat" data-id="alles">Alles</button>
      ${CATS.map(c => `<button class="pill ${view.gidsCat === c.id ? 'on' : ''}" data-act="gcat" data-id="${c.id}">${c.name}</button>`).join('')}
    </div>
    <div id="gids-list">${gidsList()}</div>
  </main>`;
}
function gidsList() {
  const q = fold(view.query.trim());
  const cats = view.gidsCat === 'alles' ? CATS : [CAT[view.gidsCat]];
  let html = '';
  for (const c of cats) {
    const items = SPECIES.filter(s => s.cat === c.id && (!q || fold(s.nl).includes(q) || fold(s.sci).includes(q)))
      .sort((a, b) => a.nl.localeCompare(b.nl, 'nl'));
    if (!items.length) continue;
    html += `<section class="block">
      ${cats.length > 1 ? `<h2 class="h2">${c.name}<small>${items.length}</small></h2>` : ''}
      <div class="grid">${items.map(s => `<a class="card" href="#/soort/${s.id}">
        <img loading="lazy" src="${img(s, 0, 'medium')}" alt="">
        ${P(s.id)?.n ? dots5(s.id, 'lv glass') : ''}
        <span class="nm">${esc(s.nl)}<span class="sc">${esc(s.sci)}</span></span></a>`).join('')}
      </div></section>`;
  }
  return html || `<p class="empty">Geen soort gevonden met “${esc(view.query)}”. Probeer een deel van de naam.</p>`;
}
function bindSearch() {
  const inp = $('#q');
  inp?.addEventListener('input', () => { view.query = inp.value; $('#gids-list').innerHTML = gidsList(); });
}

// ---------- Detail ----------
function renderDetail(s) {
  setActiveTab('gids');
  const p = P(s.id);
  const c = CAT[s.cat];
  const status = !p?.n ? 'Nog niet geoefend' : p.b >= 5 ? 'Beheerst' : p.b >= LEARNED ? 'Geleerd' : 'Bezig met leren';
  $('#app').innerHTML = `<main class="page detail-page push">
    ${navbar(s.nl, { back: true })}
    <div class="photo-hero">
      <div class="gallery" id="gal">${s.photos.map((ph, i) => `<figure><img ${i > 1 ? 'loading="lazy"' : ''} src="${img(s, i)}" alt="${esc(s.nl)}, foto ${i + 1} van ${s.photos.length}"><figcaption>${esc(credit(s, i))}</figcaption></figure>`).join('')}</div>
      ${s.photos.length > 1 ? `<div class="dots glass" id="dots">${s.photos.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}
    </div>
    <div class="sheet-body">
      <h1 class="d-title">${esc(s.nl)}</h1>
      <div class="d-sci">${esc(s.sci)}</div>
      <div class="chips d-chips">
        <a class="chip" href="#/gids/${c.id}">${c.name}</a>
        ${s.bestObs > 0 ? '<span class="chip green">Gezien rond Best</span>' : ''}
        ${rarity(s)}
      </div>
      <div class="panel tip"><h3>Zo herken je hem</h3><p>${esc(s.tip)}</p></div>
      <div class="info" data-info="${s.id}" data-links="1"></div>
      <div class="block" style="margin-top:28px">
        <h2 class="h2">Jouw voortgang</h2>
        <div class="list">
          <div class="row"><span class="main">Status</span><span class="detail">${status}</span></div>
          <div class="row"><span class="main">Niveau</span>${dots5(s.id)}</div>
          ${p?.n ? `<div class="row"><span class="main">Goed beantwoord</span><span class="detail">${p.ok} van ${p.n}</span></div>` : ''}
        </div>
      </div>
      <div class="block"><div class="list">
        <a class="row link" href="https://www.inaturalist.org/taxa/${s.inat}" target="_blank" rel="noopener"><span class="main">Bekijk op iNaturalist</span>${ICON.chev}</a>
        <a class="row link" href="https://waarneming.nl/search/?q=${encodeURIComponent(s.sci)}" target="_blank" rel="noopener"><span class="main">Zoek op Waarneming.nl</span>${ICON.chev}</a>
      </div></div>
    </div>
  </main>`;
  window.scrollTo(0, 0);
  onScroll();
  fillInfo();
  const gal = $('#gal'), dots = $('#dots');
  if (gal && dots) gal.addEventListener('scroll', () => {
    const i = Math.round(gal.scrollLeft / gal.clientWidth);
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
  }, { passive: true });
}
// ---------- Meer over een soort (kenmerken, seizoen, lijkt op) ----------
const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

function fillInfo() {
  document.querySelectorAll('[data-info]:not(.filled)').forEach(el => {
    const draw = () => {
      if (!el.isConnected) return;
      el.classList.add('filled');
      el.innerHTML = infoHTML(BY_ID[el.dataset.info], INFO?.[el.dataset.info], el.dataset.links === '1');
    };
    if (INFO) draw();
    else { el.innerHTML = '<p class="info-wait">Meer informatie laden…</p>'; loadInfo().then(draw); }
  });
}

function seasonText(m) {
  const hi = m.map(v => v >= 50);
  if (hi.filter(Boolean).length >= 10) return 'Het hele jaar door te zien.';
  // aaneengesloten perioden (ook over de jaargrens heen)
  const start = hi.findIndex((v, i) => !v && hi[(i + 1) % 12]) + 1;
  const runs = [];
  for (let k = 0; k < 12; k++) {
    const i = (start + k) % 12;
    if (!hi[i]) continue;
    const last = runs[runs.length - 1];
    if (last && (last[1] + 1) % 12 === i) last[1] = i; else runs.push([i, i]);
  }
  const part = ([a, b]) => a === b ? `in ${MONTHS[a]}` : `van ${MONTHS[a]} tot en met ${MONTHS[b]}`;
  return `Meest waargenomen ${runs.map(part).join(' en ')}.`;
}

function seasonHTML(m) {
  const now = new Date().getMonth();
  const v = m[now];
  const nowTxt = v >= 50 ? 'een goede tijd om hem te zien' : v >= 20 ? 'af en toe te zien' : 'weinig gezien';
  return `<section class="panel season">
    <h3>Wanneer te zien</h3>
    <p>${seasonText(m)} Nu, in ${MONTHS[now]}: ${nowTxt}.</p>
    <div class="months" role="img" aria-label="Waarnemingen per maand, hoogste in ${MONTHS[m.indexOf(100)]}">
      ${m.map((x, i) => `<div class="mo ${i === now ? 'now' : ''}" title="${MONTHS[i]}: ${x}% van de drukste maand"><i style="height:${Math.max(x, 3)}%"></i><span>${MONTHS[i][0].toUpperCase()}</span></div>`).join('')}
    </div>
    <div class="src">Waarnemingen per maand in Nederland, via iNaturalist</div>
  </section>`;
}

function similarHTML(sim, links) {
  const ours = sim.filter(x => x.id && BY_ID[x.id]).map(x => BY_ID[x.id]);
  const other = sim.filter(x => !x.id);
  if (!ours.length && !other.length) return '';
  const tag = links ? 'a' : 'div';
  return `<section class="panel similar">
    <h3>Wordt vaak verward met</h3>
    ${ours.length ? `<div class="sim-row">${ours.map(o => `<${tag} class="sim" ${links ? `href="#/soort/${o.id}"` : ''}>
      <img src="${img(o, 0, 'medium')}" alt="" loading="lazy"><span>${esc(o.nl)}</span></${tag}>`).join('')}</div>` : ''}
    ${other.length ? `<p class="sim-other">${ours.length ? 'Ook: ' : ''}${other.map(o => `${esc(o.n)} <i>(${esc(o.s)})</i>`).join(', ')}</p>` : ''}
    <div class="src">Op basis van verbeterde determinaties op iNaturalist</div>
  </section>`;
}

function infoHTML(s, inf, links) {
  if (!s) return '';
  const sec = inf?.sec || [];
  const panel = x => `<section class="panel"><h3>${esc(x.h)}</h3><p>${esc(x.t)}</p></section>`;
  const pick = h => sec.filter(x => x.h === h).map(panel).join('');
  const rest = sec.filter(x => !['Kenmerken', 'Verschil met lijkende soorten'].includes(x.h)).map(panel).join('');
  return `
    ${s.wiki ? `<section class="panel"><h3>Over deze soort</h3><p>${esc(s.wiki.t)}</p></section>` : ''}
    ${pick('Kenmerken')}
    ${inf?.sim ? similarHTML(inf.sim, links) : ''}
    ${pick('Verschil met lijkende soorten')}
    ${inf?.m ? seasonHTML(inf.m) : ''}
    ${rest}
    ${s.wiki ? `<p class="info-src">Teksten van <a href="${esc(s.wiki.u)}" target="_blank" rel="noopener">Wikipedia</a> (CC BY-SA), soms ingekort.</p>` : ''}`;
}

function rarity(s) {
  const sorted = SPECIES.filter(x => x.cat === s.cat).map(x => x.nlObs).sort((a, b) => b - a);
  const rank = sorted.indexOf(s.nlObs) / sorted.length;
  return `<span class="chip">${rank < .33 ? 'Algemeen' : rank < .75 ? 'Vrij algemeen' : 'Minder vaak gezien'}</span>`;
}

// ---------- Voortgang ----------
function pageVoortgang() {
  const now = Date.now();
  const learned = SPECIES.filter(s => boxOf(s.id) >= LEARNED).length;
  const busy = SPECIES.filter(s => P(s.id)?.n && boxOf(s.id) < LEARNED).length;
  const due = SPECIES.filter(s => isDue(s, now)).length;
  const answers = Object.values(store.prog).reduce((a, p) => a + (p.n || 0), 0);
  const hard = SPECIES.filter(s => P(s.id)?.miss).sort((a, b) => (P(b.id).miss / P(b.id).n) - (P(a.id).miss / P(a.id).n) || P(b.id).miss - P(a.id).miss).slice(0, 6);

  return `<main class="page">
    ${navbar('Voortgang')}
    <div class="head"><h1 class="large-title">Voortgang</h1></div>
    <div class="stats">
      <div class="stat" style="--c:var(--accent)"><div class="v">${learned}</div><div class="l">Geleerd</div></div>
      <div class="stat" style="--c:#D4A000"><div class="v">${busy}</div><div class="l">Mee bezig</div></div>
      <div class="stat" style="--c:var(--orange)"><div class="v">${due}</div><div class="l">Om te herhalen</div></div>
      <div class="stat" style="--c:var(--red)"><div class="v">${streak()}</div><div class="l">Dagen op rij</div></div>
    </div>

    <section class="block">
      <h2 class="h2">Per categorie</h2>
      <div class="list">
        ${CATS.map(c => {
          const items = SPECIES.filter(s => s.cat === c.id);
          const l = items.filter(s => boxOf(s.id) >= LEARNED).length;
          const b = items.filter(s => P(s.id)?.n && boxOf(s.id) < LEARNED).length;
          return `<a class="row" href="#/gids/${c.id}" style="--inset:68px">
            <img class="av round" src="${img(cover(c.id), 0, 'small')}" alt="">
            <span class="main"><div class="t">${c.name}</div>
              <div class="bar"><i style="width:${100 * l / items.length}%;background:var(--accent)"></i><i style="width:${100 * b / items.length}%;background:var(--yellow)"></i></div></span>
            <span class="detail">${l}/${items.length}</span>${ICON.chev}</a>`;
        }).join('')}
      </div>
      <p class="foot-note">Een soort telt als geleerd als je hem drie keer goed hebt, verspreid over meerdere dagen. Je hebt in totaal ${plural(answers, 'antwoord', 'antwoorden')} gegeven.</p>
    </section>

    ${hard.length ? `<section class="block">
      <h2 class="h2">Lastigste soorten</h2>
      <div class="list">${hard.map(s => `<a class="row" href="#/soort/${s.id}" style="--inset:68px">
        <img class="av" loading="lazy" src="${img(s, 0, 'small')}" alt="">
        <span class="main"><div class="t">${esc(s.nl)}</div><div class="s">${P(s.id).miss} keer fout van de ${P(s.id).n}</div></span>${ICON.chev}</a>`).join('')}
      </div></section>` : ''}

    <section class="block">
      <h2 class="h2">Over deze app</h2>
      <div class="list">
        <div class="row"><span class="main">Soorten</span><span class="detail">${SPECIES.length}</span></div>
        <div class="row"><span class="main">Gegevens bijgewerkt</span><span class="detail">${esc(DATA_DATE)}</span></div>
      </div>
      <p class="foot-note">Foto’s en waarnemingen komen van iNaturalist, met de licentie van de fotograaf. Teksten komen van de Nederlandstalige Wikipedia (CC BY-SA). Je voortgang blijft op dit apparaat.</p>
    </section>

    <section class="block"><div class="list"><button class="row danger" data-act="reset">Voortgang wissen</button></div></section>
  </main>`;
}

// ---------- Sessie ----------
let S = null;

function buildSession() {
  const s = store.settings;
  const pl = pool();
  const now = Date.now();
  const L = Math.min(s.len, pl.length);
  const seen = pl.filter(x => P(x.id)?.n);
  const due = shuffle(seen.filter(x => isDue(x, now))).sort((a, b) => boxOf(a.id) - boxOf(b.id));
  // nieuwe soorten: per categorie de algemeenste eerst, om en om over de categorieën
  const byCat = {};
  for (const x of pl.filter(x => !P(x.id)?.n)) (byCat[x.cat] ||= []).push(x);
  Object.values(byCat).forEach(a => a.sort((p, q) => obsKey(q) - obsKey(p)));
  const fresh = [];
  const lists = shuffle(Object.values(byCat));
  for (let i = 0; lists.some(a => a.length > i); i++) lists.forEach(a => a[i] && fresh.push(a[i]));
  const learning = seen.filter(x => boxOf(x.id) < LEARNED).length;
  const maxNew = learning > 25 ? Math.ceil(L * .2) : Math.ceil(L * .5);
  const nNew = Math.min(fresh.length, Math.max(L - due.length, Math.min(maxNew, L)));
  let items = [...due.slice(0, L - Math.min(nNew, L)), ...fresh.slice(0, nNew)];
  if (items.length < L) {
    const rest = seen.filter(x => !items.includes(x)).sort((a, b) => boxOf(a.id) - boxOf(b.id) || P(a.id).due - P(b.id).due);
    items.push(...rest.slice(0, L - items.length));
  }
  items = shuffle(items.slice(0, L));

  const steps = [];
  if (s.mode === 'kaarten') {
    items.forEach(sp => steps.push({ type: 'card', sp, photo: Math.random() * sp.photos.length | 0 }));
  } else {
    const pending = [];
    const flush = force => {
      for (let i = pending.length - 1; i >= 0; i--) if (force || --pending[i].wait <= 0) steps.push(pending.splice(i, 1)[0].q);
    };
    for (const sp of items) {
      if (!P(sp.id)?.n) {
        steps.push({ type: 'intro', sp, photo: 0 });
        flush();
        pending.push({ q: makeQuestion(sp, true), wait: 2 });
      } else {
        steps.push(makeQuestion(sp));
        flush();
      }
    }
    flush(true);
  }
  return { steps, i: 0, results: [], retried: new Set(), mode: s.mode };
}

function makeQuestion(sp, justIntroduced = false) {
  const others = sp.photos.length > 1 ? sp.photos.map((_, i) => i).filter(i => !justIntroduced || i !== 0) : [0];
  const type = !justIntroduced && Math.random() < .35 ? 'pick' : 'name';
  const opts = shuffle([sp, ...distractors(sp, 3)]);
  return { type, sp, opts, photo: rnd(others), photos: opts.map(o => o === sp ? rnd(others) : Math.random() * o.photos.length | 0) };
}

function distractors(sp, n) {
  const shared = o => sp.anc.filter(a => o.anc.includes(a)).length;
  const cands = shuffle(SPECIES.filter(o => o.cat === sp.cat && o.id !== sp.id)).sort((a, b) => shared(b) - shared(a));
  const close = shuffle(cands.slice(0, 6)).slice(0, n - 1);
  const far = shuffle(cands.filter(o => !close.includes(o))).slice(0, n - close.length);
  return [...close, ...far];
}

function record(sp, ok) {
  const p = store.prog[sp.id] ||= { b: 0, n: 0, ok: 0, miss: 0 };
  const first = p.n === 0;
  p.n++;
  if (ok) { p.ok++; p.b = Math.min(5, p.b + (first && S.mode === 'kaarten' ? 2 : 1)); }
  else { p.miss++; p.b = 1; }
  p.due = Date.now() + INTERVAL[p.b];
  p.last = Date.now();
  if (!store.days.includes(today())) store.days = [...store.days.slice(-400), today()];
  save();
}

function startSession() {
  S = buildSession();
  if (!S.steps.length) return;
  S.steps.slice(0, 3).forEach(preload);
  const sh = $('#sheet');
  sh.hidden = false; sh.classList.remove('closing');
  document.body.classList.add('locked');
  renderStep();
}
function closeSession() {
  const sh = $('#sheet');
  sh.classList.add('closing');
  setTimeout(() => { sh.hidden = true; sh.innerHTML = ''; document.body.classList.remove('locked'); S = null; route(); }, 260);
}

function frame(stage, foot = '', { two = false, scroll = false, cls = '' } = {}) {
  const total = S.steps.length;
  $('#sheet').innerHTML = `
    <div class="s-top">
      <button class="s-close" data-act="close" aria-label="Stoppen">${ICON.close}</button>
      <div class="s-bar" role="progressbar" aria-valuenow="${S.i}" aria-valuemax="${total}"><i style="width:${100 * Math.min(S.i, total) / total}%"></i></div>
    </div>
    <div class="s-body ${scroll ? 'scroll' : ''} ${cls}">${stage}</div>
    <div class="s-foot ${two ? 'two' : ''}">${foot}</div>`;
}

function photo(sp, i, { tag = '', cycle = false } = {}) {
  const more = cycle && sp.photos.length > 1;
  return `<div class="q-photo" ${more ? 'data-act="cycle"' : ''} data-i="${i}">
    <img src="${img(sp, i)}" alt="Foto van de soort">
    ${tag}
    ${more ? `<span class="more glass">1 / ${sp.photos.length}</span>` : ''}
    <div class="credit">${esc(credit(sp, i))}</div></div>`;
}
const catTag = sp => `<span class="cat glass">${CAT[sp.cat].name}</span>`;

function renderStep() {
  if (S.i >= S.steps.length) return renderResult();
  const st = S.steps[S.i];
  st.answered = false;
  const sp = st.sp;
  preload(S.steps[S.i + 1]);

  if (st.type === 'intro') {
    frame(`<div class="stage">
      ${photo(sp, st.photo, { tag: '<span class="cat new">Nieuwe soort</span>', cycle: true })}
      <h2 class="q-title">${esc(sp.nl)}<small>${esc(sp.sci)}</small></h2>
      <div class="tipbox">${esc(sp.tip)}</div>
      <button class="more-hint" data-act="more">Meer over de ${esc(sp.nl.toLowerCase())}<svg viewBox="0 0 14 8"><path d="M1.5 1.5l5.5 5 5.5-5"/></svg></button></div>
      <div class="info" data-info="${sp.id}"></div>`,
      `<button class="btn" data-act="next">Volgende</button>`, { cls: 'intro' });
    fillInfo();
  } else if (st.type === 'card') {
    frame(`<div class="stage">
      ${photo(sp, st.photo, { tag: catTag(sp), cycle: true })}
      <div id="ans"><h2 class="q-title">Welke soort is dit?<small>Bedenk de naam en draai de kaart om</small></h2></div></div>`,
      `<button class="btn" data-act="flip">Draai om</button>`);
  } else if (st.type === 'name') {
    frame(`<div class="stage">
      ${photo(sp, st.photo, { tag: catTag(sp) })}
      <h2 class="q-title">Welke soort is dit?</h2>
      <div class="opts">${st.opts.map(o => `<button class="opt" data-act="answer" data-id="${o.id}"><span>${esc(o.nl)}</span></button>`).join('')}</div></div>`,
      `<button class="btn gray" data-act="dontknow">Weet ik niet</button>`);
  } else if (st.type === 'pick') {
    frame(`<div class="stage">
      <h2 class="q-title">Welke foto is de ${esc(sp.nl.toLowerCase())}?</h2>
      <div class="grid4">${st.opts.map((o, k) => `<button class="pick" data-act="answer" data-id="${o.id}">
        <img src="${img(o, st.photos[k], 'medium')}" alt=""><span class="lbl">${esc(o.nl)}</span><span class="mark"></span></button>`).join('')}</div></div>`,
      `<button class="btn gray" data-act="dontknow">Weet ik niet</button>`);
  }
}

function answer(id) {
  const st = S.steps[S.i];
  if (st.answered) return;
  st.answered = true;
  const sp = st.sp, ok = id === sp.id;
  const firstTry = !S.results.some(r => r.sp === sp);
  record(sp, ok);
  if (firstTry) S.results.push({ sp, ok });
  const again = !ok && !S.retried.has(sp.id);
  if (again) { S.retried.add(sp.id); S.steps.push(makeQuestion(sp, false)); }

  document.querySelectorAll('[data-act="answer"]').forEach(b => {
    const isRight = b.dataset.id === sp.id, chosen = b.dataset.id === id;
    b.disabled = true;
    if (b.classList.contains('opt')) {
      if (isRight) { b.classList.add('right'); b.insertAdjacentHTML('beforeend', ICON.check); }
      else if (chosen) { b.classList.add('wrong'); b.insertAdjacentHTML('beforeend', ICON.cross); }
      else b.classList.add('dim');
    } else {
      b.classList.add('show');
      if (isRight) { b.classList.add('right'); b.querySelector('.mark').innerHTML = ICON.check; }
      else if (chosen) { b.classList.add('wrong'); b.querySelector('.mark').innerHTML = ICON.cross; }
    }
  });
  $('.s-foot').innerHTML = `<div class="fb ${ok ? 'ok' : 'no'}">
    <div class="h">${ok ? ICON.check + 'Goed zo!' : id ? ICON.cross + 'Niet goed' : 'Het antwoord is'}</div>
    <div class="who">${esc(sp.nl)} <i>${esc(sp.sci)}</i></div>
    <div class="tp">${esc(sp.tip)}${again ? ' Komt straks terug.' : ''}</div>
    <button class="btn" data-act="next">Doorgaan</button></div>`;
}

function flip() {
  const sp = S.steps[S.i].sp;
  $('#ans').innerHTML = `<h2 class="q-title">${esc(sp.nl)}<small>${esc(sp.sci)}</small></h2>`;
  $('#ans').insertAdjacentHTML('afterend', `<div class="tipbox">${esc(sp.tip)}</div>`);
  const f = $('.s-foot');
  f.classList.add('two');
  f.innerHTML = `<button class="btn red" data-act="self" data-ok="0">Nog niet</button><button class="btn green" data-act="self" data-ok="1">Wist ik</button>`;
}
function selfGrade(ok) {
  const st = S.steps[S.i];
  record(st.sp, ok);
  if (!S.results.some(r => r.sp === st.sp)) S.results.push({ sp: st.sp, ok });
  if (!ok && !S.retried.has(st.sp.id)) {
    S.retried.add(st.sp.id);
    S.steps.push({ type: 'card', sp: st.sp, photo: (st.photo + 1) % st.sp.photos.length });
  }
  next();
}
function next() { S.i++; renderStep(); }

function renderResult() {
  const n = S.results.length, good = S.results.filter(r => r.ok).length;
  const frac = n ? good / n : 0;
  const title = frac >= .9 ? 'Uitstekend!' : frac >= .7 ? 'Goed bezig!' : frac >= .4 ? 'Lekker geoefend' : 'Blijven oefenen';
  frame(`<div class="result">
      ${ring(frac, 150, `${good}/${n}`, 10)}
      <h2>${title}</h2>
      <p>${good} van de ${n} in één keer goed</p>
    </div>
    <div class="result-list">${S.results.map(r => `<a class="row" href="#/soort/${r.sp.id}" data-act="close-to" style="--inset:68px">
      <img class="av" src="${img(r.sp, 0, 'small')}" alt="">
      <span class="main"><div class="t">${esc(r.sp.nl)}</div><div class="s"><i>${esc(r.sp.sci)}</i></div></span>
      <span class="${r.ok ? 'ok-ico' : 'no-ico'}">${r.ok ? ICON.check : ICON.cross}</span></a>`).join('')}</div>`,
    `<button class="btn gray" data-act="close">Klaar</button><button class="btn" data-act="again">Nog een ronde</button>`,
    { two: true, scroll: true });
  $('.s-bar i').style.width = '100%';
}

function preload(st) {
  if (!st) return;
  if (st.type === 'pick') st.opts.forEach((o, k) => { new Image().src = img(o, st.photos[k], 'medium'); });
  else new Image().src = img(st.sp, st.photo);
}

// ---------- Interactie ----------
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act], .tab');
  if (!t) return;
  if (t.classList.contains('tab')) {
    const tab = t.dataset.tab;
    if (view.tab === tab && !location.hash.startsWith('#/soort')) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    go('#/' + tab);
    return;
  }
  const s = store.settings;
  switch (t.dataset.act) {
    case 'cat-all': s.cats = [...ALL_CATS]; save(); renderTab(); break;
    case 'cat': {
      const id = t.dataset.id;
      if (s.cats.length === ALL_CATS.length) s.cats = [id];
      else if (s.cats.includes(id)) s.cats = s.cats.filter(c => c !== id);
      else s.cats = [...s.cats, id];
      if (!s.cats.length) s.cats = [...ALL_CATS];
      save(); renderTab(); break;
    }
    case 'set': s[t.dataset.key] = t.dataset.key === 'len' ? +t.dataset.val : t.dataset.val; save(); renderTab(); break;
    case 'start': case 'again': startSession(); break;
    case 'close': closeSession(); break;
    case 'close-to': e.preventDefault(); { const h = t.getAttribute('href'); closeSession(); setTimeout(() => go(h), 280); } break;
    case 'next': next(); break;
    case 'more': { const b = $('.s-body'); const inf = b.querySelector('.info'); b.scrollTo({ top: inf.getBoundingClientRect().top - b.getBoundingClientRect().top + b.scrollTop + 6, behavior: 'smooth' }); break; }
    case 'answer': answer(t.dataset.id); break;
    case 'dontknow': answer(null); break;
    case 'flip': flip(); break;
    case 'self': selfGrade(t.dataset.ok === '1'); break;
    case 'cycle': {
      const sp = S.steps[S.i].sp;
      const i = (+t.dataset.i + 1) % sp.photos.length;
      t.dataset.i = i;
      t.querySelector('img').src = img(sp, i);
      t.querySelector('.credit').textContent = credit(sp, i);
      const m = t.querySelector('.more'); if (m) m.textContent = `${i + 1} / ${sp.photos.length}`;
      break;
    }
    case 'gcat': view.gidsCat = t.dataset.id; $('#gids-list').innerHTML = gidsList();
      document.querySelectorAll('.pill').forEach(p => p.classList.toggle('on', p === t)); break;
    case 'back': history.length > 1 ? history.back() : go('#/gids'); break;
    case 'reset':
      if (confirm('Al je voortgang wissen? Dit kun je niet ongedaan maken.')) {
        store = { ...defaults(), settings: store.settings }; save(); renderTab();
      }
      break;
  }
});

window.addEventListener('hashchange', route);

// ---------- Start ----------
(async function init() {
  try {
    const res = await fetch('data/species.json', { cache: 'no-cache' });
    const data = await res.json();
    SPECIES = data.species.filter(s => CAT[s.cat]);
    DATA_DATE = data.generated;
    BY_ID = Object.fromEntries(SPECIES.map(s => [s.id, s]));
  } catch {
    $('#app').innerHTML = `<p class="empty">De soortenlijst kon niet laden. Controleer je internetverbinding en open de app opnieuw.</p>`;
    return;
  }
  route();
  setTimeout(loadInfo, 1200);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
})();
