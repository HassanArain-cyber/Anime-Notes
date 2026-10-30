// Local-only data layer: your list is saved in THIS browser (IndexedDB).
// No server and no login, so it works online and offline. Use Export/Import to move or back up your list.
const idb = new Promise((res, rej) => {
  const r = indexedDB.open('gojo-notes', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function atomic(fn, mode = 'readwrite') {
  const d = await idb;
  return new Promise((res, rej) => {
    const tx = d.transaction('kv', mode);
    const out = fn(tx.objectStore('kv'));
    tx.oncomplete = () => res(out && out.result);
    tx.onerror = tx.onabort = () => rej(tx.error);
  });
}
const kvGet = k => atomic(s => s.get(k), 'readonly');
const kvSet = o => atomic(s => Object.entries(o).forEach(([k, v]) => s.put(v, k)));

// Ask the browser not to delete our data when storage is low
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

// ---- input cleaning ----
const cleanName = s => String(s || '').trim().slice(0, 200);
const cleanRating = v => { const n = parseFloat(v); return n >= 0 && n <= 10 ? n : null; };
const cleanChars = a => (Array.isArray(a) ? a : [])
  .map(s => String(s).trim().slice(0, 100)).filter(Boolean).slice(0, 500);
const pick = r => ({ id: r.id, name: r.name, rating: r.rating ?? null, characters: r.characters || [],
  created: r.created, updated: r.updated, deleted_at: r.deleted_at ?? null });

// ---- data functions ----
const getRows = async () => (await kvGet('rows')) || [];
const save = rows => kvSet({ rows });
const getAllAnime = async () => (await getRows()).filter(r => !r.deleted_at);
const getAllTrash = async () => (await getRows()).filter(r => r.deleted_at).sort((a, b) => b.deleted_at - a.deleted_at);
const getAnime = async id => (await getRows()).find(r => r.id === id && !r.deleted_at) || null;
async function addAnime(list) {
  const rows = await getRows(), now = Date.now();
  if (rows.length + list.length > 5000) throw new Error('Limit reached (5000 items)');
  const added = list.map((a, i) => pick({ ...a, id: crypto.randomUUID(), created: a.created || now + i, updated: a.updated || now + i }));
  await save(rows.concat(added));
  return added;
}
async function updateAnime(id, f) {
  const rows = await getRows(), row = rows.find(r => r.id === id);
  if (!row) return;
  Object.assign(row, f, { updated: Date.now() });
  await save(rows);
}
const trashAnime = id => updateAnime(id, { deleted_at: Date.now() });
const restoreAnime = id => updateAnime(id, { deleted_at: null });
async function deleteForever(id) { await save((await getRows()).filter(r => r.id !== id)); }
// Delete all: moves every anime to Trash (can be restored for 15 days)
async function trashAll() {
  const rows = await getRows(), now = Date.now();
  let n = 0;
  rows.forEach(r => { if (!r.deleted_at) { r.deleted_at = now; r.updated = now; n++; } });
  await save(rows);
  return n;
}
// Items stay in Trash for 15 days, then are deleted for good
const TRASH_DAYS = 15;
async function purgeOldTrash() {
  const rows = await getRows(), cutoff = Date.now() - TRASH_DAYS * 864e5;
  const keep = rows.filter(r => !r.deleted_at || r.deleted_at > cutoff);
  if (keep.length < rows.length) await save(keep);
}
async function emptyTrash() { await save((await getRows()).filter(r => !r.deleted_at)); }

window.addEventListener('unhandledrejection', e => alert('Error: ' + (e.reason && e.reason.message || e.reason)));
