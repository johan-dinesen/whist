import { PROFILE_BUCKET, profileUrl, loadAvatarImage, moveAvatarCrop, pinchAvatarCrop, drawAvatarCrop, prepareAvatar } from './profiles.js?v=1.0.3';

const $ = id => document.getElementById(id);
const isPreview = new URLSearchParams(location.search).has('preview');
let supabase = null;
let accessLevel = 'none'; // none | profiles | admin
let players = [];
let tournaments = [];
let currentId = null;
let selectedId = null;
let selectedFile = null;
let selectedImage = null;
let crop = {zoom: 1, x: 0, y: 0};
let cropGeneration = 0;
let cropPointers = new Map();
let pinchGesture = null;
let uploadBusy = false;
let recentGames = [];
let deletingGameId = null;
let recentGeneration = 0;
let managedPlayers = [];
let managedPlayersGeneration = 0;
let peopleBusy = false;
const RECENT_CALLS = {
  almindelig:'Almindelig', gode:'Gode', halve:'Halve', vip:'Vip',
  sol:'Sol', ren_sol:'Ren sol', bordlaegger:'Bordlægger', ren_bordlaegger:'Ren bordlægger'
};
const RECENT_TRUMPS = {hearts:'♥',clubs:'♣',diamonds:'♦',spades:'♠',no_trump:'UT'};
const RECENT_SOLO = new Set(['sol','ren_sol','bordlaegger','ren_bordlaegger']);
const recentPoints = new Intl.NumberFormat('da-DK', {minimumFractionDigits:2,maximumFractionDigits:2});


function show(id, yes) { $(id).classList.toggle('hidden', !yes); }
function message(id, text, error = false) {
  $(id).textContent = text;
  $(id).classList.toggle('admin-error', error);
}
function siteError(text) {
  $('admin-status').textContent = text;
  show('admin-status', Boolean(text));
}
function loginVisible(yes) {
  show('admin-login-panel', yes);
  if (!yes) $('admin-password').value = '';
}
function setAccess(level) {
  accessLevel = level;
  show('admin-content', level !== 'none');
  show('admin-tournament-content', level === 'admin');
  if (level !== 'admin') {
    ++managedPlayersGeneration;
    managedPlayers = [];
    $('admin-player-select').replaceChildren(new Option('Vælg spiller eller gæst', ''));
    $('admin-active-guests').replaceChildren();
    $('admin-archived-guests').replaceChildren();
    show('admin-archived-guests-section', false);
    for (const id of ['admin-player-rename-message','admin-guest-add-message','admin-guest-manage-message']) message(id, '');
  }
  if (level !== 'admin') {
    ++recentGeneration; // Discard any pending privileged read after locking.
    recentGames = [];
    $('admin-recent-games').replaceChildren();
    message('admin-recent-message', '');
  }
  show('admin-switch-code-btn', level === 'profiles');
  show('admin-lock-btn', level === 'admin');
  $('admin-access').textContent = level === 'admin'
    ? 'Administration' : level === 'profiles' ? 'Profilbilleder' : '';
  loginVisible(level === 'none');
  if (level !== 'none') message('admin-password-message', '');
}
async function getAccess() {
  const [admin, registration] = await Promise.all([
    supabase.rpc('admin_access_until'),
    supabase.rpc('registration_access_until')
  ]);
  if (admin.error) throw admin.error;
  if (registration.error) throw registration.error;
  const valid = x => Boolean(x && Date.parse(x) > Date.now());
  return valid(admin.data) ? 'admin' : valid(registration.data) ? 'profiles' : 'none';
}
function drawTournaments() {
  const root = $('admin-tournament-options');
  root.replaceChildren();
  for (const {id, name} of [
    {id:null, name:'Kredsspil'}, ...tournaments
  ]) {
    const label = document.createElement('label');
    label.className = 'admin-radio-choice';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'active-tournament';
    input.value = id ?? '';
    input.checked = id === selectedId;
    input.addEventListener('change', () => {
      selectedId = id;
      $('admin-save-active-btn').disabled = selectedId === currentId;
      message('admin-active-message', '');
    });
    const span = document.createElement('span');
    span.textContent = name;
    label.append(input, span);
    if (id === currentId) {
      const tag = document.createElement('small');
      tag.textContent = 'Aktuel';
      label.append(tag);
    }
    root.append(label);
  }
  $('admin-save-active-btn').disabled = selectedId === currentId;
}
async function fetchTournaments() {
  const {data, error} = await supabase.from('tournaments')
    .select('id,name,is_active').order('name');
  if (error) throw error;
  tournaments = data ?? [];
  if (tournaments.filter(x => x.is_active).length > 1) {
    throw new Error('Flere spilsamlinger er aktive på samme tid.');
  }
  currentId = tournaments.find(x => x.is_active)?.id ?? null;
  selectedId = currentId;
  drawTournaments();
}
function clearPendingFile({keepInput = false} = {}) {
  ++cropGeneration; // Ignore any image load which finishes after switching players/files.
  selectedFile = null;
  selectedImage = null;
  cropPointers.clear();
  pinchGesture = null;
  crop = {zoom: 1, x: 0, y: 0};
  if (!keepInput) $('profile-file').value = '';
  show('profile-crop-canvas', false);
  $('profile-avatar').classList.remove('is-editing');
  $('profile-avatar').setAttribute('aria-label', 'Nuværende profilbillede');
  $('profile-crop-help').textContent = 'Vælg et billede for at placere motivet i cirklen, før du gemmer.';
  $('profile-upload-btn').disabled = true;
}
function renderCropPreview() {
  if (!selectedImage) return;
  crop = drawAvatarCrop($('profile-crop-canvas'), selectedImage, crop);
}
function setImage(src) {
  const img = $('profile-image');
  img.classList.add('hidden');
  img.onload = () => { img.classList.remove('hidden'); };
  img.onerror = () => { img.classList.add('hidden'); };
  if (src) img.src = src;
  else img.removeAttribute('src');
}
function renderSelectedPlayer() {
  clearPendingFile();
  message('profile-message', '');
  const player = players.find(p => p.id === $('profile-player').value);
  show('profile-editor', Boolean(player));
  if (!player) { setImage(''); return; }
  $('profile-initials').textContent = player.display_name.trim()
    .split(/\s+/).slice(0,2).map(x => x[0]).join('').toUpperCase();
  setImage(profileUrl(supabase, player.id, String(Date.now())));
}
async function fetchPlayers() {
  const {data, error} = await supabase.from('players')
    .select('id,display_name,is_guest,active')
    .eq('active', true);
  if (error) throw error;
  players = (data ?? []).sort((a,b) =>
    Number(a.is_guest) - Number(b.is_guest) ||
    a.display_name.localeCompare(b.display_name, 'da'));
  const sel = $('profile-player');
  const oldValue = sel.value;
  sel.replaceChildren(new Option('Vælg spiller', ''));
  for (const player of players) {
    sel.add(new Option(`${player.display_name}${player.is_guest ? ' (gæst)' : ''}`,player.id));
  }
  if (players.some(p => p.id === oldValue)) sel.value = oldValue;
  renderSelectedPlayer();
}
function recentDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Ukendt tidspunkt'
    : date.toLocaleString('da-DK', {dateStyle:'short',timeStyle:'short'});
}
function recentCall(game) {
  const label = RECENT_CALLS[game.call_type] ?? game.call_type;
  if (RECENT_SOLO.has(game.call_type)) return label;
  return `${game.tricks} ${label} ${RECENT_TRUMPS[game.trump] ?? ''}`
    + (game.call_type === 'vip' ? ` ×${game.vip_depth}` : '')
    + ` · Resultat ${Number(game.score) > 0 ? '+' : ''}${game.score}`;
}
function recentPlayerSummary(game) {
  return (game.participants ?? []).map(p => {
    const role = p.is_caller ? 'melder' : p.is_partner ? 'makker' : '';
    const description = [role, p.solo_result?.toLowerCase()].filter(Boolean).join(', ');
    const amount = Number(p.payout);
    const points = Number.isFinite(amount)
      ? `, ${amount > 0 ? '+' : amount < 0 ? '−' : ''}${recentPoints.format(Math.abs(amount))}` : '';
    return `${p.name}${description ? ` (${description})` : ''}${points}`;
  }).join(' · ');
}
function recentGameTitle(game) {
  return `${recentCall(game)} · ${tournaments.find(t => t.id === game.tournament_id)?.name ?? 'Kredsspil'}`;
}
function drawRecentGames() {
  const root = $('admin-recent-games');
  root.replaceChildren();
  if (!recentGames.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Ingen registrerede spil endnu.';
    root.append(empty);
    return;
  }
  for (const game of recentGames) {
    const item = document.createElement('article');
    item.className = 'admin-recent-game';
    const details = document.createElement('div');
    details.className = 'admin-recent-details';
    const title = document.createElement('h3');
    title.className = 'admin-recent-title';
    title.textContent = recentGameTitle(game);
    const time = document.createElement('p');
    time.className = 'admin-recent-meta';
    time.textContent = `Registreret ${recentDate(game.created_at)} · Spillet ${recentDate(game.played_at)}`;
    const players = document.createElement('p');
    players.className = 'admin-recent-players';
    players.textContent = recentPlayerSummary(game);
    details.append(title,time,players);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button danger';
    button.textContent = 'Slet spil';
    button.setAttribute('aria-label', `Slet spil: ${recentGameTitle(game)} registreret ${recentDate(game.created_at)}`);
    button.disabled = deletingGameId !== null;
    button.addEventListener('click', () => deleteRecentGame(game));
    item.append(details,button);
    root.append(item);
  }
}
async function fetchRecentGames({preserveMessage = false} = {}) {
  if (!supabase || accessLevel !== 'admin') return;
  const generation = ++recentGeneration;
  const button = $('admin-recent-refresh-btn');
  button.disabled = true;
  if (!preserveMessage) message('admin-recent-message', '');
  try {
    const {data,error} = await supabase.rpc('admin_recent_games');
    if (error) throw error;
    if (generation !== recentGeneration || accessLevel !== 'admin') return;
    recentGames = data ?? [];
    drawRecentGames();
  } finally {
    button.disabled = false;
  }
}
async function deleteRecentGame(game) {
  if (!supabase || accessLevel !== 'admin' || deletingGameId ||
      !recentGames.some(g => g.id === game.id)) return;
  const summary = `${recentGameTitle(game)}\nRegistreret ${recentDate(game.created_at)}\n${recentPlayerSummary(game)}`;
  if (!window.confirm(`Vil du slette dette spil?\n\n${summary}\n\nSpillet forsvinder fra Historik og Statistik. Handlingen kan ikke fortrydes på hjemmesiden.`)) return;
  deletingGameId = game.id;
  drawRecentGames();
  $('admin-recent-refresh-btn').disabled = true;
  message('admin-recent-message', 'Sletter spil ...');
  try {
    const {data,error} = await supabase.rpc('admin_delete_recent_game', {p_game_id:game.id});
    if (error) throw error;
    if (data !== game.id) throw new Error('Databasen bekræftede ikke sletningen');
    if (accessLevel !== 'admin') return;
    message('admin-recent-message', 'Spillet er slettet fra Historik og Statistik.');
    await fetchRecentGames({preserveMessage:true});
  } catch (err) {
    handleError(err,'admin-recent-message');
  } finally {
    deletingGameId = null;
    $('admin-recent-refresh-btn').disabled = false;
    if (accessLevel === 'admin') drawRecentGames();
  }
}

// Full administration: player names are mutable, but removing a guest only
// archives the player. Historical games, payouts and avatar IDs stay intact.
function populatePlayerRename() {
  const selected = managedPlayers.find(p => p.id === $('admin-player-select').value && p.active);
  $('admin-player-new-name').value = selected?.display_name ?? '';
  $('admin-player-new-name').disabled = !selected || peopleBusy;
  $('admin-player-rename-btn').disabled = !selected || peopleBusy;
}
function renderManagedPlayers() {
  const select = $('admin-player-select');
  const previouslySelected = select.value;
  select.replaceChildren(new Option('Vælg spiller eller gæst', ''));
  for (const person of managedPlayers.filter(p => p.active)) {
    select.add(new Option(`${person.display_name}${person.is_guest ? ' (gæst)' : ''}`, person.id));
  }
  if (managedPlayers.some(p => p.active && p.id === previouslySelected)) select.value = previouslySelected;
  populatePlayerRename();

  for (const [archived, containerId] of [[false,'admin-active-guests'], [true,'admin-archived-guests']]) {
    const root = $(containerId);
    root.replaceChildren();
    const guests = managedPlayers.filter(p => p.is_guest && p.active === !archived);
    if (!archived && guests.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'Ingen gæster endnu.';
      root.append(empty);
    }
    for (const guest of guests) {
      const row = document.createElement('div');
      row.className = 'admin-guest-row';
      const label = document.createElement('span');
      label.textContent = guest.display_name;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `button ${archived ? 'secondary' : 'danger'}`;
      button.textContent = archived ? 'Gendan' : 'Fjern';
      button.disabled = peopleBusy;
      button.setAttribute('aria-label', `${archived ? 'Gendan' : 'Fjern'} gæsten ${guest.display_name}`);
      button.addEventListener('click', () => changeGuestStatus(guest, archived));
      row.append(label, button);
      root.append(row);
    }
    if (archived) show('admin-archived-guests-section', guests.length > 0);
  }
}
async function fetchManagedPlayers() {
  if (!supabase || accessLevel !== 'admin') return;
  const generation = ++managedPlayersGeneration;
  const {data, error} = await supabase.rpc('admin_list_players');
  if (error) throw error;
  if (generation !== managedPlayersGeneration || accessLevel !== 'admin') return;
  managedPlayers = (data ?? []).sort((a,b) =>
    Number(a.is_guest) - Number(b.is_guest) || a.display_name.localeCompare(b.display_name, 'da'));
  renderManagedPlayers();
}
async function runPeopleMutation(rpc, args, target, success) {
  if (!supabase || accessLevel !== 'admin' || peopleBusy) return;
  peopleBusy = true;
  const panel = $('admin-players-panel');
  const controls = [...panel.querySelectorAll('button, input, select')];
  controls.forEach(control => { control.disabled = true; });
  message(target, 'Gemmer ...');
  let succeeded = false;
  try {
    const {error} = await supabase.rpc(rpc, args);
    if (error) throw error;
    if (accessLevel !== 'admin') return;
    await Promise.all([fetchManagedPlayers(), fetchPlayers()]);
    succeeded = true;
    message(target, success);
  } catch (err) {
    handleError(err, target);
  } finally {
    peopleBusy = false;
    controls.forEach(control => {control.disabled = false;});
    if (accessLevel === 'admin' && succeeded) renderManagedPlayers();
    if (accessLevel === 'admin' && !succeeded) {
      // Leave the edited name in place if the database rejected it.
      $('admin-player-rename-btn').disabled = !$('admin-player-select').value;
      $('admin-player-new-name').disabled = !$('admin-player-select').value;
    }
  }
}
async function changeGuestStatus(guest, restore) {
  if (accessLevel !== 'admin' || peopleBusy) return;
  if (!restore && !window.confirm(`Fjern gæsten ${guest.display_name} fra nye spil?\n\nTidligere spil og resultater bevares. Gæsten kan gendannes senere.`)) return;
  await runPeopleMutation(restore ? 'admin_restore_guest' : 'admin_archive_guest',
    {p_player_id:guest.id}, 'admin-guest-manage-message',
    restore ? `${guest.display_name} er gendannet.` : `${guest.display_name} er fjernet fra nye spil.`);
}

async function refreshModules() {
  const level = await getAccess();
  setAccess(level);
  if (level === 'none') return;
  await fetchPlayers();
  if (level === 'admin') {
    await fetchTournaments();
    try { await fetchManagedPlayers(); }
    catch (err) { handleError(err, 'admin-player-rename-message'); }
    try { await fetchRecentGames(); }
    catch (err) { handleError(err, 'admin-recent-message'); }
  }
}
function handleError(error, target) {
  const text = error?.message || String(error);
  message(target, text, true);
  if (/adgang mangler|udløbet|row-level security|not authorized|403/i.test(text)) {
    void refreshModules().catch(console.error);
  }
}

$('admin-password-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabase) return;
  const button = $('admin-unlock-btn');
  button.disabled = true;
  message('admin-password-message', '');
  try {
    const password = $('admin-password').value;
    const {data, error} = await supabase.rpc('unlock_whist_management', {p_password: password});
    $('admin-password').value = '';
    if (error) throw error;
    if (!data) {
      message('admin-password-message', 'Forkert kode eller for mange forsøg. Prøv igen senere.', true);
      return;
    }
    await refreshModules();
  } catch (err) {
    handleError(err, 'admin-password-message');
  } finally {
    button.disabled = false;
  }
});

$('admin-switch-code-btn').addEventListener('click', () => {
  loginVisible(true);
  $('admin-password').focus();
});

$('profile-player').addEventListener('change', renderSelectedPlayer);
$('profile-file').addEventListener('change', async () => {
  const file = $('profile-file').files[0];
  clearPendingFile({keepInput: true});
  const generation = cropGeneration;
  if (!file || !players.some(p => p.id === $('profile-player').value)) return;
  message('profile-message', 'Åbner billedet ...');
  try {
    const image = await loadAvatarImage(file);
    if (generation !== cropGeneration) return;
    selectedFile = file;
    selectedImage = image;
    show('profile-crop-canvas', true);
    $('profile-avatar').classList.add('is-editing');
    $('profile-avatar').setAttribute('aria-label', 'Beskær profilbillede');
    $('profile-crop-help').textContent = 'Udsnittet i cirklen er det, der gemmes. Træk med én finger for at flytte billedet, og knib med to fingre for at zoome.';
    renderCropPreview();
    $('profile-upload-btn').disabled = false;
    message('profile-message', '');
  } catch (error) {
    if (generation !== cropGeneration) return;
    handleError(error, 'profile-message');
    $('profile-upload-btn').disabled = true;
  }
});

const cropCanvas = $('profile-crop-canvas');
function pointerGesture() {
  const [a, b] = [...cropPointers.values()];
  if (!a || !b) return null;
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    distance: Math.hypot(a.x - b.x, a.y - b.y)
  };
}
cropCanvas.addEventListener('pointerdown', event => {
  if (!selectedImage || uploadBusy || cropPointers.size >= 2 ||
      (event.pointerType === 'mouse' && event.button !== 0)) return;
  event.preventDefault();
  const rect = cropCanvas.getBoundingClientRect();
  cropPointers.set(event.pointerId, {x: event.clientX - rect.left, y: event.clientY - rect.top});
  cropCanvas.setPointerCapture(event.pointerId);
  // Initialising when the second finger arrives prevents an unwanted zoom jump.
  pinchGesture = cropPointers.size === 2 ? pointerGesture() : null;
});
cropCanvas.addEventListener('pointermove', event => {
  if (!selectedImage || uploadBusy || !cropPointers.has(event.pointerId)) return;
  event.preventDefault();
  const rect = cropCanvas.getBoundingClientRect();
  const nextPoint = {x: event.clientX - rect.left, y: event.clientY - rect.top};
  const previousPoint = cropPointers.get(event.pointerId);
  cropPointers.set(event.pointerId, nextPoint);
  if (cropPointers.size === 2) {
    const nextGesture = pointerGesture();
    if (pinchGesture) {
      crop = pinchAvatarCrop(selectedImage, crop, pinchGesture, nextGesture, rect.width);
      renderCropPreview();
    }
    pinchGesture = nextGesture;
  } else {
    crop = moveAvatarCrop(selectedImage, crop,
      nextPoint.x - previousPoint.x, nextPoint.y - previousPoint.y, rect.width);
    renderCropPreview();
  }
});
function endCropPointer(event) {
  if (!cropPointers.delete(event.pointerId)) return;
  pinchGesture = cropPointers.size === 2 ? pointerGesture() : null;
  // With one finger left, the next movement resumes dragging at its last point.
}
cropCanvas.addEventListener('pointerup', endCropPointer);
cropCanvas.addEventListener('pointercancel', endCropPointer);
cropCanvas.addEventListener('lostpointercapture', endCropPointer);
// Desktop mouse and trackpad users can also zoom without a visible slider.
cropCanvas.addEventListener('wheel', event => {
  if (!selectedImage || uploadBusy) return;
  event.preventDefault();
  const rect = cropCanvas.getBoundingClientRect();
  const point = {x: event.clientX - rect.left, y: event.clientY - rect.top, distance: 1};
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.width : 1);
  const factor = Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.002);
  crop = pinchAvatarCrop(selectedImage, crop, point, {...point, distance: factor}, rect.width);
  renderCropPreview();
}, {passive: false});
cropCanvas.addEventListener('keydown', event => {
  if (!selectedImage || uploadBusy) return;
  if (['+','=','-','_'].includes(event.key)) {
    event.preventDefault();
    const factor = ['+','='].includes(event.key) ? 1.2 : 1/1.2;
    const center = cropCanvas.getBoundingClientRect().width / 2;
    const point = {x: center, y: center, distance: 1};
    crop = pinchAvatarCrop(selectedImage, crop, point, {...point, distance: factor}, center * 2);
    renderCropPreview();
    return;
  }
  if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  const step = event.shiftKey ? 20 : 6;
  const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
  const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
  crop = moveAvatarCrop(selectedImage, crop, dx, dy, cropCanvas.getBoundingClientRect().width);
  renderCropPreview();
});

$('profile-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabase || uploadBusy) return;
  const playerId = $('profile-player').value;
  const player = players.find(p => p.id === playerId);
  if (!player || !selectedFile || !selectedImage) return;
  uploadBusy = true;
  const button = $('profile-upload-btn');
  button.disabled = true;
  $('profile-player').disabled = true;
  $('profile-file').disabled = true;
  message('profile-message', 'Behandler og gemmer billedet ...');
  try {
    const blob = await prepareAvatar(selectedFile, {image: selectedImage, ...crop});
    const { error } = await supabase.storage.from(PROFILE_BUCKET)
      .upload(`${playerId}.webp`, blob, {
        contentType:'image/webp', cacheControl:'3600', upsert:true
      });
    if (error) throw error;
    clearPendingFile();
    setImage(profileUrl(supabase, playerId, String(Date.now())));
    message('profile-message', `Profilbilledet for ${player.display_name} er gemt.`);
  } catch (error) {
    handleError(error, 'profile-message');
    button.disabled = !selectedFile;
  } finally {
    uploadBusy = false;
    $('profile-player').disabled = false;
    $('profile-file').disabled = false;
  }
});

$('admin-active-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabase || accessLevel !== 'admin') return;
  const btn = $('admin-save-active-btn');
  btn.disabled = true;
  message('admin-active-message','');
  try {
    const {error} = await supabase.rpc('admin_set_active_tournament',
      {p_tournament_id:selectedId});
    if (error) throw error;
    await fetchTournaments();
    message('admin-active-message', currentId
      ? `Aktiv spilsamling: ${tournaments.find(x=>x.id===currentId)?.name}.`
      : 'Kredsspil er nu standard for nye spil.');
  } catch(err) { handleError(err,'admin-active-message'); }
  finally { btn.disabled = selectedId === currentId; }
});

$('admin-create-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabase || accessLevel !== 'admin') return;
  const btn = $('admin-create-btn');
  btn.disabled = true;
  message('admin-create-message','');
  try {
    const name = $('admin-new-name').value.trim();
    const {error} = await supabase.rpc('admin_create_tournament', {p_name:name});
    if (error) throw error;
    $('admin-new-name').value = '';
    await fetchTournaments();
    message('admin-create-message', `“${name}” er oprettet.`);
  } catch(err) { handleError(err,'admin-create-message'); }
  finally { btn.disabled = false; }
});


$('admin-player-select').addEventListener('change', () => {
  populatePlayerRename();
  message('admin-player-rename-message', '');
});
$('admin-player-rename-form').addEventListener('submit', async event => {
  event.preventDefault();
  const player = managedPlayers.find(p => p.id === $('admin-player-select').value && p.active);
  if (!player || accessLevel !== 'admin') return;
  const name = $('admin-player-new-name').value.trim();
  if (!name) return;
  if (name === player.display_name) {
    message('admin-player-rename-message', 'Navnet er uændret.');
    return;
  }
  await runPeopleMutation('admin_rename_player', {p_player_id:player.id, p_name:name},
    'admin-player-rename-message', `Navnet er ændret til ${name}.`);
});
$('admin-guest-add-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (accessLevel !== 'admin') return;
  const name = $('admin-guest-new-name').value.trim();
  if (!name) return;
  await runPeopleMutation('admin_add_guest', {p_name:name},
    'admin-guest-add-message', `${name} er tilføjet som gæst.`);
  if (!$('admin-guest-add-message').classList.contains('admin-error')) $('admin-guest-new-name').value = '';
});

$('admin-recent-refresh-btn').addEventListener('click', async () => {
  try { await fetchRecentGames(); }
  catch (err) { handleError(err, 'admin-recent-message'); }
});

$('admin-lock-btn').addEventListener('click', async () => {
  if (!supabase || accessLevel !== 'admin') return;
  const btn = $('admin-lock-btn');
  btn.disabled = true;
  try {
    const {error} = await supabase.rpc('lock_admin');
    if (error) throw error;
    await refreshModules();
  } catch(err) { handleError(err, 'admin-status'); }
  finally { btn.disabled = false; }
});

async function init() {
  if (isPreview) {
    siteError('Testtilstand. Billeder kan ikke gemmes uden Supabase.');
    loginVisible(true);
    $('admin-unlock-btn').disabled = true;
    return;
  }
  try {
    const cfg = await import('./config.js');
    if (!cfg.SUPABASE_URL?.startsWith('https://') || !cfg.SUPABASE_PUBLISHABLE_KEY ||
      cfg.SUPABASE_URL.includes('YOUR-') || cfg.SUPABASE_PUBLISHABLE_KEY.includes('YOUR-')) {
      throw new Error('Supabase mangler opsætning i assets/js/config.js');
    }
    const {createClient} = await import('https://esm.sh/@supabase/supabase-js@2');
    supabase = createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY, {
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
    });
    const {data,error} = await supabase.auth.getSession();
    if (error) throw error;
    let session = data.session;
    if (session && session.user?.is_anonymous === false) {
      const {error:signOutError} = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      session = null;
    }
    if (!session) {
      const {data:anon, error:anonError} = await supabase.auth.signInAnonymously();
      if (anonError) throw anonError;
      session = anon.session;
    }
    if (!session) throw new Error('Kunne ikke oprette Supabase-session.');
    await refreshModules();
  } catch(err) {
    console.error('Administrering:', err);
    setAccess('none');
    siteError(`Kunne ikke åbne Administrering: ${err?.message || err}`);
  }
}
init();
