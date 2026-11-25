// WikiMasters Images — ajoute des images aux cartes qui n'en ont pas.
// Tout se passe dans ton navigateur : rien n'est envoyé à WikiMasters.
(() => {
  'use strict';

  // même code pour Chrome, Brave, Edge et Firefox
  const ext = globalThis.browser || globalThis.chrome;

  const PLACEHOLDER = 'logo-288';          // l'image "logo" utilisée par le jeu quand une carte n'a pas d'image
  const CHOICE_PREFIX = 'wmi-choice:';     // images choisies à la main
  const MAX_PARALLEL = 3;

  // ---------- mémoire (storage) ----------
  const store = {
    async get(key) {
      const r = await ext.storage.local.get(key);
      return r[key];
    },
    set(key, value) { return ext.storage.local.set({ [key]: value }); },
    remove(key) { return ext.storage.local.remove(key); },
  };

  // ---------- recherche (faite par l'arrière-plan de l'extension, dans plusieurs banques d'images) ----------
  function ask(msg) {
    return new Promise((resolve) => {
      try {
        if (globalThis.browser) {
          // Firefox : réponse sous forme de promesse
          browser.runtime.sendMessage(msg).then((r) => resolve(r || []), () => resolve([]));
        } else {
          chrome.runtime.sendMessage(msg, (r) => resolve(chrome.runtime.lastError ? [] : (r || [])));
        }
      } catch (e) { resolve([]); }  // extension rechargée : il faudra recharger la page
    });
  }

  // file d'attente : pas plus de 3 recherches en même temps
  let running = 0;
  const waiting = [];
  function limited(fn) {
    return new Promise((resolve, reject) => {
      const go = async () => {
        running++;
        try { resolve(await fn()); } catch (e) { reject(e); }
        finally { running--; if (waiting.length) waiting.shift()(); }
      };
      running < MAX_PARALLEL ? go() : waiting.push(go);
    });
  }

  const inFlight = new Map();
  function getCandidates(title, desc) {
    if (inFlight.has(title)) return inFlight.get(title);
    const p = limited(() => ask({ type: 'search', title, desc })).finally(() => inFlight.delete(title));
    inFlight.set(title, p);
    return p;
  }

  // vérifie qu'une image se charge vraiment avant de l'afficher
  function loads(url) {
    return new Promise((ok) => {
      const t = new Image();
      t.onload = () => ok(t.naturalWidth > 40);
      t.onerror = () => ok(false);
      t.src = url;
    });
  }

  // ---------- réglage : quelles cartes modifier ----------
  //  'empty'   = seulement les cartes sans image
  //  'improve' = + les images de mauvaise qualité et les films/séries sans affiche (par défaut)
  //  'all'     = toutes les cartes dès qu'une autre image est trouvée
  let mode = 'improve';
  // raretés que l'extension ne modifie PAS automatiquement (tes choix faits à la main restent appliqués)
  const RARITIES = [['C', 'Commune'], ['PC', 'Peu commune'], ['R', 'Rare'], ['SR', 'Super rare'], ['UR', 'Ultra rare'], ['L', 'Légendaire']];
  let offRarities = new Set();
  let syncInfo = null;
  const modeReady = ext.storage.local.get(['mode', 'offRarities', 'wmi-sync-info']).then((r) => {
    if (r.mode) mode = r.mode;
    offRarities = new Set(r.offRarities || []);
    syncInfo = r['wmi-sync-info'] || null;
  });
  ext.storage.onChanged.addListener((ch, area) => {
    if (area && area !== 'local') return;
    if (ch.mode && ch.mode.newValue && ch.mode.newValue !== mode) location.reload();
    if (ch.offRarities && JSON.stringify(ch.offRarities.newValue || []) !== JSON.stringify([...offRarities])) location.reload();
    if (ch['wmi-sync-info']) { syncInfo = ch['wmi-sync-info'].newValue || null; refreshPanel(); }
  });

  // ---------- affichage sur les cartes ----------
  // une carte = le bloc ".group" de la collection, ou (dans la fiche ouverte) le bloc qui contient le fond de rareté
  function cardOf(el) {
    const g = el.closest('.group');
    if (g) return g;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.querySelector(':scope > img[src*="/rarity/"]')) return n;
    }
    return null;
  }
  const inGrid = (card) => card && card.classList.contains('group');
  function titleOf(card) { const h = card && card.querySelector('h3'); return h ? h.textContent.trim() : null; }
  // rareté de la carte : l'étiquette en haut à gauche (C, PC, R, SR, UR, L)
  function rarityOf(card) {
    if (!card) return null;
    for (const el of card.querySelectorAll('div, span')) {
      if (el.childElementCount) continue;
      const t = el.textContent.trim();
      if (/^(C|PC|R|SR|UR|L)$/.test(t) && /top-2/.test(el.className) && /left-2/.test(el.className)) return t;
    }
    // secours : le fond de rareté
    const bg = card.querySelector('img[src*="/rarity/"]');
    const f = bg ? (bg.getAttribute('src') || '') : '';
    if (/legend/i.test(f)) return 'L';
    if (/ultra/i.test(f)) return 'UR';
    if (/super/i.test(f)) return 'SR';
    if (/peu/i.test(f)) return 'PC';
    if (/rare/i.test(f)) return 'R';
    if (/commun/i.test(f)) return 'C';
    return null;
  }
  function descOf(card) { const h = card && card.querySelector('h3'); const d = h && h.nextElementSibling; return d ? d.textContent.trim() : ''; }
  // l'image principale de la carte (pas le fond de rareté)
  // On cherche l'image dans l'encadré du haut de la carte. Certaines cartes ont des images en plus
  // (fond de rareté, cadre décoratif…) : on ne doit pas les confondre avec la photo.
  function mainImg(card) {
    if (!card) return null;
    const imgs = [...card.querySelectorAll('img')].filter((i) => !i.closest('.wmi-badge') && !(i.getAttribute('src') || '').includes('/rarity/'));
    const title = titleOf(card);
    return imgs.find((i) => i.classList.contains('wmi-img'))
      || imgs.find((i) => (i.getAttribute('src') || '').includes(PLACEHOLDER))
      || imgs.find((i) => title && i.alt === title)
      || imgs.find((i) => /h-\[45%\]/.test((i.closest('[class*="h-[45%]"]') || {}).className || ''))
      || imgs[0]
      || null;
  }
  const isEmpty = (img) => (img.getAttribute('src') || '').includes(PLACEHOLDER) || (img.dataset.wmiOrig || '').includes(PLACEHOLDER);
  const isMediaDesc = (d) => /\b(film|série|serie|feuilleton|téléfilm|telefilm|franchise|saga|anime|émission)/i.test(d);
  const isPosterUrl = (u) => /poster|affiche|logo/i.test(decodeURIComponent(u));
  // nom du fichier sans la taille de miniature : pour savoir si deux liens montrent la même image
  const fileKey = (u) => {
    let f = (u || '').split('?')[0].split('/').pop();
    try { f = decodeURIComponent(f); } catch (e) { /* lien mal encodé */ }
    return f.replace(/^\d+px-/, '').replace(/[\s_]+/g, '_').toLowerCase();
  };
  // images qui n'ont pas pu s'afficher pendant cette visite : on ne les réessaie pas (évite le clignotement)
  const badUrls = new Set();
  const tries = new Map();

  // image de mauvaise qualité = trop petite
  function isPoor(img) {
    return new Promise((ok) => {
      const check = () => ok(img.naturalWidth > 0 && (img.naturalWidth < 220 || img.naturalHeight < 150));
      if (img.complete) return check();
      img.addEventListener('load', check, { once: true });
      img.addEventListener('error', () => ok(true), { once: true });
      setTimeout(() => ok(false), 4000);
    });
  }

  async function firstLoadable(list, exceptUrl) {
    for (const c of list.slice(0, 6)) {
      if (badUrls.has(c.url)) continue;
      if (exceptUrl && fileKey(c.url) === fileKey(exceptUrl)) continue;
      if (await loads(c.url)) return c.url;
    }
    return null;
  }

  const SHOWN_PREFIX = 'wmi-shown:';     // cartes actuellement modifiées (pour le total)

  function cardTitleOfImg(img) { return titleOf(cardOf(img)); }

  // petit message en bas de l'écran
  function toast(text) {
    const t = document.createElement('div');
    t.className = 'wmi-toast';
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 7000);
  }

  // ---------- copie en mémoire des choix faits à la main (lecture instantanée) ----------
  // (chargées une seule fois à l'ouverture de la page, puis tenues à jour : pas de relecture complète,
  //  même avec une collection de 30 000 cartes)
  const manualChoices = new Map();
  const reapplied = new Map();
  const shownAll = new Map();          // toutes les cartes modifiées (toutes pages) : titre → image
  ext.storage.onChanged.addListener((ch, area) => {
    if (area && area !== 'local') return;
    for (const k of Object.keys(ch)) {
      const nv = ch[k].newValue;
      if (k.startsWith(CHOICE_PREFIX)) {
        const t = k.slice(CHOICE_PREFIX.length);
        if (nv === undefined) manualChoices.delete(t); else manualChoices.set(t, nv);
      } else if (k.startsWith(SHOWN_PREFIX)) {
        const t = k.slice(SHOWN_PREFIX.length);
        if (nv === undefined) shownAll.delete(t); else shownAll.set(t, nv.url);
      } else if (k.startsWith(FRAME_PREFIX)) {
        const t = k.slice(FRAME_PREFIX.length);
        if (nv === undefined) frames.delete(t); else frames.set(t, nv);
      }
    }
  });

  // ---------- cadrage (recadrage) choisi par carte ----------
  const FRAME_PREFIX = 'wmi-frame:';
  // cadrage + retouches : position (x, y), zoom (z), luminosité (b), contraste (c), saturation (s),
  // noir et blanc (g), sépia (sp), miroir (m), vignette (v)
  const DEFAULT_LOOK = { b: 100, c: 100, s: 100, g: 0, sp: 0, m: 0, v: 0 };
  const DEFAULT_FRAME = { x: 50, y: 25, z: 1, ...DEFAULT_LOOK };
  const frames = new Map();
  let loadedDone = false;
  const loaded = ext.storage.local.get(null).then((all) => {
    for (const k of Object.keys(all)) {
      if (k.startsWith(CHOICE_PREFIX)) manualChoices.set(k.slice(CHOICE_PREFIX.length), all[k]);
      else if (k.startsWith(FRAME_PREFIX)) frames.set(k.slice(FRAME_PREFIX.length), all[k]);
      else if (k.startsWith(SHOWN_PREFIX)) shownAll.set(k.slice(SHOWN_PREFIX.length), all[k] && all[k].url);
    }
    loadedDone = true;
    document.querySelectorAll('img.wmi-img').forEach((i) => applyFrame(i, i.dataset.wmiTitle));
    scan();
  }, () => { loadedDone = true; });
  function frameFor(title, url) {
    const f = frames.get(title);
    return f && f.url === url ? { ...DEFAULT_FRAME, ...f } : DEFAULT_FRAME;
  }
  function setFrameStyle(el, f) {
    f = { ...DEFAULT_FRAME, ...f };
    el.style.setProperty('object-position', `${f.x}% ${f.y}%`, 'important');
    el.style.setProperty('transform-origin', `${f.x}% ${f.y}%`, 'important');
    el.style.setProperty('transform', `scale(${f.m ? -f.z : f.z}, ${f.z})`, 'important');
    const filter = `brightness(${f.b}%) contrast(${f.c}%) saturate(${f.s}%) grayscale(${f.g ? 1 : 0}) sepia(${f.sp ? 1 : 0})`;
    if (filter === 'brightness(100%) contrast(100%) saturate(100%) grayscale(0) sepia(0)') el.style.removeProperty('filter');
    else el.style.setProperty('filter', filter, 'important');
    // vignette : bords assombris, posés sur le bloc qui contient l'image
    if (el.parentElement) el.parentElement.classList.toggle('wmi-vignette', !!f.v);
  }
  function applyFrame(img, title) {
    if (!title || !img.dataset.wmiUrl) return;
    setFrameStyle(img, frameFor(title, img.dataset.wmiUrl));
  }

  function showImage(img, url, title) {
    if (!img.classList.contains('wmi-img')) img.dataset.wmiOrig = img.getAttribute('src');
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    // le jeu charge ses images en mode « crossorigin », que les autres sites refusent → l'image plantait
    img.removeAttribute('crossorigin');
    img.src = url;
    img.addEventListener('error', () => {
      if (img.dataset.wmiUrl !== url) return;
      badUrls.add(url);
      // image choisie à la main qui ne s'affiche pas (site qui bloque, lien mort) : on prévient et on oublie ce choix
      if (manualChoices.get(title) === url) {
        manualChoices.delete(title);
        toast(`« ${title} » : cette image refuse de s'afficher sur WikiMasters (le site qui l'héberge le bloque ou le lien est mort). Choisis-en une autre.`);
      }
      store.get(CHOICE_PREFIX + title).then((c) => { if (c === url) store.remove(CHOICE_PREFIX + title); });
      showOriginal(img, title);
    }, { once: true });
    img.classList.add('wmi-img');
    img.dataset.wmiUrl = url;
    img.dataset.wmiTitle = title;
    applyFrame(img, title);
    // le jeu met une marge autour de son logo : on l'enlève pour que l'image remplisse tout l'encadré
    const box = img.parentElement;
    if (box) box.classList.add('wmi-box');
    if (box && box.parentElement) box.parentElement.classList.add('wmi-frame');
    setBadge(cardOf(img), title, true);
    if (shownAll.get(title) !== url) {      // on n'écrit que si ça a changé
      shownAll.set(title, url);
      store.set(SHOWN_PREFIX + title, { url, ts: Date.now() });
    }
    refreshPanel();
  }

  function unstyle(img) {
    img.classList.remove('wmi-img');
    ['object-position', 'transform-origin', 'transform', 'filter'].forEach((p) => img.style.removeProperty(p));
    if (img.parentElement) img.parentElement.classList.remove('wmi-vignette');
    delete img.dataset.wmiUrl;
    delete img.dataset.wmiTitle;
    delete img.dataset.wmiOrig;
    const box = img.parentElement;
    if (box) box.classList.remove('wmi-box');
    if (box && box.parentElement) box.parentElement.classList.remove('wmi-frame');
  }

  // remet l'image d'origine du jeu (ou le logo si la carte n'en avait pas)
  function showOriginal(img, title) {
    if (img.dataset.wmiOrig) img.src = img.dataset.wmiOrig;
    unstyle(img);
    img.dataset.wmiChecked = title + '|' + img.getAttribute('src');
    setBadge(cardOf(img), title, false);
    if (shownAll.has(title)) { shownAll.delete(title); store.remove(SHOWN_PREFIX + title); }
    refreshPanel();
  }

  // Petit badge 🖼 en bas de chaque carte :
  //  - toujours visible (orange) sur les cartes modifiées
  //  - visible au survol sur les autres, pour pouvoir changer n'importe quelle image
  function setBadge(card, title, modified) {
    if (!inGrid(card)) return;   // dans la fiche ouverte, on utilise le bouton « Changer l'image »
    const holder = card.querySelector(':scope > div') || card;
    let b = holder.querySelector(':scope > .wmi-badge');
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.className = 'wmi-badge';
      b.textContent = '🖼';
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const i = mainImg(card);
        if (i) openPicker(i, b.dataset.title);
      }, true);
      holder.appendChild(b);
    }
    b.dataset.title = title;
    b.classList.toggle('wmi-on', modified);
    b.title = modified ? 'Image changée par l\'extension — clique pour la modifier' : 'Clique pour changer l\'image de cette carte';
  }

  // Le site réutilise les mêmes cartes quand on change de page : on nettoie ce qui ne correspond plus
  function cleanup() {
    document.querySelectorAll('img.wmi-img').forEach((img) => {
      if (img.getAttribute('src') !== img.dataset.wmiUrl || cardTitleOfImg(img) !== img.dataset.wmiTitle) unstyle(img);
    });
    document.querySelectorAll('.wmi-badge').forEach((b) => {
      const card = cardOf(b);
      if (!card || titleOf(card) !== b.dataset.title) b.remove();
      else if (b.classList.contains('wmi-on') && !card.querySelector('img.wmi-img')) b.classList.remove('wmi-on');
    });
  }

  async function handle(card) {
    const img = mainImg(card);
    const title = titleOf(card);
    if (!img || !title) return;
    if (img.dataset.wmiBusy) return;
    // on attend d'avoir chargé tes choix avant de décider quoi afficher
    // (sinon l'image automatique pouvait passer devant ton choix en revenant sur la collection)
    if (!loadedDone) {
      img.dataset.wmiBusy = '1';
      await loaded;
      delete img.dataset.wmiBusy;
      if (titleOf(cardOf(img)) !== title) return;
    }
    const manualNow = manualChoices.get(title);
    if (img.classList.contains('wmi-img') && img.dataset.wmiTitle === title) {
      // déjà modifiée : on vérifie juste que c'est bien ton choix qui est affiché
      if (manualNow === 'none') { showOriginal(img, title); return; }
      if (manualNow && !badUrls.has(manualNow) && img.dataset.wmiUrl !== manualNow) showImage(img, manualNow, title);
      return;
    }
    const src = img.getAttribute('src') || '';
    const key = title + '|' + src;
    // Une image choisie à la main est toujours remise, même si le site a ré-affiché la sienne entre-temps
    const manual = manualChoices.get(title);
    if (manual && manual !== 'none' && !badUrls.has(manual) && src !== manual) {
      const m = (reapplied.get(title) || 0) + 1;
      reapplied.set(title, m);
      if (m <= 6) { showImage(img, manual, title); return; }
    }
    if (img.dataset.wmiChecked === key) return;
    // rareté désactivée : pas de modification automatique (ton choix manuel, lui, est appliqué plus haut)
    await modeReady;
    if (offRarities.size && offRarities.has(rarityOf(card))) { img.dataset.wmiChecked = key; return; }
    // sécurité anti-clignotement : pas plus de 3 essais par carte et par visite
    const n = (tries.get(title) || 0) + 1;
    tries.set(title, n);
    if (n > 3) { img.dataset.wmiChecked = key; return; }
    img.dataset.wmiBusy = '1';
    try {
      setBadge(card, title, false);
      await modeReady;
      const empty = src.includes(PLACEHOLDER);
      const desc = descOf(card);
      const choice = await store.get(CHOICE_PREFIX + title);
      let url = null;
      if (choice && choice !== 'none') {
        url = choice;                                   // choisi à la main : prioritaire
      } else if (!choice && empty) {
        url = await firstLoadable(await getCandidates(title, desc));
      } else if (!choice && mode === 'all') {
        // l'image du jeu vient déjà de Wikipédia FR : on cherche une image venant d'ailleurs
        // (affiche, TMDB, Deezer, Wikidata, Wikipédia EN), sinon on garde l'originale
        const others = (await getCandidates(title, desc)).filter((c) => c.source !== 'Wikipédia FR');
        const media = isMediaDesc(desc);
        const ranked = media ? others.filter((c) => c.source === 'TMDB' || isPosterUrl(c.url)) : others;
        url = await firstLoadable(ranked, src);
      } else if (!choice && mode === 'improve') {
        if (await isPoor(img)) {
          url = await firstLoadable(await getCandidates(title, desc), src);
        } else if (isMediaDesc(desc) && !isPosterUrl(src)) {
          // film ou série dont l'image n'est pas une affiche : on prend l'affiche si on la trouve
          const posters = (await getCandidates(title, desc)).filter((c) => c.source === 'TMDB' || isPosterUrl(c.url));
          url = await firstLoadable(posters, src);
        }
      }
      // la carte a pu changer pendant la recherche (changement de page)
      if (cardTitleOfImg(img) !== title || img.getAttribute('src') !== src) return;
      img.dataset.wmiChecked = key;
      if (url) showImage(img, url, title);
    } finally {
      delete img.dataset.wmiBusy;
      refreshPanel();
    }
  }

  // ---------- réglage : bouton 🖼 directement sur les cartes de la collection ----------
  let showBadges = false;
  function applyBadgeSetting() { document.documentElement.classList.toggle('wmi-nobadges', !showBadges); }
  ext.storage.local.get('showBadges').then((r) => { showBadges = !!r.showBadges; applyBadgeSetting(); });
  ext.storage.onChanged.addListener((ch) => {
    if (ch.showBadges) { showBadges = !!ch.showBadges.newValue; applyBadgeSetting(); refreshPanel(); }
  });
  applyBadgeSetting();

  // applique un changement à toutes les cartes affichées qui portent ce titre (collection + fiche ouverte)
  function forEachCardTitled(title, fn) {
    allCards().forEach((c) => { if (titleOf(c) === title) { const i = mainImg(c); if (i) fn(i); } });
  }

  // ---------- fiche ouverte : bouton « Changer l'image » ----------
  function addDetailButton() {
    const link = [...document.querySelectorAll('a[href*="wikipedia.org/wiki/"]')].find((a) => /Voir l.article/i.test(a.textContent));
    if (!link || link.parentElement.querySelector('.wmi-detail-btn')) return;
    // la grande carte de la fiche = celle dont le titre correspond à la fiche
    const sheet = link.closest('.card-frame') || link.parentElement.parentElement;
    const bigCard = allCards().find((c) => !inGrid(c) && sheet.contains(c));
    if (!bigCard) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wmi-detail-btn';
    btn.textContent = '🖼 Changer l\'image';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const img = mainImg(bigCard);
      if (img) openPicker(img, titleOf(bigCard));
    }, true);
    link.parentElement.insertBefore(btn, link);
  }

  function allCards() {
    const set = new Set();
    document.querySelectorAll('h3').forEach((h) => { const c = cardOf(h); if (c && mainImg(c)) set.add(c); });
    return [...set];
  }

  function scan() {
    cleanup();
    allCards().forEach(handle);
    addDetailButton();
    refreshPanel();
  }

  // ---------- menu en bas de la page ----------
  let panel = null;
  let panelOpen = false;
  let listFilter = '';
  let showAll = false;
  let panelTimer = null;

  function refreshPanel() {
    clearTimeout(panelTimer);
    panelTimer = setTimeout(renderPanel, 200);
  }

  function flash(card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('wmi-flash');
    void card.offsetWidth;
    card.classList.add('wmi-flash');
  }

  async function renderPanel() {
    // ne pas tout redessiner pendant qu'on tape dans le filtre ou qu'on choisit un mode
    if (panel && panel.contains(document.activeElement) && /^(INPUT|SELECT)$/.test(document.activeElement.tagName)) return;
    const cardsOnPage = [...document.querySelectorAll('h3')].filter((h) => cardOf(h) && cardOf(h).querySelector('img'));
    const modified = [...document.querySelectorAll('img.wmi-img')]
      .filter((i) => i.dataset.wmiTitle && cardTitleOfImg(i) === i.dataset.wmiTitle);
    const empty = allCards().map(mainImg).filter((i) => i && (i.getAttribute('src') || '').includes(PLACEHOLDER));
    const totalCount = shownAll.size;

    if (!cardsOnPage.length && !totalCount) { panel?.remove(); panel = null; return; }
    if (!panel || !panel.isConnected) {
      panel = document.createElement('div');
      panel.className = 'wmi-bar';
      document.body.appendChild(panel);
    }

    panel.innerHTML = '';
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'wmi-bar-head';
    head.innerHTML = `<span>🖼</span> <b></b> modifiée(s) sur cette page <span class="wmi-dim"></span> <span class="wmi-arrow"></span>`;
    head.querySelector('b').textContent = modified.length;
    head.querySelector('.wmi-dim').textContent = `· ${empty.length} sans image · ${totalCount.toLocaleString("fr-FR")} au total`;
    head.querySelector('.wmi-arrow').textContent = panelOpen ? '▼' : '▲';
    head.onclick = () => { panelOpen = !panelOpen; renderPanel(); };
    panel.appendChild(head);
    if (!panelOpen) return;

    let body = document.createElement('div');
    body.className = 'wmi-bar-body';

    // choix du mode
    const modeRow = document.createElement('label');
    modeRow.className = 'wmi-mode';
    modeRow.innerHTML = `<span>Cartes à modifier :</span>
      <select>
        <option value="empty">Seulement les cartes sans image</option>
        <option value="improve">Sans image + images de mauvaise qualité</option>
        <option value="all">Toutes les cartes</option>
      </select>`;
    const sel = modeRow.querySelector('select');
    sel.value = mode;
    sel.onchange = () => ext.storage.local.set({ mode: sel.value });  // la page se recharge toute seule
    body.appendChild(modeRow);

    // raretés à modifier automatiquement
    const rarRow = document.createElement('div');
    rarRow.className = 'wmi-mode wmi-rar';
    rarRow.innerHTML = '<span>Raretés modifiées automatiquement :</span>';
    for (const [code, label] of RARITIES) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'wmi-chip' + (offRarities.has(code) ? '' : ' wmi-on');
      chip.textContent = code;
      chip.title = label + (offRarities.has(code) ? ' : désactivée' : ' : activée');
      chip.onclick = () => {
        const next = new Set(offRarities);
        next.has(code) ? next.delete(code) : next.add(code);
        ext.storage.local.set({ offRarities: [...next] });   // la page se recharge toute seule
      };
      rarRow.appendChild(chip);
    }
    body.appendChild(rarRow);

    // compteur des images personnalisées à la main + place dans la synchro
    const manualCount = [...manualChoices.values()].filter((v) => v && v !== 'none').length;
    const cap = syncInfo && syncInfo.ok && syncInfo.cards && syncInfo.bytes
      ? Math.floor(syncInfo.cards * 92000 / syncInfo.bytes / 100) * 100 : 2000;
    const counter = document.createElement('div');
    counter.className = 'wmi-counter';
    const pct = Math.min(100, Math.round(manualCount / cap * 100));
    counter.innerHTML = `<div><b></b> image(s) choisie(s) à la main <span class="wmi-dim"></span></div><div class="wmi-gauge"><i></i></div>`;
    counter.querySelector('b').textContent = manualCount.toLocaleString('fr-FR');
    counter.querySelector('.wmi-dim').textContent = syncInfo && syncInfo.full
      ? `· synchro entre PC pleine : les ${syncInfo.cards.toLocaleString('fr-FR')} plus récentes suivent, utilise la sauvegarde pour le reste`
      : `· synchro entre PC : ${manualCount.toLocaleString('fr-FR')} / ≈ ${cap.toLocaleString('fr-FR')} (sans limite sur ce PC)`;
    counter.querySelector('i').style.width = pct + '%';
    if (pct >= 90) counter.classList.add('wmi-warn');
    body.appendChild(counter);

    const badgeRow = document.createElement('label');
    badgeRow.className = 'wmi-mode wmi-check';
    badgeRow.innerHTML = `<input type="checkbox"> <span>Afficher le bouton 🖼 directement sur les cartes de la collection</span>`;
    const cb = badgeRow.querySelector('input');
    cb.checked = showBadges;
    cb.onchange = () => ext.storage.local.set({ showBadges: cb.checked });
    body.appendChild(badgeRow);
    const hint = document.createElement('div');
    hint.className = 'wmi-dim wmi-hint';
    hint.textContent = showBadges ? '' : 'Pour changer une image : ouvre la carte, puis « 🖼 Changer l\'image ».';
    if (hint.textContent) body.appendChild(hint);

    const section = (label, items, cls) => {
      const h = document.createElement('div');
      h.className = 'wmi-bar-title';
      h.textContent = label;
      body.appendChild(h);
      if (!items.length) {
        const p = document.createElement('div');
        p.className = 'wmi-dim wmi-bar-none';
        p.textContent = 'Aucune';
        body.appendChild(p);
        return;
      }
      const list = document.createElement('div');
      list.className = 'wmi-bar-list';
      for (const it of items) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'wmi-row ' + (cls || '');
        if (it.thumb) {
          const t = document.createElement('img');
          t.src = it.thumb;
          row.appendChild(t);
        }
        const s = document.createElement('span');
        s.textContent = it.title;
        row.appendChild(s);
        if (it.onClick) row.onclick = it.onClick; else row.disabled = true;
        list.appendChild(row);
      }
      body.appendChild(list);
    };

    section('Modifiées sur cette page — clique pour la retrouver', modified.map((i) => ({
      title: i.dataset.wmiTitle, thumb: i.dataset.wmiUrl, onClick: () => flash(cardOf(i)),
    })));
    section('Toujours sans image sur cette page — clique pour en choisir une', empty.map((i) => ({
      title: titleOf(cardOf(i)), onClick: () => { flash(cardOf(i)); openPicker(i, titleOf(cardOf(i))); },
    })), 'wmi-row-empty');

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'wmi-bar-toggle';
    toggle.textContent = showAll ? `Masquer la liste complète` : `Voir toutes les cartes modifiées (${totalCount.toLocaleString('fr-FR')})`;
    toggle.onclick = () => { showAll = !showAll; renderPanel(); };
    body.appendChild(toggle);
    if (showAll) {
      // liste filtrable : avec 30 000 cartes, on n'en affiche que 200 à la fois
      const LIMIT = 200;
      const onPage = new Map(modified.map((i) => [i.dataset.wmiTitle, i]));
      const search = document.createElement('input');
      search.type = 'search';
      search.className = 'wmi-bar-search';
      search.placeholder = 'Filtrer par nom…';
      search.value = listFilter;
      body.appendChild(search);
      const holder = document.createElement('div');
      body.appendChild(holder);
      const fill = () => {
        holder.innerHTML = '';
        const q = listFilter.toLowerCase();
        const titles = [];
        for (const t of shownAll.keys()) { if (!q || t.toLowerCase().includes(q)) titles.push(t); }
        titles.sort((a, b) => a.localeCompare(b, 'fr'));
        const saved = body;
        body = holder;   // section() écrit dans « body »
        section(`Toutes les cartes modifiées (${titles.length.toLocaleString('fr-FR')})`, titles.slice(0, LIMIT).map((t) => ({
          title: t, thumb: shownAll.get(t),
          onClick: onPage.has(t) ? () => flash(cardOf(onPage.get(t))) : null,
        })));
        if (titles.length > LIMIT) {
          const more = document.createElement('div');
          more.className = 'wmi-dim wmi-bar-none';
          more.textContent = `… et ${(titles.length - LIMIT).toLocaleString('fr-FR')} autres : tape un nom pour filtrer.`;
          holder.appendChild(more);
        }
        body = saved;
      };
      search.oninput = () => { listFilter = search.value; fill(); };
      fill();
    }
    panel.appendChild(body);
  }

  // ---------- fenêtre « Ajuster le cadrage » ----------
  function openAdjust(img, title, url) {
    document.querySelector('.wmi-modal')?.remove();
    // même forme que l'encadré de la carte
    const frameEl = img.parentElement && img.parentElement.parentElement;
    const r = frameEl ? frameEl.getBoundingClientRect() : null;
    const ratio = r && r.width && r.height ? r.width / r.height : 1.55;
    const W = Math.min(440, window.innerWidth * 0.8);
    const H = W / ratio;
    let f = { ...frameFor(title, url) };

    const modal = document.createElement('div');
    modal.className = 'wmi-modal';
    modal.innerHTML = `
      <div class="wmi-panel wmi-adjust">
        <div class="wmi-head"><strong>Ajuster l'image</strong><button type="button" class="wmi-close" title="Fermer">✕</button></div>
        <div class="wmi-dim wmi-adj-title"></div>
        <div class="wmi-adj-box"><img alt=""></div>
        <div class="wmi-adj-zoom"><span>🔍</span><input type="range" min="1" max="3" step="0.01"><span class="wmi-adj-val"></span></div>
        <div class="wmi-dim wmi-adj-hint">Glisse l'image pour la déplacer · molette ou curseur pour zoomer</div>
        <div class="wmi-sub">Retouches</div>
        <div class="wmi-look">
          <label>☀ Luminosité<input type="range" data-k="b" min="40" max="160" step="1"></label>
          <label>◑ Contraste<input type="range" data-k="c" min="40" max="160" step="1"></label>
          <label>🎨 Saturation<input type="range" data-k="s" min="0" max="200" step="1"></label>
        </div>
        <div class="wmi-toggles">
          <button type="button" data-t="g">⚫ Noir et blanc</button>
          <button type="button" data-t="sp">🟤 Sépia</button>
          <button type="button" data-t="m">↔ Miroir</button>
          <button type="button" data-t="v">◐ Vignette</button>
          <button type="button" class="wmi-look-reset">Annuler les retouches</button>
        </div>
        <div class="wmi-actions">
          <button type="button" class="wmi-adj-reset">Recentrer</button>
          <span style="flex:1"></span>
          <button type="button" class="wmi-adj-cancel">Garder sans ajuster</button>
          <button type="button" class="wmi-use wmi-adj-ok">Valider</button>
        </div>
      </div>`;
    modal.querySelector('.wmi-adj-title').textContent = title;
    const box = modal.querySelector('.wmi-adj-box');
    box.style.width = W + 'px';
    box.style.height = H + 'px';
    const pic = box.querySelector('img');
    pic.src = url;
    const zoom = modal.querySelector('input[type=range]');
    const val = modal.querySelector('.wmi-adj-val');
    const sliders = [...modal.querySelectorAll('.wmi-look input')];
    const toggles = [...modal.querySelectorAll('.wmi-toggles [data-t]')];
    sliders.forEach((s) => { s.oninput = () => { f[s.dataset.k] = +s.value; render(); }; });
    toggles.forEach((t) => { t.onclick = () => { f[t.dataset.t] = f[t.dataset.t] ? 0 : 1; render(); }; });
    modal.querySelector('.wmi-look-reset').onclick = () => { Object.assign(f, DEFAULT_LOOK); render(); };
    const render = () => {
      setFrameStyle(pic, f);
      sliders.forEach((s) => { s.value = f[s.dataset.k]; });
      toggles.forEach((t) => t.classList.toggle('wmi-on', !!f[t.dataset.t]));
      zoom.value = f.z;
      val.textContent = Math.round(f.z * 100) + ' %';
      // aperçu en direct sur les cartes
      forEachCardTitled(title, (i) => { if (i.dataset.wmiUrl === url) setFrameStyle(i, f); });
    };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    // glisser pour déplacer
    let drag = null;
    box.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; box.setPointerCapture(e.pointerId); e.preventDefault(); });
    box.addEventListener('pointermove', (e) => {
      if (!drag || !pic.naturalWidth) return;
      const s = Math.max(W / pic.naturalWidth, H / pic.naturalHeight);
      const rangeX = pic.naturalWidth * s * f.z - W;   // de combien l'image dépasse du cadre
      const rangeY = pic.naturalHeight * s * f.z - H;
      if (rangeX > 1) f.x = clamp(f.x - (e.clientX - drag.x) / rangeX * 100, 0, 100);
      if (rangeY > 1) f.y = clamp(f.y - (e.clientY - drag.y) / rangeY * 100, 0, 100);
      drag = { x: e.clientX, y: e.clientY };
      render();
    });
    const stop = () => { drag = null; };
    box.addEventListener('pointerup', stop);
    box.addEventListener('pointercancel', stop);
    // zoom
    box.addEventListener('wheel', (e) => { e.preventDefault(); f.z = clamp(f.z - e.deltaY * 0.0015, 1, 3); render(); }, { passive: false });
    zoom.oninput = () => { f.z = +zoom.value; render(); };

    const close = () => modal.remove();
    const restore = () => forEachCardTitled(title, (i) => applyFrame(i, title));
    modal.addEventListener('click', (e) => { e.stopPropagation(); if (e.target === modal) { restore(); close(); } });
    modal.querySelector('.wmi-close').onclick = () => { restore(); close(); };
    modal.querySelector('.wmi-adj-cancel').onclick = () => { restore(); close(); };
    modal.querySelector('.wmi-adj-reset').onclick = () => { Object.assign(f, { x: DEFAULT_FRAME.x, y: DEFAULT_FRAME.y, z: 1 }); render(); };
    modal.querySelector('.wmi-adj-ok').onclick = async () => {
      const saved = { url, x: Math.round(f.x * 10) / 10, y: Math.round(f.y * 10) / 10, z: Math.round(f.z * 100) / 100 };
      // on n'enregistre que les retouches réellement utilisées (moins de place pour la synchro)
      for (const k of Object.keys(DEFAULT_LOOK)) if (f[k] !== DEFAULT_LOOK[k]) saved[k] = f[k];
      frames.set(title, saved);
      await store.set(FRAME_PREFIX + title, saved);
      restore();
      close();
    };
    document.body.appendChild(modal);
    render();
  }

  // ---------- fenêtre pour choisir l'image ----------
  async function openPicker(img, title) {
    document.querySelector('.wmi-modal')?.remove();
    const desc = descOf(cardOf(img));
    const modal = document.createElement('div');
    modal.className = 'wmi-modal';
    modal.innerHTML = `
      <div class="wmi-panel">
        <div class="wmi-head">
          <strong></strong>
          <button type="button" class="wmi-close" title="Fermer">✕</button>
        </div>
        <div class="wmi-grid"><p class="wmi-msg">Recherche des images…</p></div>
        <div class="wmi-sub">Google Images <span class="wmi-dim">— liens temporaires, l'image peut disparaître avec le temps</span></div>
        <div class="wmi-grid wmi-ggrid"><p class="wmi-msg">Recherche sur Google…</p></div>
        <div class="wmi-sub">GIF animés 🎞 <span class="wmi-dim">— pour une carte qui bouge !</span></div>
        <div class="wmi-grid wmi-gifgrid"><button type="button" class="wmi-gif-btn">🎞 Proposer des GIF</button></div>
        <div class="wmi-more-row">
          <button type="button" class="wmi-more">Plus d'images (Openverse)</button>
          <a class="wmi-google" target="_blank" rel="noopener">Ouvrir Google Images ↗</a>
        </div>
        <div class="wmi-paste">
          <input type="url" placeholder="Colle ici le lien d'une image ou d'un GIF (clic droit dessus → « Copier l'adresse de l'image »)">
          <button type="button" class="wmi-use">Utiliser</button>
        </div>
        <div class="wmi-actions">
          <button type="button" class="wmi-settings">⚙ Réglages (clé TMDB)</button>
          <span style="flex:1"></span>
          <button type="button" class="wmi-crop">✂ Recadrer l'image actuelle</button>
          <button type="button" class="wmi-logo">Remettre l'image d'origine</button>
          <button type="button" class="wmi-reset">Choix automatique</button>
        </div>
      </div>`;
    modal.querySelector('strong').textContent = title;
    if (isEmpty(img)) modal.querySelector('.wmi-logo').textContent = 'Remettre le logo';
    modal.querySelector('.wmi-google').href = 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(title);
    const close = () => modal.remove();
    modal.addEventListener('click', (e) => { e.stopPropagation(); if (e.target === modal) close(); });
    modal.querySelector('.wmi-close').onclick = close;
    modal.querySelector('.wmi-settings').onclick = () => ask({ type: 'options' });

    const pick = async (url) => {
      manualChoices.set(title, url);
      reapplied.delete(title);
      badUrls.delete(url);
      await store.set(CHOICE_PREFIX + title, url);
      forEachCardTitled(title, (i) => showImage(i, url, title));
      openAdjust(img, title, url);   // dernière étape : ajuster le cadrage
    };
    const cropBtn = modal.querySelector('.wmi-crop');
    if (isEmpty(img) && !img.classList.contains('wmi-img')) cropBtn.disabled = true;
    cropBtn.onclick = () => {
      if (img.classList.contains('wmi-img')) openAdjust(img, title, img.dataset.wmiUrl);
      else pick(img.currentSrc || img.src);   // image d'origine du jeu : on la garde, et on la recadre
    };
    modal.querySelector('.wmi-use').onclick = () => {
      let v = modal.querySelector('.wmi-paste input').value.trim();
      // lien d'une page Giphy (giphy.com/gifs/nom-ID) → lien direct du GIF
      const g = v.match(/giphy\.com\/(?:gifs|stickers)\/(?:[\w-]*-)?([A-Za-z0-9]+)\/?(?:[?#].*)?$/);
      if (g) v = `https://media.giphy.com/media/${g[1]}/giphy.gif`;
      if (/^https?:\/\//.test(v)) pick(v);
    };
    modal.querySelector('.wmi-logo').onclick = async () => {
      await store.set(CHOICE_PREFIX + title, 'none');
      forEachCardTitled(title, (i) => { if (i.classList.contains('wmi-img')) showOriginal(i, title); });
      close();
    };
    modal.querySelector('.wmi-reset').onclick = async () => {
      await store.remove(CHOICE_PREFIX + title);
      forEachCardTitled(title, (i) => {
        if (i.classList.contains('wmi-img')) showOriginal(i, title);
        delete i.dataset.wmiChecked;
        handle(cardOf(i));
      });
      close();
    };
    document.body.appendChild(modal);

    const grid = modal.querySelector('.wmi-grid');
    const ggrid = modal.querySelector('.wmi-ggrid');
    const addThumbs = (list, target = grid) => {
      for (const c of list) {
        if (modal.querySelector(`[data-url="${CSS.escape(c.url)}"]`)) continue;
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.url = c.url;
        b.className = 'wmi-thumb' + (img.dataset.wmiUrl === c.url ? ' wmi-current' : '');
        const i = document.createElement('img');
        i.src = c.url;
        i.loading = 'lazy';
        i.onerror = () => b.remove();   // image cassée : on la retire
        const tag = document.createElement('span');
        tag.className = 'wmi-src';
        tag.textContent = c.source;
        b.append(i, tag);
        b.onclick = () => pick(c.url);
        target.appendChild(b);
      }
    };

    // GIF : chargés seulement si on les demande (ils sont lourds)
    const gifgrid = modal.querySelector('.wmi-gifgrid');
    modal.querySelector('.wmi-gif-btn').onclick = async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'Recherche des GIF…';
      const gl = await ask({ type: 'gifs', title });
      const ok = [];
      for (const c of gl) {
        if (ok.length >= 6) break;
        if (await loads(c.url)) ok.push({ url: c.url, source: 'GIF' });
      }
      if (!modal.isConnected) return;
      gifgrid.innerHTML = '';
      if (ok.length) addThumbs(ok, gifgrid);
      else gifgrid.innerHTML = '<p class="wmi-msg">Aucun GIF trouvé. Tu peux coller le lien d\'un GIF ci-dessous (Giphy, Tenor…).</p>';
    };

    // Google : 3 images qui s'affichent vraiment (en parallèle de la recherche normale)
    ask({ type: 'google', title }).then(async (gl) => {
      const ok = [];
      for (const c of gl) {
        if (ok.length >= 3) break;
        if (await loads(c.url)) ok.push(c);
      }
      if (!modal.isConnected) return;
      ggrid.innerHTML = '';
      if (ok.length) addThumbs(ok, ggrid);
      else ggrid.innerHTML = '<p class="wmi-msg">Rien de Google cette fois. Utilise « Ouvrir Google Images ↗ » puis colle le lien.</p>';
    });

    const list = await getCandidates(title, desc);
    grid.innerHTML = '';
    if (list.length) addThumbs(list);
    else grid.innerHTML = '<p class="wmi-msg">Aucune image trouvée automatiquement. Essaie « Plus d\'images », Google Images, ou colle un lien ci-dessous.</p>';

    modal.querySelector('.wmi-more').onclick = async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'Recherche…';
      const more = await ask({ type: 'more', title });
      grid.querySelector('.wmi-msg')?.remove();
      addThumbs(more);
      e.target.textContent = more.length ? `${more.length} image(s) ajoutée(s)` : 'Rien de plus trouvé';
    };
  }

  // ---------- surveiller la page (changement de page, filtres, nouveaux boosters…) ----------
  let timer = null;
  const ours = (n) => n.nodeType === 1 && (n.matches('.wmi-bar, .wmi-modal, .wmi-badge, .wmi-detail-btn, .wmi-toast') || n.closest('.wmi-bar, .wmi-modal'));
  const observer = new MutationObserver((muts) => {
    // on ignore les changements faits par l'extension elle-même (menu, fenêtre, badges)
    if (muts.every((m) => ours(m.target) || (m.type === 'childList' &&
      [...m.addedNodes, ...m.removedNodes].length > 0 &&
      [...m.addedNodes, ...m.removedNodes].every(ours)))) return;
    clearTimeout(timer);
    timer = setTimeout(scan, 150);
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  scan();
})();
