(async function() {
  const $ = id => document.getElementById(id);
  const id = new URLSearchParams(location.search).get('id');
  if (!/^[0-9a-f-]{36}$/.test(id || '')) return location.replace('index.html');
  let anime = await getAnime(id);
  if (!anime) return location.replace('index.html');

  const openModal = m => { m.classList.remove('hidden'); document.body.style.overflow = 'hidden'; };
  const closeModal = m => { m.classList.add('hidden'); document.body.style.overflow = ''; };
  const lines = s => cleanChars(s.split('\n'));

  function render() {
    $('detailName').textContent = anime.name;
    $('detailRating').textContent = anime.rating !== null ? 'Rating: ' + anime.rating + '/10' : '';
    $('detailDate').textContent = 'Added: ' + new Date(anime.created).toLocaleDateString();
    $('charList').replaceChildren(...anime.characters.map(c => {
      const li = document.createElement('li'); li.textContent = c; return li;
    }));
    $('charList').classList.toggle('hidden', !anime.characters.length);
    $('charEmpty').classList.toggle('hidden', !!anime.characters.length);
  }

  // Save to the server, then update the screen
  async function save(fields, modal) {
    await updateAnime(anime.id, fields);
    Object.assign(anime, fields);
    if (modal) closeModal(modal);
    render();
  }

  $('btnBack').onclick = () => { location.href = 'index.html'; };

  $('btnEditAnime').onclick = () => {
    $('editAnimeName').value = anime.name;
    $('editAnimeRating').value = anime.rating ?? '';
    openModal($('editAnimeModal'));
  };
  $('editAnimeBack').onclick = () => closeModal($('editAnimeModal'));
  $('editAnimeSave').onclick = () => {
    const name = cleanName($('editAnimeName').value);
    if (!name) return $('editAnimeName').focus();
    return save({ name, rating: cleanRating($('editAnimeRating').value) }, $('editAnimeModal'));
  };

  $('btnDelAnime').onclick = () => {
    $('confirmText').textContent = 'Move "' + anime.name + '" to Trash?';
    $('confirmYes').onclick = async () => { await trashAnime(anime.id); location.replace('index.html'); };
    openModal($('confirmModal'));
  };
  $('confirmNo').onclick = () => closeModal($('confirmModal'));

  $('btnAddChar').onclick = () => { $('addCharInput').value = ''; openModal($('addCharModal')); };
  $('addCharBack').onclick = () => closeModal($('addCharModal'));
  $('addCharSave').onclick = () => save({ characters: [...anime.characters, ...lines($('addCharInput').value)].slice(0, 500) }, $('addCharModal'));

  $('btnEditChars').onclick = () => { $('editCharInput').value = anime.characters.join('\n'); openModal($('editCharModal')); };
  $('editCharBack').onclick = () => closeModal($('editCharModal'));
  $('editCharSave').onclick = () => save({ characters: lines($('editCharInput').value) }, $('editCharModal'));

  $('btnDelChars').onclick = () => {
    if (!anime.characters.length) return;
    $('delCharList').replaceChildren(...anime.characters.map((c, i) => {
      const label = document.createElement('label'); label.className = 'check-item';
      const box = document.createElement('input'); box.type = 'checkbox'; box.value = i;
      const span = document.createElement('span'); span.textContent = c;
      label.append(box, span); return label;
    }));
    openModal($('delCharModal'));
  };
  $('delCharBack').onclick = () => closeModal($('delCharModal'));
  $('delCharConfirm').onclick = () => {
    const del = new Set([...$('delCharList').querySelectorAll('input:checked')].map(b => +b.value));
    return save({ characters: anime.characters.filter((_, i) => !del.has(i)) }, $('delCharModal'));
  };

  render();
})();
