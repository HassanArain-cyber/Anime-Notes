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
    const key = name.toLowerCase();
    if (allAnime.some(a => a.name.toLowerCase() === key)) {
      if (!confirm('"' + name + '" is already in your list. Add it again anyway?')) return;
    } else if ((await getAllTrash()).some(a => a.name.toLowerCase() === key)) {
      if (!confirm('"' + name + '" is already in your Trash. Add it anyway?\n\nTip: you can restore it from 🗑 Trash instead.')) return;
    }
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

  // MyAnimeList export (XML). Plan-to-Watch entries are skipped. MAL gives no characters.
  function parseMAL(xml) {
    const un = s => s.replace(/&(amp|lt|gt|quot|apos|#39);/g, (m, c) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" })[c]);
    const tag = (blk, t) => {
      const m = blk.match(new RegExp('<' + t + '>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</' + t + '>'));
      return m ? (m[1] !== undefined ? m[1] : un(m[2] || '')).trim() : '';
    };
    return (xml.match(/<anime>[\s\S]*?<\/anime>/g) || [])
      .filter(b => !/^(plan|6$)/i.test(tag(b, 'my_status')))
      .map(b => ({ name: tag(b, 'series_title'), rating: +tag(b, 'my_score') > 0 ? tag(b, 'my_score') : null, characters: [] }));
  }

  // Works out the file type from its CONTENT (phone file pickers often hide the real file name)
  function toList(text) {
    const t = text.trim();
    if (t[0] === '{' || t[0] === '[') { const j = JSON.parse(t); return Array.isArray(j) ? j : j.anime; }
    if (t[0] === '<') return parseMAL(t);
    return parseText(text);
  }

  function buildRows(list, seen, now) {
    const rows = [];
    list.forEach((a, i) => {
      const name = cleanName(a.name), key = name.toLowerCase();
      if (!name || seen.has(key)) return;
      seen.add(key);
      const c = Math.floor(+a.created), u = Math.floor(+a.updated);
      rows.push({
        name, rating: cleanRating(a.rating), characters: cleanChars(a.characters),
        created: Number.isSafeInteger(c) && c > 0 ? c : now + i,
        updated: Number.isSafeInteger(u) && u > 0 ? u : now + i,
      });
    });
    return rows;
  }

  function skipSummary(list, active, trashed) {
    const key = a => cleanName(a.name).toLowerCase();
    const inList = list.filter(a => active.has(key(a))).length;
    const inTrash = list.filter(a => !active.has(key(a)) && trashed.has(key(a))).length;
    return [inList && inList + ' already in your list', inTrash && inTrash + ' already in Trash (open 🗑 Trash to restore or delete them)'].filter(Boolean).join(', ');
  }

  async function readImportFile(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    if (buf[0] === 0x1f && buf[1] === 0x8b) { // .gz (MyAnimeList exports are gzip-compressed)
      if (!window.DecompressionStream) throw new Error('This browser cannot open .gz files. Unzip the file first.');
      const reader = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
      const parts = []; let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1e7) { reader.cancel(); throw new Error('File is too large'); }
        parts.push(value);
      }
      return new TextDecoder().decode(await new Blob(parts).arrayBuffer());
    }
    return new TextDecoder().decode(buf);
  }

  $('importBtn').onclick = async () => {
    const file = $('importFile').files[0];
    let list;
    try {
      if (file && file.size > 2e6) return alert('File must be smaller than 2 MB');
      list = toList(file ? await readImportFile(file) : $('importText').value);
    } catch (e) { return alert('Could not read this file: ' + e.message); }
    list = (Array.isArray(list) ? list : []).filter(a => a && typeof a === 'object').slice(0, 5000);

    // skip anime that are already in the list or in Trash (same name) and say which
    const active = new Set((await getAllAnime()).map(r => r.name.toLowerCase()));
    const trashed = new Set((await getAllTrash()).map(r => r.name.toLowerCase()));
    const rows = buildRows(list, new Set([...active, ...trashed]), Date.now());
    const skipped = skipSummary(list, active, trashed);
    if (!rows.length) return alert(list.length
      ? 'Nothing imported. ' + (skipped || 'No valid anime names found') + '.'
      : 'No anime found in this file. Supported: JSON backup, text list, MyAnimeList XML.');

    $('importBtn').disabled = true;
    try {
      await addAnime(rows);
      allAnime = await getAllAnime();
      refresh();
      $('importText').value = $('importFile').value = '';
      closeModal($('importModal'));
      alert(rows.length + ' anime imported' + (skipped ? '. Skipped: ' + skipped : '') + '.');
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
    let problem = ''; // shows a warning if offline mode has a problem, otherwise just Online / Offline
    const show = () => { $('offlineNote').textContent = problem || (navigator.onLine ? 'Online' : 'Offline'); };
    const note = t => { problem = t; show(); };
    window.addEventListener('online', show);
    window.addEventListener('offline', show);
    show();
    try {
      if (!('serviceWorker' in navigator)) return note('Offline mode is not supported in this browser.');
      await navigator.serviceWorker.register('service-worker.js');
      const slow = setTimeout(() => note('Offline mode: starting... If this stays, open the site in Chrome (not inside another app).'), 8000);
      await navigator.serviceWorker.ready;
      clearTimeout(slow);
      const files = ['index.html', 'anime.html', 'trash.html', 'style.css', 'db.js', 'app.js', 'anime.js', 'trash.js', 'manifest.json'];
      await Promise.all(files.map(f => fetch(f).catch(() => 0))); // saves a copy of each file for offline use
      const base = new URL('./', location.href).href; // works at the site root and in a sub-folder (GitHub Pages)
      const keys = ['', 'anime', 'trash', 'db.js', 'app.js', 'anime.js', 'trash.js', 'style.css'];
      const hits = await Promise.all(keys.map(k => caches.match(base + k)));
      const missing = keys.filter((k, i) => !hits[i]).map(k => k || 'index');
      note(missing.length ? 'Offline mode: not ready (missing: ' + missing.join(', ') + '). Reopen once while online.' : '');
    } catch (e) { note('Offline mode failed: ' + e.message); }
  })();
})();
