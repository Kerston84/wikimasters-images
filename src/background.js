// WikiMasters Images — recherche des images dans plusieurs banques.
// Tourne en arrière-plan dans Chrome : la page WikiMasters lui demande des images, il cherche et répond.

// même code pour Chrome, Brave, Edge et Firefox
const ext = globalThis.browser || globalThis.chrome;

const CACHE_PREFIX = 'wmi2:';
const DAY = 24 * 3600 * 1000;
const TTL_FOUND = 30 * DAY;
const TTL_NOTHING = 3 * DAY;

// Images à ignorer (icônes, drapeaux, bandeaux…)
const JUNK = /DALL|icon|Pictogram|Flag_of|Drapeau|Blason|Disambig|Question_book|Portail|Nuvola|Crystal_Clear|Gnome-|Wiki(data|media|pedia|source|quote)|Commons-logo|Emblem-|Ambox|Edit-clear|Padlock|Symbol_/i;

// ---------- petits outils ----------
async function getJSON(url, headers) {
  try {
    const r = await fetch(url, headers ? { headers } : undefined);
    return r.ok ? await r.json() : null;
  } catch (e) {
    return null;
  }
}
const cleanTitle = (t) => t.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
const yearOf = (title, desc) => ((title + ' ' + desc).match(/\b(18|19|20)\d\d\b/) || [])[0];
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function kindOf(desc) {
  const d = desc.toLowerCase();
  if (/\b(film|série|serie|feuilleton|téléfilm|telefilm|franchise|saga|anime|dessin animé|émission)/.test(d)) return 'media';
  if (/\b(acteur|actrice|chanteu|rappeu|musicien|compositeu|footballeu|joueu|sportif|sportive|athlète|homme|femme|écrivain|réalisat|humoriste|comédien|animat|journaliste|youtubeu|vidéaste|mannequin|danseu|pilote|boxeu|cycliste|tennisman|personnalité|producteur|productrice|dj|influenceu|streameu|politique)/.test(d)) return 'person';
  return 'other';
}
const isMusic = (desc) => /chanteu|rappeu|musicien|groupe|dj\b|compositeu|interprète|auteur-compositeur|auteur compositeur/i.test(desc);

// ---------- banques d'images ----------

// Wikipédia (français ou anglais) : les images présentes dans l'article, dans l'ordre
async function wikipediaImages(lang, title, label) {
  const data = await getJSON(`https://${lang}.wikipedia.org/api/rest_v1/page/media-list/` +
    encodeURIComponent(title.replace(/ /g, '_')) + '?redirect=true');
  const out = [];
  for (const it of (data && data.items) || []) {
    if (it.type !== 'image' || !it.showInGallery || !it.srcset || JUNK.test(it.title)) continue;
    if (/\.svg$/i.test(it.title) && !/logo|poster|affiche/i.test(it.title)) continue;
    const src = it.srcset[0].src;
    out.push({ url: src.startsWith('//') ? 'https:' + src : src, source: label });
    if (out.length >= 6) break;
  }
  return out;
}

// Infos de base : identifiant Wikidata + titre de l'article anglais
async function wikiInfo(title) {
  const data = await getJSON('https://fr.wikipedia.org/w/api.php?action=query&format=json&redirects=1' +
    '&prop=pageprops|langlinks&lllang=en&titles=' + encodeURIComponent(title));
  const p = data && Object.values(data.query.pages)[0];
  return {
    qid: p && p.pageprops && p.pageprops.wikibase_item,
    en: p && p.langlinks && p.langlinks[0] && p.langlinks[0]['*'],
  };
}

// Wikidata : photo officielle (P18), affiche (P3383), logo (P154)
async function wikidataImages(qid) {
  if (!qid) return {};
  const data = await getJSON('https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&entity=' + qid);
  const claims = (data && data.claims) || {};
  const file = (prop) => {
    const c = claims[prop] && claims[prop][0];
    const v = c && c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value;
    return v ? { url: 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(v) + '?width=500', source: 'Wikidata' } : null;
  };
  return { photo: file('P18'), poster: file('P3383'), logo: file('P154') };
}

// TMDB : affiches de films/séries et photos de personnes (nécessite une clé gratuite)
async function tmdbImages(title, desc, kind, key) {
  if (!key) return [];
  const bearer = key.length > 40;
  const auth = bearer ? { Authorization: 'Bearer ' + key } : undefined;
  const k = bearer ? '' : '&api_key=' + encodeURIComponent(key);
  const type = kind === 'person' ? 'person' : 'multi';
  const data = await getJSON(`https://api.themoviedb.org/3/search/${type}?language=fr-FR&include_adult=false&query=` +
    encodeURIComponent(cleanTitle(title)) + k, auth);
  let results = ((data && data.results) || []).filter((r) => r.poster_path || r.profile_path);
  if (kind === 'media') results = results.filter((r) => r.media_type !== 'person');
  const year = yearOf(title, desc);
  if (year) {
    // on met en premier les résultats sortis la bonne année
    results.sort((a, b) => {
      const ya = (a.release_date || a.first_air_date || '').startsWith(year) ? 0 : 1;
      const yb = (b.release_date || b.first_air_date || '').startsWith(year) ? 0 : 1;
      return ya - yb;
    });
  }
  return results.slice(0, 6).map((r) => ({
    url: 'https://image.tmdb.org/t/p/w500' + (r.poster_path || r.profile_path),
    source: 'TMDB',
  }));
}

// Deezer : photos d'artistes (chanteurs, rappeurs, groupes) — sans clé
async function deezerImages(title) {
  const name = cleanTitle(title);
  const data = await getJSON('https://api.deezer.com/search/artist?q=' + encodeURIComponent(name));
  return ((data && data.data) || [])
    .filter((a) => norm(a.name) === norm(name) && a.picture_xl && !/\/artist\/\/|images\/artist\/\//.test(a.picture_xl))
    .slice(0, 2)
    .map((a) => ({ url: a.picture_xl, source: 'Deezer' }));
}

// Openverse : banque d'images libres (résultats parfois hors sujet → seulement dans "plus d'images")
async function openverseImages(title) {
  const data = await getJSON('https://api.openverse.org/v1/images/?page_size=6&mature=false&q=' + encodeURIComponent(cleanTitle(title)));
  return ((data && data.results) || []).map((r) => ({ url: r.thumbnail || r.url, source: 'Openverse' }));
}

// Google Images : on lit la page de résultats et on récupère les liens des images d'origine.
// Ces images sont hébergées sur d'autres sites : elles peuvent disparaître avec le temps.
async function googleImages(title, animated = false) {
  let html = '';
  try {
    // animated = true → filtre Google « images animées » (GIF)
    const r = await fetch('https://www.google.com/search?udm=2&hl=fr' + (animated ? '&tbs=itp:animated' : '') +
      '&q=' + encodeURIComponent(title), { credentials: 'include' });
    if (!r.ok) return [];
    html = await r.text();
  } catch (e) {
    return [];
  }
  const out = [];
  const seen = new Set();
  const re = /\["(https?:\/\/[^"]+?)",(\d+),(\d+)\]/g;
  let m;
  while ((m = re.exec(html)) && out.length < 8) {
    let url;
    try { url = JSON.parse('"' + m[1] + '"'); } catch (e) { continue; }
    if (/gstatic\.com|google\.|googleusercontent|\.svg(\?|$)/i.test(url)) continue;
    if (animated && !/\.gif(\?|$)|giphy\.com\/media|media\d*\.giphy|media\.tenor\.com/i.test(url)) continue;
    if (+m[2] < 150 || +m[3] < 150) continue;          // trop petite
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url, source: 'Google' });
  }
  return out;
}

// ---------- recherche complète ----------
async function search(title, desc) {
  const { tmdbKey } = await ext.storage.local.get('tmdbKey');
  const kind = kindOf(desc);
  const info = await wikiInfo(title);

  const [fr, en, wd, tmdb, deezer] = await Promise.all([
    wikipediaImages('fr', title, 'Wikipédia FR'),
    info.en ? wikipediaImages('en', info.en, 'Wikipédia EN') : [],
    wikidataImages(info.qid),
    kind !== 'other' ? tmdbImages(title, desc, kind, tmdbKey) : [],
    kind === 'person' && isMusic(desc) ? deezerImages(title) : [],
  ]);

  // ordre de préférence selon le type de carte
  let ordered;
  if (kind === 'media') {
    // films/séries : l'article anglais commence presque toujours par l'affiche
    ordered = [wd.poster, ...tmdb.slice(0, 1), ...en.slice(0, 1), wd.logo, ...tmdb.slice(1), ...en.slice(1), wd.photo, ...fr];
  } else if (kind === 'person') {
    ordered = [wd.photo, ...fr.slice(0, 1), ...deezer, ...tmdb.slice(0, 1), ...en, ...fr.slice(1), ...tmdb.slice(1)];
  } else {
    ordered = [wd.photo, ...fr, wd.logo, ...en];
  }
  const seen = new Set();
  return ordered.filter((x) => x && !seen.has(x.url) && seen.add(x.url)).slice(0, 12);
}

async function cachedSearch(title, desc) {
  const key = CACHE_PREFIX + title;
  const c = (await ext.storage.local.get(key))[key];
  if (c && Date.now() - c.ts < (c.list.length ? TTL_FOUND : TTL_NOTHING)) return c.list;
  const list = await search(title, desc);
  await ext.storage.local.set({ [key]: { list, ts: Date.now() } });
  return list;
}

// Quand on ajoute ou change la clé TMDB, on oublie les recherches "rien trouvé" pour réessayer
ext.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.tmdbKey) return;
  const all = await ext.storage.local.get(null);
  const stale = Object.keys(all).filter((k) => k.startsWith(CACHE_PREFIX));
  if (stale.length) await ext.storage.local.remove(stale);
});

// ---------- messages venant de la page ----------
ext.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'search') {
    cachedSearch(msg.title, msg.desc || '').then(reply, () => reply([]));
    return true;
  }
  if (msg.type === 'gifs') {
    googleImages(msg.title, true).then(reply, () => reply([]));
    return true;
  }
  if (msg.type === 'google') {
    googleImages(msg.title).then(reply, () => reply([]));
    return true;
  }
  if (msg.type === 'more') {
    openverseImages(msg.title).then(reply, () => reply([]));
    return true;
  }
  if (msg.type === 'options') {
    ext.runtime.openOptionsPage();
  }
  return false;
});

// test de la clé TMDB depuis la page de réglages
async function testTmdbKey(key) {
  const bearer = key.length > 40;
  const r = await fetch('https://api.themoviedb.org/3/configuration' + (bearer ? '' : '?api_key=' + encodeURIComponent(key)),
    bearer ? { headers: { Authorization: 'Bearer ' + key } } : undefined).catch(() => null);
  return !!(r && r.ok);
}
ext.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'testTmdb') {
    testTmdbKey(msg.key).then(reply);
    return true;
  }
  return false;
});

// clic sur l'icône de l'extension → ouvre les réglages
ext.action.onClicked.addListener(() => ext.runtime.openOptionsPage());

// à l'installation / mise à jour : on efface les anciennes recherches de la version 1
ext.runtime.onInstalled.addListener(async () => {
  const all = await ext.storage.local.get(null);
  const old = Object.keys(all).filter((k) => k.startsWith('wmi:'));
  if (old.length) await ext.storage.local.remove(old);
});

// =====================================================================
// SYNCHRO ENTRE PC
// Les choix faits à la main (images choisies, recadrages, réglages) sont copiés dans
// l'espace « sync » du navigateur, qui suit ton compte (Google pour Chrome, Firefox pour Firefox).
// Chaque élément garde la date de sa dernière modification : c'est la plus récente qui gagne.
// =====================================================================
const SYNC_SETTINGS = ['mode', 'showBadges', 'tmdbKey'];
const STATE_KEY = 'wmi-sync-state';
const SYNC_CHUNK = 3500;      // taille d'un morceau (limite navigateur : 8 Ko, avec marge pour les accents)
const SYNC_MAX = 90000;       // place totale dispo en octets (limite navigateur : ~100 Ko)
// taille réelle comptée par le navigateur (le texte est ré-encodé : guillemets échappés, accents sur 2 octets)
const bytes = (s) => new TextEncoder().encode(JSON.stringify(s)).length;
const isSyncedKey = (k) => k.startsWith('wmi-choice:') || k.startsWith('wmi-frame:') || SYNC_SETTINGS.includes(k);
const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);

async function loadState() {
  const r = await ext.storage.local.get(STATE_KEY);
  if (r[STATE_KEY]) return r[STATE_KEY];
  // première fois : on part de ce qui existe déjà sur ce PC
  const all = await ext.storage.local.get(null);
  const state = {};
  for (const k of Object.keys(all)) if (isSyncedKey(k)) state[k] = { v: all[k], t: Date.now() };
  await ext.storage.local.set({ [STATE_KEY]: state });
  schedulePush();
  return state;
}

let pushTimer = null;
function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 2000);
}

async function push() {
  if (!ext.storage.sync) return;
  const state = await loadState();
  // on oublie les suppressions de plus de 60 jours
  const old = Date.now() - 60 * 24 * 3600 * 1000;
  let entries = Object.entries(state).filter(([, e]) => e.v !== null || e.t > old);
  let json = JSON.stringify(Object.fromEntries(entries));
  let full = false;
  if (bytes(json) > SYNC_MAX) {
    // trop gros : réglages d'abord, puis les modifications les plus récentes
    full = true;
    entries.sort((a, b) => (SYNC_SETTINGS.includes(b[0]) - SYNC_SETTINGS.includes(a[0])) || (b[1].t - a[1].t));
    while (entries.length && bytes(JSON.stringify(Object.fromEntries(entries))) > SYNC_MAX) {
      entries.splice(Math.max(1, Math.floor(entries.length * 0.97)));
    }
    json = JSON.stringify(Object.fromEntries(entries));
  }
  const chunks = {};
  let n = 0;
  for (let i = 0; i < json.length; i += SYNC_CHUNK) chunks['s' + n++] = json.slice(i, i + SYNC_CHUNK);
  chunks.sn = n;
  try {
    const before = await ext.storage.sync.get(null);
    const extra = Object.keys(before).filter((k) => /^s\d+$/.test(k) && +k.slice(1) >= n);
    await ext.storage.sync.set(chunks);
    if (extra.length) await ext.storage.sync.remove(extra);
    await ext.storage.local.set({ 'wmi-sync-info': { ok: true, full, count: entries.length, ts: Date.now() } });
  } catch (e) {
    await ext.storage.local.set({ 'wmi-sync-info': { ok: false, error: String(e && e.message || e), ts: Date.now() } });
  }
}

async function pull() {
  if (!ext.storage.sync) return;
  let remote;
  try {
    const all = await ext.storage.sync.get(null);
    if (!all.sn) return;
    let json = '';
    for (let i = 0; i < all.sn; i++) json += all['s' + i] || '';
    remote = JSON.parse(json);
  } catch (e) {
    return;   // morceaux pas encore tous arrivés : on réessaiera au prochain changement
  }
  const state = await loadState();
  const toSet = {};
  const toRemove = [];
  let localNewer = false;
  for (const [k, e] of Object.entries(remote)) {
    const mine = state[k];
    if (!mine || e.t > mine.t) {
      state[k] = e;
      if (e.v === null) toRemove.push(k); else toSet[k] = e.v;
    }
  }
  for (const [k, e] of Object.entries(state)) {
    if (!remote[k] || e.t > remote[k].t) localNewer = true;
  }
  await ext.storage.local.set({ ...toSet, [STATE_KEY]: state });
  if (toRemove.length) await ext.storage.local.remove(toRemove);
  if (localNewer) schedulePush();
}

ext.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'sync') { if (Object.keys(changes).some((k) => /^s(n|\d+)$/.test(k))) pull(); return; }
  if (area !== 'local') return;
  const keys = Object.keys(changes).filter(isSyncedKey);
  if (!keys.length) return;
  const state = await loadState();
  let changed = false;
  for (const k of keys) {
    const v = changes[k].newValue === undefined ? null : changes[k].newValue;
    if (state[k] && same(state[k].v, v)) continue;    // c'est nous qui venons de l'écrire (copie depuis un autre PC)
    state[k] = { v, t: Date.now() };
    changed = true;
  }
  if (changed) {
    await ext.storage.local.set({ [STATE_KEY]: state });
    schedulePush();
  }
});

// au démarrage du navigateur : on récupère ce qui a été fait sur les autres PC
ext.runtime.onStartup.addListener(() => pull());
pull();

// Firefox demande d'autoriser les sites à la main : on ouvre les réglages si ce n'est pas fait
ext.runtime.onInstalled.addListener(async () => {
  const origins = ext.runtime.getManifest().host_permissions || [];
  const ok = await ext.permissions.contains({ origins }).catch(() => true);
  if (!ok) ext.runtime.openOptionsPage();
});
