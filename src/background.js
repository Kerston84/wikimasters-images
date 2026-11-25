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

// ---------- mémoire des recherches, plafonnée ----------
// On garde les résultats des 5 000 dernières cartes vues. Au-delà, les plus anciennes sont oubliées
// (si l'une d'elles revient, on refait simplement la recherche). Ça évite de remplir le navigateur
// quand on parcourt une collection de 30 000 cartes.
const CACHE_MAX = 5000;
const IDX_KEY = 'wmi-cache-idx';
let cacheIdx = null;          // { titre: date de dernière utilisation }
let idxTimer = null;

async function loadIdx() {
  if (cacheIdx) return cacheIdx;
  const r = (await ext.storage.local.get(IDX_KEY))[IDX_KEY];
  if (r) {
    cacheIdx = r;
  } else {
    // première fois (ou ancienne version) : on construit l'index à partir de ce qui existe
    const all = await ext.storage.local.get(null);
    cacheIdx = {};
    for (const k of Object.keys(all)) if (k.startsWith(CACHE_PREFIX)) cacheIdx[k.slice(CACHE_PREFIX.length)] = (all[k] && all[k].ts) || Date.now();
    await ext.storage.local.set({ [IDX_KEY]: cacheIdx });
  }
  return cacheIdx;
}

function saveIdxSoon() {
  clearTimeout(idxTimer);
  idxTimer = setTimeout(() => ext.storage.local.set({ [IDX_KEY]: cacheIdx }), 3000);
}

async function touchCache(title) {
  const idx = await loadIdx();
  idx[title] = Date.now();
  const titles = Object.keys(idx);
  if (titles.length > CACHE_MAX) {
    // on retire les 20 % les plus anciens d'un coup (moins d'écritures)
    titles.sort((a, b) => idx[a] - idx[b]);
    const drop = titles.slice(0, titles.length - Math.floor(CACHE_MAX * 0.8));
    for (const t of drop) delete idx[t];
    await ext.storage.local.remove(drop.map((t) => CACHE_PREFIX + t));
    await ext.storage.local.set({ [IDX_KEY]: idx });
  } else {
    saveIdxSoon();
  }
}

async function cachedSearch(title, desc) {
  const key = CACHE_PREFIX + title;
  const c = (await ext.storage.local.get(key))[key];
  if (c && Date.now() - c.ts < (c.list.length ? TTL_FOUND : TTL_NOTHING)) {
    touchCache(title);
    return c.list;
  }
  const list = await search(title, desc);
  await ext.storage.local.set({ [key]: { list, ts: Date.now() } });
  touchCache(title);
  return list;
}

// Quand on ajoute ou change la clé TMDB, on oublie les recherches pour réessayer avec TMDB
ext.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.tmdbKey) return;
  const idx = await loadIdx();
  const keys = Object.keys(idx).map((t) => CACHE_PREFIX + t);
  if (keys.length) await ext.storage.local.remove(keys);
  cacheIdx = {};
  await ext.storage.local.set({ [IDX_KEY]: cacheIdx });
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
// Cet espace est petit (~100 Ko) : les données sont compressées avant l'envoi.
// Chaque élément garde la date de sa dernière modification : c'est la plus récente qui gagne.
// =====================================================================
const SYNC_SETTINGS = ['mode', 'showBadges', 'tmdbKey', 'offRarities'];
const STATE_KEY = 'wmi-sync-state';   // { clé: date de modif } (date négative = supprimé)
const SYNC_CHUNK = 7500;               // caractères par morceau (limite navigateur : 8 Ko par morceau)
const SYNC_MAX = 92000;                // caractères au total (limite navigateur : ~100 Ko)
const isSyncedKey = (k) => k.startsWith('wmi-choice:') || k.startsWith('wmi-frame:') || SYNC_SETTINGS.includes(k);
const echoes = new Map();              // valeurs qu'on vient de recevoir d'un autre PC (à ne pas renvoyer)

// --- compression (deflate natif du navigateur) + texte base64 ---
async function pack(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function unpack(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return JSON.parse(await new Response(stream).text());
}

async function loadState() {
  const r = (await ext.storage.local.get(STATE_KEY))[STATE_KEY];
  if (r) {
    // ancienne version : { clé: {v, t} } → { clé: t }
    let migrated = false;
    for (const [k, e] of Object.entries(r)) {
      if (e && typeof e === 'object') { r[k] = e.v === null ? -e.t : e.t; migrated = true; }
    }
    if (migrated) await ext.storage.local.set({ [STATE_KEY]: r });
    return r;
  }
  // première fois : on part de ce qui existe déjà sur ce PC
  const all = await ext.storage.local.get(null);
  const state = {};
  for (const k of Object.keys(all)) if (isSyncedKey(k)) state[k] = Date.now();
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
  const old = Date.now() - 60 * 24 * 3600 * 1000;
  // réglages d'abord, puis les plus récents ; on oublie les suppressions de plus de 60 jours
  const keys = Object.keys(state)
    .filter((k) => state[k] > 0 || -state[k] > old)
    .sort((a, b) => (SYNC_SETTINGS.includes(b) - SYNC_SETTINGS.includes(a)) || (Math.abs(state[b]) - Math.abs(state[a])));
  const values = await ext.storage.local.get(keys.filter((k) => state[k] > 0));
  const records = keys.map((k) => (state[k] > 0 ? [k, state[k], values[k]] : [k, state[k]]));

  // on garde le plus d'éléments possible qui tiennent dans la place disponible (recherche par dichotomie)
  let lo = 0, hi = records.length, best = await pack([]);
  if ((await pack(records)).length <= SYNC_MAX) { lo = hi; best = await pack(records); }
  else {
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const p = await pack(records.slice(0, mid));
      if (p.length <= SYNC_MAX) { lo = mid; best = p; } else hi = mid - 1;
    }
  }
  const full = lo < records.length;
  const cards = records.slice(0, lo).filter((r) => r[1] > 0 && r[0].startsWith('wmi-choice:')).length;

  const chunks = { v: 2 };
  let n = 0;
  for (let i = 0; i < best.length; i += SYNC_CHUNK) chunks['z' + n++] = best.slice(i, i + SYNC_CHUNK);
  chunks.zn = n;
  try {
    const before = await ext.storage.sync.get(null);
    const extra = Object.keys(before).filter((k) => /^(s\d+|sn)$/.test(k) || (/^z\d+$/.test(k) && +k.slice(1) >= n));
    await ext.storage.sync.set(chunks);
    if (extra.length) await ext.storage.sync.remove(extra);
    await ext.storage.local.set({ 'wmi-sync-info': { ok: true, full, count: lo, cards, bytes: best.length, ts: Date.now() } });
  } catch (e) {
    await ext.storage.local.set({ 'wmi-sync-info': { ok: false, error: String((e && e.message) || e), ts: Date.now() } });
  }
}

async function pull() {
  if (!ext.storage.sync) return;
  let records;
  try {
    const all = await ext.storage.sync.get(null);
    if (all.zn) {
      let b64 = '';
      for (let i = 0; i < all.zn; i++) b64 += all['z' + i] || '';
      records = await unpack(b64);
    } else if (all.sn) {
      // format de la version 2.0/2.1 (non compressé)
      let json = '';
      for (let i = 0; i < all.sn; i++) json += all['s' + i] || '';
      records = Object.entries(JSON.parse(json)).map(([k, e]) => (e.v === null ? [k, -e.t] : [k, e.t, e.v]));
    } else return;
  } catch (e) {
    return;   // morceaux pas encore tous arrivés : on réessaiera au prochain changement
  }
  const state = await loadState();
  const toSet = {};
  const toRemove = [];
  const remote = new Map();
  for (const [k, t, v] of records) {
    remote.set(k, t);
    const mine = state[k];
    if (mine === undefined || Math.abs(t) > Math.abs(mine)) {
      state[k] = t;
      if (t < 0) { toRemove.push(k); echoes.set(k, 'null'); }
      else { toSet[k] = v; echoes.set(k, JSON.stringify(v)); }
    }
  }
  let localNewer = false;
  for (const [k, t] of Object.entries(state)) {
    if (!remote.has(k) || Math.abs(t) > Math.abs(remote.get(k))) { localNewer = true; break; }
  }
  await ext.storage.local.set({ ...toSet, [STATE_KEY]: state });
  if (toRemove.length) await ext.storage.local.remove(toRemove);
  if (localNewer) schedulePush();
}

ext.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'sync') { if (Object.keys(changes).some((k) => /^(z|s)(n|\d+)$/.test(k))) pull(); return; }
  if (area !== 'local') return;
  const keys = Object.keys(changes).filter(isSyncedKey);
  if (!keys.length) return;
  const state = await loadState();
  let changed = false;
  for (const k of keys) {
    const v = changes[k].newValue === undefined ? null : changes[k].newValue;
    const sv = JSON.stringify(v);
    if (echoes.get(k) === sv) { echoes.delete(k); continue; }   // c'est la copie qu'on vient de recevoir
    state[k] = v === null ? -Date.now() : Date.now();
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
