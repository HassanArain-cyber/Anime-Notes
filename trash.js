(async function() {
  const $ = id => document.getElementById(id);
  let items = await getAllTrash();

  const openModal = m => { m.classList.remove('hidden'); document.body.style.overflow = 'hidden'; };
  const closeModal = m => { m.classList.add('hidden'); document.body.style.overflow = ''; };

  function render() {
    $('trashList').classList.toggle('hidden', !items.length);
    $('emptyState').classList.toggle('hidden', !!items.length);
    $('trashList').replaceChildren(...items.map(item => {
      const el = document.createElement('div'); el.className = 'trash-item';
      const name = document.createElement('span'); name.className = 'trash-name'; name.textContent = item.name;
      const box = document.createElement('div'); box.className = 'trash-actions';
      const restore = document.createElement('button'); restore.className = 'restore-btn'; restore.textContent = 'Restore';
      const perm = document.createElement('button'); perm.className = 'danger'; perm.textContent = 'Perm Delete';
      restore.onclick = async () => { await restoreAnime(item.id); drop(item.id); };
      perm.onclick = () => confirm('Permanently delete "' + item.name + '"? This cannot be undone.', 'Delete',
        async () => { await deleteForever(item.id); drop(item.id); });
      box.append(restore, perm); el.append(name, box); return el;
    }));
  }
  const drop = id => { items = items.filter(t => t.id !== id); render(); };

  function confirm(text, yesLabel, action) {
    $('confirmText').textContent = text;
    $('confirmYes').textContent = yesLabel;
    $('confirmYes').onclick = async () => { await action(); closeModal($('confirmModal')); };
    openModal($('confirmModal'));
  }

  $('btnBack').onclick = () => { location.href = 'index.html'; };
  $('confirmNo').onclick = () => closeModal($('confirmModal'));
  $('btnEmptyTrash').onclick = () => items.length && confirm(
    'Permanently delete all ' + items.length + ' items in trash?', 'Empty Trash',
    async () => { await emptyTrash(); items = []; render(); });

  render();
})();
