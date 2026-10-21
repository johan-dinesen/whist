import { PROFILE_BUCKET, profileUrl, prepareAvatar } from './profiles.js';

const $ = id => document.getElementById(id);
const isPreview = new URLSearchParams(location.search).has('preview');
let supabase = null;
let accessLevel = 'none'; // none | profiles | admin
let players = [];
let tournaments = [];
let currentId = null;
let selectedId = null;
let selectedFile = null;
let previewBlobUrl = null;
let uploadBusy = false;

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
    {id:null, name:'Kredsspil (ingen aktiv turnering)'}, ...tournaments
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
function clearPendingFile() {
  selectedFile = null;
  $('profile-file').value = '';
  if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
  previewBlobUrl = null;
  $('profile-upload-btn').disabled = true;
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
async function refreshModules() {
  const level = await getAccess();
  setAccess(level);
  if (level === 'none') return;
  await fetchPlayers();
  if (level === 'admin') await fetchTournaments();
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
$('profile-file').addEventListener('change', () => {
  const file = $('profile-file').files[0];
  // Preserve the new selection before clearing any previous preview.
  if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
  previewBlobUrl = null;
  selectedFile = null;
  $('profile-upload-btn').disabled = true;
  if (!file) return;
  selectedFile = file;
  if (!players.some(p => p.id === $('profile-player').value)) return;
  message('profile-message', `Valgt: ${file.name}`);
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10*1024*1024) {
    message('profile-message', 'Vælg et JPG-, PNG- eller WebP-billede under 10 MB.', true);
    selectedFile = null;
    return;
  }
  previewBlobUrl = URL.createObjectURL(file);
  setImage(previewBlobUrl);
  $('profile-upload-btn').disabled = false;
});

$('profile-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabase || uploadBusy) return;
  const playerId = $('profile-player').value;
  const player = players.find(p => p.id === playerId);
  if (!player || !selectedFile) return;
  uploadBusy = true;
  const button = $('profile-upload-btn');
  button.disabled = true;
  $('profile-player').disabled = true;
  $('profile-file').disabled = true;
  message('profile-message', 'Behandler og gemmer billedet ...');
  try {
    const blob = await prepareAvatar(selectedFile);
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
