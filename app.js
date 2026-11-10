// Natuur — leer de flora en fauna van Nederland herkennen.
// Geen framework, geen build-stap: alles in deze module.

const CATS = [
  { id: 'vogels', name: 'Vogels', emoji: '🐦', c: 'rgba(0,122,255,.16)' },
  { id: 'zoogdieren', name: 'Zoogdieren', emoji: '🦊', c: 'rgba(255,149,0,.18)' },
  { id: 'bomen', name: 'Bomen & struiken', emoji: '🌳', c: 'rgba(52,199,89,.18)' },
  { id: 'bloemen', name: 'Wilde bloemen', emoji: '🌼', c: 'rgba(255,204,0,.22)' },
  { id: 'paddenstoelen', name: 'Paddenstoelen', emoji: '🍄', c: 'rgba(162,132,94,.22)' },
  { id: 'vlinders', name: 'Vlinders', emoji: '🦋', c: 'rgba(175,82,222,.18)' },
  { id: 'insecten', name: 'Insecten & kleine dieren', emoji: '🐞', c: 'rgba(255,59,48,.16)' },
  { id: 'amfibieen', name: 'Amfibieën & reptielen', emoji: '🐸', c: 'rgba(48,176,199,.2)' },
];
const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));
const ALL_CATS = CATS.map(c => c.id);

const HOUR = 36e5, DAY = 24 * HOUR;
const INTERVAL = [0, 10 * 60e3, DAY, 3 * DAY, 8 * DAY, 21 * DAY]; // per vakje 0–5
const LEARNED = 3;
const KEY = 'natuur.v1';

const ICON = {
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  cross: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 8 13"><path d="M1.5 1.5l5 5-5 5"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 4l-8 8 8 8"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>',
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
const credit = (sp, i = 0) => { const p = sp.photos[i % sp.photos.length]; return `${p.a} · ${p.l.replace('-', ' ')}`; };
const today = () => new Date().toISOString().slice(0, 10);

let SPECIES = [], BY_ID = {}, DATA_DATE = '';

function pool(settings = store.settings) {
  return SPECIES.filter(s => settings.cats.includes(s.cat) && (settings.region === 'nl' || s.bestObs > 0));
}
function obsKey(s) { return store.settings.region === 'best' ? s.bestObs * 50 + s.nlObs : s.nlObs; }
function isDue(s, now = Date.now()) { const p = P(s.id); return p && p.n > 0 && p.due <= now; }
function boxOf(id) { return P(id)?.b || 0; }
function levelBars(id) {
  const b = boxOf(id);
  return `<span class="lvl" aria-label="niveau ${b} van 5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= b ? 'on' : ''}"></i>`).join('')}</span>`;
}
function ring(frac, size = 84, label) {
  const r = 40, c = 2 * Math.PI * r;
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 100 100"><circle class="bgc" cx="50" cy="50" r="${r}"/><circle class="fgc" cx="50" cy="50" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}"/></svg><div class="pct">${label ?? Math.round(frac * 100) + '%'}</div></div>`;
}

// ---------- Router ----------
const view = { tab: 'leren', gidsCat: 'alles', query: '', scroll: {} };

function route() {
  const [, a, b] = (location.hash || '#/leren').split('/');
  if (a === 'soort' && BY_ID[b]) return renderDetail(BY_ID[b]);
  view.tab = ['leren', 'gids', 'voortgang'].includes(a) ? a : 'leren';
  if (view.tab === 'gids' && b) view.gidsCat = b;
  renderTab();
}
function go(hash) { if (location.hash !== hash) location.hash = hash; else route(); }

function renderTab() {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === view.tab));
  $('#tabbar').hidden = false;
  const html = { leren: pageLeren, gids: pageGids, voortgang: pageVoortgang }[view.tab]();
  $('#app').innerHTML = html;
  window.scrollTo(0, view.scroll[view.tab] || 0);
  onScroll();
  if (view.tab === 'gids') bindSearch();
}

function navbar(title, { back = false, always = false } = {}) {
  return `<header class="navbar${always ? ' always solid' : ''}">
    <div class="left">${back ? `<button class="back" data-act="back">${ICON.back}<span>Gids</span></button>` : ''}</div>
    <div class="title">${esc(title)}</div><div class="right"></div></header>`;
}
function onScroll() {
  const nb = document.querySelector('.navbar');
  if (nb && !nb.classList.contains('always')) nb.classList.toggle('solid', window.scrollY > 34);
}
window.addEventListener('scroll', () => { onScroll(); if (!location.hash.startsWith('#/soort')) view.scroll[view.tab] = window.scrollY; }, { passive: true });

// ---------- Leren ----------
function selectionName() {
  const c = store.settings.cats;
  if (c.length === ALL_CATS.length) return 'Alles door elkaar';
  if (c.length === 1) return CAT[c[0]].name;
  return `${c.length} categorieën`;
}

function pageLeren() {
  const s = store.settings;
  const pl = pool();
  const learned = pl.filter(x => boxOf(x.id) >= LEARNED).length;
  const due = pl.filter(x => isDue(x)).length;
  const fresh = pl.filter(x => !P(x.id)?.n).length;
  const all = s.cats.length === ALL_CATS.length;
  const count = cat => SPECIES.filter(x => x.cat === cat && (s.region === 'nl' || x.bestObs > 0)).length;

  return `<main class="page">
    ${navbar('Leren')}
    <h1 class="large-title">Leren</h1>
    <p class="subtitle">${dateLine()}</p>

    <section class="hero">
      <div class="hero-top">
        ${ring(pl.length ? learned / pl.length : 0)}
        <div>
          <h2>${esc(selectionName())}</h2>
          <p>${learned} van ${pl.length} soorten geleerd</p>
          <div class="chips">
            ${due ? `<span class="chip orange">${due} te herhalen</span>` : ''}
            ${fresh ? `<span class="chip">${fresh} nieuw</span>` : `<span class="chip green">alles gezien</span>`}
          </div>
        </div>
      </div>
      <button class="btn" data-act="start" ${pl.length < 4 ? 'disabled' : ''}>${ICON.play}Start ${s.mode === 'quiz' ? 'quiz' : 'flitskaarten'}</button>
    </section>

    <section class="section">
      <div class="section-head">Wat wil je leren?</div>
      <div class="list">
        <button class="row" data-act="cat-all" style="--inset:58px">
          <span class="icon" style="--c:rgba(88,86,214,.18)">🔀</span>
          <span class="main"><div class="t">Alles door elkaar</div></span>
          <span class="detail">${pool({ ...s, cats: ALL_CATS }).length}</span>
          <span class="check ${all ? 'on' : ''}">${ICON.check}</span>
        </button>
        ${CATS.map(c => `
        <button class="row" data-act="cat" data-id="${c.id}" style="--inset:58px">
          <span class="icon" style="--c:${c.c}">${c.emoji}</span>
          <span class="main"><div class="t">${c.name}</div></span>
          <span class="detail">${count(c.id)}</span>
          <span class="check ${!all && s.cats.includes(c.id) ? 'on' : ''}">${ICON.check}</span>
        </button>`).join('')}
      </div>
      <p class="section-foot">Kies één categorie, of tik er meerdere aan om ze te combineren.</p>
    </section>

    <section class="section">
      <div class="section-head">Oefenvorm</div>
      <div class="list"><div class="seg-wrap">${seg('mode', [['quiz', 'Quiz'], ['kaarten', 'Flitskaarten']], s.mode)}</div></div>
      <p class="section-foot">${s.mode === 'quiz'
        ? 'Meerkeuzevragen met foto’s. Nieuwe soorten krijg je eerst te zien voordat ze gevraagd worden.'
        : 'Bekijk de foto, bedenk de naam en draai de kaart om. Geef zelf aan of je hem wist.'}</p>
    </section>

    <section class="section">
      <div class="section-head">Gebied</div>
      <div class="list"><div class="seg-wrap">${seg('region', [['nl', 'Heel Nederland'], ['best', 'Rond Best']], s.region)}</div></div>
      <p class="section-foot">“Rond Best” toont alleen soorten die binnen 15 km van Best zijn waargenomen.</p>
    </section>

    <section class="section">
      <div class="section-head">Sessielengte</div>
      <div class="list"><div class="seg-wrap">${seg('len', [[10, '10'], [20, '20'], [30, '30']], s.len)}</div></div>
      <p class="section-foot">Soorten die je moeilijk vindt komen vaker terug; wat je goed kent zie je pas na een paar dagen weer.</p>
    </section>
  </main>`;
}
function seg(key, opts, cur) {
  return `<div class="seg" role="tablist">${opts.map(([v, l]) => `<button role="tab" aria-selected="${v == cur}" class="${v == cur ? 'on' : ''}" data-act="set" data-key="${key}" data-val="${v}">${l}</button>`).join('')}</div>`;
}
function dateLine() {
  const d = new Date();
  const s = d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
  const st = streak();
  return s.charAt(0).toUpperCase() + s.slice(1) + (st > 1 ? ` · 🔥 ${st} dagen op rij` : '');
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
    <h1 class="large-title">Gids</h1>
    <div class="search">${ICON.search}<input id="q" type="search" placeholder="Zoek op naam" value="${esc(view.query)}" autocomplete="off" autocorrect="off" spellcheck="false"></div>
    <div class="pills">
      <button class="pill ${view.gidsCat === 'alles' ? 'on' : ''}" data-act="gcat" data-id="alles">Alles</button>
      ${CATS.map(c => `<button class="pill ${view.gidsCat === c.id ? 'on' : ''}" data-act="gcat" data-id="${c.id}">${c.emoji} ${c.name}</button>`).join('')}
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
    html += `<section class="section"><div class="section-head">${c.emoji} ${c.name}</div><div class="list">
      ${items.map(s => `<a class="row" href="#/soort/${s.id}" style="--inset:72px">
        <img class="thumb" loading="lazy" src="${img(s, 0, 'small')}" alt="">
        <span class="main"><div class="t">${esc(s.nl)}</div><div class="s"><i>${esc(s.sci)}</i></div></span>
        ${levelBars(s.id)}${ICON.chev}</a>`).join('')}
    </div></section>`;
  }
  return html || `<p class="empty">Geen soorten gevonden voor “${esc(view.query)}”.</p>`;
}
function bindSearch() {
  const inp = $('#q');
  inp?.addEventListener('input', () => { view.query = inp.value; $('#gids-list').innerHTML = gidsList(); });
}

// ---------- Detail ----------
function renderDetail(s) {
  $('#tabbar').hidden = false;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'gids'));
  const p = P(s.id);
  const c = CAT[s.cat];
  const status = !p?.n ? 'Nog niet geoefend'
    : p.b >= 5 ? 'Beheerst' : p.b >= LEARNED ? 'Geleerd' : 'Bezig met leren';
  const acc = p?.n ? Math.round(100 * p.ok / p.n) : 0;
  $('#app').innerHTML = `<main class="page push">
    ${navbar(s.nl, { back: true })}
    <div class="gallery" id="gal">${s.photos.map((ph, i) => `<figure><img ${i > 1 ? 'loading="lazy"' : ''} src="${img(s, i)}" alt="${esc(s.nl)}, foto ${i + 1}"><figcaption>${esc(credit(s, i))}</figcaption></figure>`).join('')}</div>
    ${s.photos.length > 1 ? `<div class="dots" id="dots">${s.photos.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}
    <h1 class="d-title">${esc(s.nl)}</h1>
    <div class="d-sci">${esc(s.sci)}</div>
    <div class="chips d-chips">
      <span class="chip">${c.emoji} ${c.name}</span>
      ${s.bestObs > 0 ? '<span class="chip green">📍 Gezien rond Best</span>' : ''}
      ${rarity(s)}
    </div>
    <section class="section"><div class="card"><div class="k">Zo herken je hem</div><p>${esc(s.tip)}</p></div></section>
    ${s.wiki ? `<section class="section"><div class="card"><div class="k">Over deze soort</div><p>${esc(s.wiki.t)}</p></div>
      <p class="section-foot">Tekst: <a href="${esc(s.wiki.u)}" target="_blank" rel="noopener">Wikipedia</a> (CC BY-SA)</p></section>` : ''}
    <section class="section">
      <div class="section-head">Jouw voortgang</div>
      <div class="list">
        <div class="row"><span class="main">Status</span><span class="detail">${status}</span></div>
        <div class="row"><span class="main">Niveau</span>${levelBars(s.id)}</div>
        ${p?.n ? `<div class="row"><span class="main">Goed beantwoord</span><span class="detail">${p.ok} van ${p.n} (${acc}%)</span></div>` : ''}
      </div>
    </section>
    <section class="section"><div class="list">
      <a class="row link" href="https://www.inaturalist.org/taxa/${s.inat}" target="_blank" rel="noopener"><span class="main">Bekijk op iNaturalist</span>${ICON.chev}</a>
      <a class="row link" href="https://waarneming.nl/search/?q=${encodeURIComponent(s.sci)}" target="_blank" rel="noopener"><span class="main">Zoek op Waarneming.nl</span>${ICON.chev}</a>
    </div><p class="section-foot">Foto’s via iNaturalist, met de licentie van de fotograaf.</p></section>
  </main>`;
  window.scrollTo(0, 0);
  onScroll();
  const gal = $('#gal'), dots = $('#dots');
  if (gal && dots) gal.addEventListener('scroll', () => {
    const i = Math.round(gal.scrollLeft / gal.clientWidth);
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
  }, { passive: true });
}
function rarity(s) {
  const sorted = SPECIES.filter(x => x.cat === s.cat).map(x => x.nlObs).sort((a, b) => b - a);
  const rank = sorted.indexOf(s.nlObs) / sorted.length;
  if (rank < .33) return '<span class="chip">Algemeen</span>';
  if (rank < .75) return '<span class="chip">Vrij algemeen</span>';
  return '<span class="chip">Minder vaak gezien</span>';
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
    <h1 class="large-title">Voortgang</h1>
    <div class="stats">
      <div class="stat"><div class="v">${learned}</div><div class="l"><i style="--c:var(--green)"></i>Geleerd</div></div>
      <div class="stat"><div class="v">${busy}</div><div class="l"><i style="--c:var(--yellow)"></i>Bezig</div></div>
      <div class="stat"><div class="v">${due}</div><div class="l"><i style="--c:var(--orange)"></i>Te herhalen</div></div>
      <div class="stat"><div class="v">${streak()}</div><div class="l"><i style="--c:var(--red)"></i>Dagen op rij</div></div>
    </div>

    <section class="section">
      <div class="section-head">Per categorie</div>
      <div class="list">
        ${CATS.map(c => {
          const items = SPECIES.filter(s => s.cat === c.id);
          const l = items.filter(s => boxOf(s.id) >= LEARNED).length;
          const b = items.filter(s => P(s.id)?.n && boxOf(s.id) < LEARNED).length;
          return `<a class="row" href="#/gids/${c.id}" style="--inset:58px">
            <span class="icon" style="--c:${c.c}">${c.emoji}</span>
            <span class="main"><div class="t">${c.name}</div>
              <div class="bar"><i style="width:${100 * l / items.length}%;background:var(--green)"></i><i style="width:${100 * b / items.length}%;background:var(--yellow)"></i></div></span>
            <span class="detail">${l}/${items.length}</span>${ICON.chev}</a>`;
        }).join('')}
      </div>
      <p class="section-foot">Groen = geleerd (3× achter elkaar goed, verspreid over dagen). Geel = je bent ermee bezig. ${answers} antwoorden gegeven.</p>
    </section>

    ${hard.length ? `<section class="section">
      <div class="section-head">Lastigste soorten</div>
      <div class="list">${hard.map(s => `<a class="row" href="#/soort/${s.id}" style="--inset:72px">
        <img class="thumb" loading="lazy" src="${img(s, 0, 'small')}" alt="">
        <span class="main"><div class="t">${esc(s.nl)}</div><div class="s">${P(s.id).miss}× fout van ${P(s.id).n}</div></span>${ICON.chev}</a>`).join('')}
      </div></section>` : ''}

    <section class="section">
      <div class="section-head">Over</div>
      <div class="list">
        <div class="row"><span class="main">Soorten</span><span class="detail">${SPECIES.length}</span></div>
        <div class="row"><span class="main">Gegevens bijgewerkt</span><span class="detail">${esc(DATA_DATE)}</span></div>
      </div>
      <p class="section-foot">Foto’s en waarnemingen: iNaturalist (licentie per foto vermeld). Teksten: Nederlandstalige Wikipedia (CC BY-SA). Je voortgang wordt alleen op dit apparaat bewaard.</p>
    </section>

    <section class="section"><div class="list"><button class="row danger" data-act="reset">Voortgang wissen</button></div></section>
  </main>`;
}

// ---------- Sessie ----------
let S = null; // lopende sessie

function buildSession() {
  const s = store.settings;
  const pl = pool();
  const now = Date.now();
  const L = Math.min(s.len, pl.length);
  const seen = pl.filter(x => P(x.id)?.n);
  const due = shuffle(seen.filter(x => isDue(x, now))).sort((a, b) => boxOf(a.id) - boxOf(b.id));
  // nieuwe soorten: per categorie de meest algemene eerst, om en om over categorieën
  const byCat = {};
  for (const x of pl.filter(x => !P(x.id)?.n)) (byCat[x.cat] ||= []).push(x);
  Object.values(byCat).forEach(a => a.sort((p, q) => obsKey(q) - obsKey(p) + (Math.random() - .5) * 2));
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
    const flush = (force) => {
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
  const sh = $('#sheet');
  S.steps.slice(0, 3).forEach(preload);
  sh.hidden = false; sh.classList.remove('closing');
  document.body.classList.add('locked');
  renderStep();
}
function closeSession() {
  const sh = $('#sheet');
  sh.classList.add('closing');
  setTimeout(() => { sh.hidden = true; sh.innerHTML = ''; document.body.classList.remove('locked'); S = null; route(); }, 260);
}

function sessionFrame(body, foot = '', footClass = '') {
  const total = S.steps.length, done = Math.min(S.i, total);
  $('#sheet').innerHTML = `
    <div class="s-top">
      <button class="s-close" data-act="close" aria-label="Sluiten">${ICON.close}</button>
      <div class="s-bar"><i style="width:${100 * done / total}%"></i></div>
    </div>
    <div class="s-body"><div class="card-in">${body}</div></div>
    <div class="s-foot ${footClass}">${foot}</div>`;
}

function photoBlock(sp, i, { cycle = false } = {}) {
  return `<div class="q-photo" ${cycle ? 'data-act="cycle"' : ''} data-i="${i}">
    <img src="${img(sp, i)}" alt="Foto van de soort"><div class="credit">${esc(credit(sp, i))}</div></div>`;
}

function renderStep() {
  if (S.i >= S.steps.length) return renderResult();
  const st = S.steps[S.i];
  st.answered = false;
  const sp = st.sp;
  preload(S.steps[S.i + 1]);

  if (st.type === 'intro') {
    sessionFrame(`
      <span class="badge-new">Nieuw</span>
      ${photoBlock(sp, st.photo, { cycle: true })}
      <div class="reveal" style="text-align:left;padding:0 4px">
        <div class="n">${esc(sp.nl)}</div><div class="sc">${esc(sp.sci)}</div>
      </div>
      <div class="feedback"><div class="tip" style="margin:0;color:var(--label)">${esc(sp.tip)}</div></div>
      ${sp.photos.length > 1 ? '<p class="hint-tap">Tik op de foto voor meer foto’s</p>' : ''}`,
      `<button class="btn" data-act="next">Volgende</button>`);
    return;
  }

  if (st.type === 'card') {
    sessionFrame(`
      ${photoBlock(sp, st.photo, { cycle: true })}
      <div id="ans"><p class="q-title" style="text-align:center">Welke soort is dit?</p>
      <p class="hint-tap" style="margin-top:0">${CAT[sp.cat].emoji} ${CAT[sp.cat].name}</p></div>`,
      `<button class="btn" data-act="flip">Toon antwoord</button>`);
    return;
  }

  if (st.type === 'name') {
    sessionFrame(`
      ${photoBlock(sp, st.photo)}
      <p class="q-label">${CAT[sp.cat].emoji} ${CAT[sp.cat].name}</p>
      <p class="q-title">Welke soort is dit?</p>
      <div class="opts">${st.opts.map(o => `<button class="opt" data-act="answer" data-id="${o.id}"><span>${esc(o.nl)}</span></button>`).join('')}</div>
      <div id="fb"></div>`,
      `<button class="btn gray" data-act="dontknow">Weet ik niet</button>`);
    return;
  }

  if (st.type === 'pick') {
    sessionFrame(`
      <p class="q-label">${CAT[sp.cat].emoji} Kies de juiste foto</p>
      <p class="q-title">Waar zie je de ${esc(sp.nl.toLowerCase())}?</p>
      <div class="grid4">${st.opts.map((o, k) => `<button class="pick" data-act="answer" data-id="${o.id}">
        <img src="${img(o, st.photos[k], 'medium')}" alt=""><span class="lbl">${esc(o.nl)}</span><span class="mark"></span></button>`).join('')}</div>
      <div id="fb"></div>`,
      `<button class="btn gray" data-act="dontknow">Weet ik niet</button>`);
  }
}

function answer(id) {
  const st = S.steps[S.i];
  if (st.answered) return;
  st.answered = true;
  const sp = st.sp, ok = id === sp.id;
  const firstTry = !S.retried.has(sp.id) && !S.results.some(r => r.sp === sp);
  record(sp, ok);
  if (firstTry) S.results.push({ sp, ok });
  if (!ok && !S.retried.has(sp.id)) {
    S.retried.add(sp.id);
    S.steps.push(makeQuestion(sp, false));
  }

  document.querySelectorAll('[data-act="answer"]').forEach(b => {
    const isRight = b.dataset.id === sp.id, chosen = b.dataset.id === id;
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
  $('#fb').innerHTML = `<div class="feedback ${ok ? 'ok' : 'no'}">
    <div class="h">${ok ? 'Goed zo!' : id ? 'Helaas' : 'Dit is het antwoord'}</div>
    <div class="name">${esc(sp.nl)} <span style="color:var(--label2);font-weight:400;font-style:italic">${esc(sp.sci)}</span></div>
    <div class="tip">${esc(sp.tip)}</div>
    ${!ok ? '<div class="tip" style="margin-top:6px">Deze soort komt aan het eind nog een keer terug.</div>' : ''}</div>`;
  $('.s-foot').innerHTML = `<button class="btn" data-act="next">Doorgaan</button>`;
  $('#fb').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function flip() {
  const st = S.steps[S.i], sp = st.sp;
  $('#ans').innerHTML = `<div class="reveal"><div class="n">${esc(sp.nl)}</div><div class="sc">${esc(sp.sci)}</div>
    <div class="feedback tp"><div class="tip" style="margin:0;color:var(--label)">${esc(sp.tip)}</div></div></div>`;
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
  const uniq = [...new Map(S.results.map(r => [r.sp.id, r])).values()];
  $('#sheet').innerHTML = `
    <div class="s-top"><button class="s-close" data-act="close" aria-label="Sluiten">${ICON.close}</button><div class="s-bar"><i style="width:100%"></i></div></div>
    <div class="s-body"><div class="result card-in">
      ${ring(frac, 150, `${good}/${n}`)}
      <h2>${title}</h2>
      <p>${good} van de ${n} in één keer goed</p>
    </div>
    <div class="list mini">${uniq.map(r => `<div class="row" style="--inset:72px">
      <img class="thumb" src="${img(r.sp, 0, 'small')}" alt="">
      <span class="main"><div class="t">${esc(r.sp.nl)}</div><div class="s"><i>${esc(r.sp.sci)}</i></div></span>
      <span class="${r.ok ? 'ok-ico' : 'no-ico'}">${r.ok ? ICON.check : ICON.cross}</span></div>`).join('')}</div></div>
    <div class="s-foot two"><button class="btn gray" data-act="close">Klaar</button><button class="btn" data-act="again">Nog een ronde</button></div>`;
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
    case 'set': {
      const v = t.dataset.val;
      s[t.dataset.key] = t.dataset.key === 'len' ? +v : v;
      save(); renderTab(); break;
    }
    case 'start': case 'again': startSession(); break;
    case 'close': closeSession(); break;
    case 'next': next(); break;
    case 'answer': answer(t.dataset.id); break;
    case 'dontknow': answer(null); break;
    case 'flip': flip(); break;
    case 'self': selfGrade(t.dataset.ok === '1'); break;
    case 'cycle': {
      const st = S.steps[S.i], sp = st.sp;
      if (sp.photos.length < 2) break;
      const i = (+t.dataset.i + 1) % sp.photos.length;
      t.dataset.i = i;
      t.querySelector('img').src = img(sp, i);
      t.querySelector('.credit').textContent = credit(sp, i);
      break;
    }
    case 'gcat': view.gidsCat = t.dataset.id; $('#gids-list').innerHTML = gidsList();
      document.querySelectorAll('.pill').forEach(p => p.classList.toggle('on', p === t)); break;
    case 'back': history.length > 1 ? history.back() : go('#/gids'); break;
    case 'reset':
      if (confirm('Weet je zeker dat je al je voortgang wilt wissen? Dit kan niet ongedaan worden gemaakt.')) {
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
  } catch (err) {
    $('#app').innerHTML = `<p class="empty">Kon de soortenlijst niet laden. Controleer je verbinding en probeer het opnieuw.</p>`;
    return;
  }
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
})();
