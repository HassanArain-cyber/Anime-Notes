(async function() {
  const $ = id => document.getElementById(id);
  let allAnime = [], shown = [], sortMode = localStorage.getItem('sortMode') || 'oldest', query = '';

  const sorters = {
    newest: (a, b) => b.created - a.created,
    oldest: (a, b) => a.created - b.created,
    ratingHigh: (a, b) => (b.rating || 0) - (a.rating || 0),
    ratingLow: (a, b) => (a.rating || 0) - (b.rating || 0),
    az: (a, b) => a.name.localeCompare(b.name),
    za: (a, b) => b.name.localeCompare(a.name),
  };

  function refresh() {
    shown = allAnime.filter(a => !query || a.name.toLowerCase().includes(query)
      || a.characters.some(c => c.toLowerCase().includes(query)));
    shown.sort((a, b) => (sorters[sortMode] || sorters.oldest)(a, b) || a.id.localeCompare(b.id));
    const list = $('animeList');
    list.replaceChildren();
    list.classList.toggle('hidden', !shown.length);
    $('emptyState').classList.toggle('hidden', !!shown.length);
    shown.forEach((a, i) => {
      const el = document.createElement('div');
      el.className = 'anime-item';
      const span = (cls, txt) => { const s = document.createElement('span'); s.className = cls; s.textContent = txt; return s; };
      el.append(span('anime-num', (i + 1) + '.'), span('anime-name', a.name));
      if (a.rating !== null) el.append(span('anime-rating', a.rating + '/10'));
      el.onclick = () => { location.href = 'anime.html?id=' + a.id; };
      list.append(el);
    });
  }

  const openModal = m => { m.classList.remove('hidden'); document.body.style.overflow = 'hidden'; };
  const closeModal = m => { m.classList.add('hidden'); document.body.style.overflow = ''; };

  // ---- Events ----
  $('searchInput').oninput = e => { query = e.target.value.trim().toLowerCase(); refresh(); };
  $('btnSort').onclick = () => $('sortPanel').classList.toggle('hidden');
  document.querySelectorAll('.sort-options button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sort === sortMode);
    btn.onclick = () => {
      sortMode = btn.dataset.sort;
      localStorage.setItem('sortMode', sortMode);
      document.querySelectorAll('.sort-options button').forEach(b => b.classList.toggle('active', b === btn));
      $('sortPanel').classList.add('hidden');
      refresh();
    };
  });
  $('btnAdd').onclick = () => openModal($('addModal'));
  $('addBack').onclick = () => closeModal($('addModal'));
  $('btnImport').onclick = () => openModal($('importModal'));
  $('importBack').onclick = () => closeModal($('importModal'));
  $('btnTrash').onclick = () => { location.href = 'trash.html'; };
  $('btnDelAll').onclick = async () => {
    if (!allAnime.length) return;
    if (!confirm('Move all ' + allAnime.length + ' anime to Trash?\n\nYou can restore them from Trash within ' + TRASH_DAYS + ' days. After that they are deleted for good.')) return;
    await trashAll();
    allAnime = [];
    refresh();
  };

  $('addSave').onclick = async () => {
    const name = cleanName($('addName').value);
    if (!name) return $('addName').focus();
    $('addSave').disabled = true;
    try {
      const [row] = await addAnime([{
        name, rating: cleanRating($('addRating').value), characters: cleanChars($('addChars').value.split('\n')),
      }]);
      allAnime.push(row);
      refresh();
      closeModal($('addModal'));
      $('addName').value = $('addRating').value = $('addChars').value = '';
    } finally { $('addSave').disabled = false; }
  };

  async function showBackup() {
    const t = await kvGet('lastBackup'), d = t ? Math.floor((Date.now() - t) / 864e5) : null;
    $('backupNote').textContent = 'Saved on this phone only. Last backup: ' + (d === null ? 'never' : d === 0 ? 'today' : d + ' day(s) ago') + '. Tap 📤 to back up.';
  }

  // ---- Import / Export ----
  function parseText(text) {
    const list = []; let cur = null;
    for (const line of text.split('\n').map(l => l.trim()).filter(Boolean)) {
      const m = line.match(/^\d+[.)\s]+(.+)$/);
      if (m) { cur = { name: m[1], characters: [] }; list.push(cur); continue; }
      if (!cur) continue;
      const b = line.match(/^[•\-*]\s*(.+)$/);
      cur.characters.push(...(b ? [b[1]] : line.split(',')));
    }
    return list;
  }

  $('importBtn').onclick = async () => {
    const file = $('importFile').files[0];
    let list = [];
    if (file) {
      if (file.size > 2e6) return alert('File must be smaller than 2 MB');
      const text = await file.text();
      if (file.name.toLowerCase().endsWith('.json')) {
        try { list = JSON.parse(text).anime; } catch { return alert('Invalid JSON backup'); }
        if (!Array.isArray(list)) return alert('Invalid JSON backup');
      } else list = parseText(text);
    } else list = parseText($('importText').value);

    const have = new Set([...await getAllAnime(), ...await getAllTrash()].map(r => r.name + '|' + r.created));
    const now = Date.now();
    const all = list.filter(a => a && typeof a === 'object').slice(0, 5000).map((a, i) => {
      const c = Math.floor(+a.created), u = Math.floor(+a.updated);
      return {
        name: cleanName(a.name), rating: cleanRating(a.rating), characters: cleanChars(a.characters),
        created: Number.isSafeInteger(c) && c > 0 ? c : now + i,
        updated: Number.isSafeInteger(u) && u > 0 ? u : now + i,
      };
    }).filter(r => r.name);
    const rows = all.filter(r => !have.has(r.name + '|' + r.created)); // skip items already in the app

    $('importBtn').disabled = true;
    try {
      await addAnime(rows);
      allAnime = await getAllAnime();
      refresh();
      $('importText').value = $('importFile').value = '';
      closeModal($('importModal'));
      alert(rows.length + ' anime imported' + (all.length > rows.length ? ', ' + (all.length - rows.length) + ' already existed' : ''));
    } finally { $('importBtn').disabled = false; }
  };

  $('btnExport').onclick = async () => {
    const anime = (await getAllAnime()).map(({ name, rating, characters, created, updated }) =>
      ({ name, rating, characters, created, updated }));
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 2, exportedAt: Date.now(), anime }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'anime_backup.json'; a.click();
    URL.revokeObjectURL(url);
    await kvSet({ lastBackup: Date.now() });
    showBackup();
  };

  await purgeOldTrash();
  allAnime = await getAllAnime();
  refresh();
  showBackup();
  navigator.storage && navigator.storage.persist && navigator.storage.persist();

  // Turn on offline mode and show whether it really works
  (async () => {
    const note = t => { $('offlineNote').textContent = t; };
    try {
      if (!('serviceWorker' in navigator)) return note('Offline mode is not supported in this browser.');
      await navigator.serviceWorker.register('service-worker.js');
      await navigator.serviceWorker.ready;
      const files = ['index.html', 'anime.html', 'trash.html', 'style.css', 'db.js', 'app.js', 'anime.js', 'trash.js', 'manifest.json'];
      await Promise.all(files.map(f => fetch(f).catch(() => 0))); // saves a copy of each file for offline use
      const hits = await Promise.all(['/', '/anime', '/trash', '/db.js', '/app.js', '/anime.js', '/trash.js', '/style.css'].map(p => caches.match(location.origin + p)));
      note(hits.every(Boolean) ? 'Offline mode: ready ✓' : 'Offline mode: not ready yet. Reopen the app once while online.');
    } catch (e) { note('Offline mode failed: ' + e.message); }
  })();
})();
