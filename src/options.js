const ext = globalThis.browser || globalThis.chrome;
const input = document.getElementById('key');
const status = document.getElementById('status');
const line = document.getElementById('tmdb-line');

function showState(ok) {
  line.textContent = ok
    ? '✅ TMDB (affiches de films/séries, photos d\'acteurs) — clé active'
    : '⏳ TMDB (affiches de films/séries, photos d\'acteurs) — nécessite ta clé ci-dessous';
}

ext.storage.local.get('tmdbKey').then(({ tmdbKey }) => {
  if (tmdbKey) input.value = tmdbKey;
  showState(!!tmdbKey);
});

document.getElementById('save').onclick = async () => {
  const key = input.value.trim();
  if (!key) return;
  status.textContent = 'Test en cours…';
  const ok = await ext.runtime.sendMessage({ type: 'testTmdb', key });
  if (ok) {
    await ext.storage.local.set({ tmdbKey: key });
    status.textContent = '✅ Clé valide et enregistrée ! Recharge ta page WikiMasters.';
    showState(true);
  } else {
    status.textContent = '❌ TMDB refuse cette clé. Vérifie que tu as copié la bonne.';
  }
};

document.getElementById('clear').onclick = async () => {
  await ext.storage.local.remove('tmdbKey');
  input.value = '';
  status.textContent = 'Clé effacée.';
  showState(false);
};

const modeSel = document.getElementById('mode');
ext.storage.local.get('mode').then(({ mode }) => { modeSel.value = mode || 'improve'; });
modeSel.onchange = () => ext.storage.local.set({ mode: modeSel.value });

const badges = document.getElementById('badges');
ext.storage.local.get('showBadges').then(({ showBadges }) => { badges.checked = !!showBadges; });
badges.onchange = () => ext.storage.local.set({ showBadges: badges.checked });

// ---------- Firefox : autorisation des sites ----------
const origins = ext.runtime.getManifest().host_permissions || [];
const permBox = document.getElementById('perm');
async function checkPerm() {
  const ok = await ext.permissions.contains({ origins }).catch(() => true);
  permBox.style.display = ok ? 'none' : 'block';
}
document.getElementById('perm-btn').onclick = async () => {
  await ext.permissions.request({ origins }).catch(() => false);
  checkPerm();
};
checkPerm();

// ---------- synchro : état ----------
const syncStatus = document.getElementById('sync-status');
async function showSync() {
  const r = await ext.storage.local.get(['wmi-sync-info', 'wmi-sync-state']);
  const info = r['wmi-sync-info'];
  const n = Object.values(r['wmi-sync-state'] || {}).filter((t) => (typeof t === 'number' ? t > 0 : t && t.v !== null)).length;
  if (!ext.storage.sync) syncStatus.textContent = '❌ Ce navigateur ne propose pas la synchro des extensions.';
  else if (!info) syncStatus.textContent = `⏳ ${n} élément(s) à synchroniser — la synchro démarre à ta prochaine modification.`;
  else if (!info.ok) syncStatus.textContent = '❌ Synchro impossible : ' + info.error;
  else if (info.full) syncStatus.textContent = `⚠ Synchro pleine : les ${info.cards ?? info.count} cartes modifiées le plus récemment sont synchronisées, les autres restent sur ce PC. Utilise la sauvegarde pour tout transférer.`;
  else syncStatus.textContent = `✅ ${info.cards ?? info.count} carte(s) synchronisée(s) — dernière synchro ${new Date(info.ts).toLocaleString('fr-FR')}`;
}
showSync();
ext.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch['wmi-sync-info']) showSync(); });

// ---------- sauvegarde : exporter / importer ----------
const isSaved = (k) => k.startsWith('wmi-choice:') || k.startsWith('wmi-frame:') || ['mode', 'showBadges', 'tmdbKey', 'offRarities'].includes(k);
const io = document.getElementById('io-status');

document.getElementById('export').onclick = async () => {
  const all = await ext.storage.local.get(null);
  const data = Object.fromEntries(Object.entries(all).filter(([k]) => isSaved(k)));
  const file = { app: 'wikimasters-images', version: ext.runtime.getManifest().version, date: new Date().toISOString(), data };
  const blob = new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'wikimasters-images-sauvegarde-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  io.textContent = `✅ ${Object.keys(data).length} élément(s) exporté(s).`;
};

const fileInput = document.getElementById('import-file');
document.getElementById('import').onclick = () => fileInput.click();
fileInput.onchange = async () => {
  const f = fileInput.files[0];
  if (!f) return;
  try {
    const file = JSON.parse(await f.text());
    if (file.app !== 'wikimasters-images' || !file.data) throw new Error('format');
    const data = Object.fromEntries(Object.entries(file.data).filter(([k]) => isSaved(k)));
    await ext.storage.local.set(data);
    io.textContent = `✅ ${Object.keys(data).length} élément(s) importé(s). Recharge ta page WikiMasters.`;
  } catch (e) {
    io.textContent = '❌ Ce fichier n\'est pas une sauvegarde de WikiMasters Images.';
  }
  fileInput.value = '';
};
