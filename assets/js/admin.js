const $ = id => document.getElementById(id);
const isPreview = new URLSearchParams(location.search).has('preview');
let supabase = null;
let tournaments = [];
let selectedId = null;
let currentId = null;
let adminExpires = null;

function toggle(id, yes) { $(id).classList.toggle('hidden', !yes); }
function note(id, text, bad = false) {
  const el = $(id);
  if (id === 'admin-status') {
    el.textContent = bad ? text : '';
    toggle(id, bad);
  } else {
    el.textContent = text;
  }
  el.classList.toggle('admin-error', bad);
}
function showLogin() {
  toggle('admin-login-panel', true);
  toggle('admin-content', false);
  $('admin-password').value = '';
}
function showAdmin() {
  toggle('admin-login-panel', false);
  toggle('admin-content', true);
  $('admin-access').textContent = `Administrationsadgangen udløber ${new Date(adminExpires).toLocaleString('da-DK')}.`;
  note('admin-password-message', '');
}
function drawTournaments() {
  const root = $('admin-tournament-options');
  root.replaceChildren();
  for (const {id, name} of [{id:null, name:'Kredsspil (ingen aktiv turnering)'},...tournaments]) {
    const label = document.createElement('label');
    label.className = 'admin-radio-choice';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'active-tournament';
    input.value = id ?? '';
    input.checked = id === selectedId;
    input.addEventListener('change', () => { selectedId = id; note('admin-active-message',''); });
    const span = document.createElement('span');
    span.textContent = name;
    label.append(input,span);
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
  const {data,error} = await supabase.from('tournaments')
    .select('id,name,is_active').order('name');
  if (error) throw error;
  tournaments = data ?? [];
  if (tournaments.filter(g=>g.is_active).length > 1) throw new Error('Flere turneringer er aktive. Kontrollér Supabase-data.');
  currentId = tournaments.find(t => t.is_active)?.id ?? null;
  selectedId = currentId;
  drawTournaments();
}
async function checkAdminAccess() {
  const {data,error} = await supabase.rpc('admin_access_until');
  if (error) throw error;
  adminExpires = data;
  return Boolean(data && new Date(data).getTime() > Date.now());
}
async function unlocked() {
  await fetchTournaments();
  showAdmin();
  note('admin-status', 'Spilsamlingerne er indlæst. Ændringer gælder nye registreringer.');
}
function handleError(error, target) {
  const message = error?.message || String(error);
  if (/Administrationsadgang mangler|udløbet/.test(message)) {
    adminExpires = null;
    showLogin();
    note('admin-status','Administrationsadgangen er udløbet. Indtast koden igen.',true);
  }
  note(target, message, true);
}

$('admin-password-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!supabase) return;
  const button = $('admin-unlock-btn');
  button.disabled = true;
  note('admin-password-message','Kontrollerer adgangskoden ...');
  try {
    const password = $('admin-password').value;
    const {data,error} = await supabase.rpc('unlock_admin',{p_password:password});
    $('admin-password').value = '';
    if (error) throw error;
    if (!data) { note('admin-password-message','Forkert kode eller for mange forsøg. Prøv igen senere.',true); return; }
    adminExpires = data;
    await unlocked();
  } catch(err) { handleError(err,'admin-password-message'); }
  finally { button.disabled = false; }
});

$('admin-active-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!supabase) return;
  const button = $('admin-save-active-btn');
  button.disabled = true;
  note('admin-active-message','Gemmer aktiv spilsamling ...');
  try {
    const {error} = await supabase.rpc('admin_set_active_tournament',{p_tournament_id:selectedId});
    if (error) throw error;
    await fetchTournaments();
    note('admin-active-message',currentId
      ? `Aktiv spilsamling er nu ${tournaments.find(t=>t.id===currentId)?.name}.`
      : 'Ingen aktiv turnering. Nye spil vil som standard være Kredsspil.');
  } catch(err) { handleError(err,'admin-active-message'); }
  finally { if (!$('admin-content').classList.contains('hidden')) button.disabled = selectedId === currentId; }
});

$('admin-create-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!supabase) return;
  const button = $('admin-create-btn');
  button.disabled = true;
  note('admin-create-message','Opretter spilsamling ...');
  try {
    const name = $('admin-new-name').value.trim();
    const {error} = await supabase.rpc('admin_create_tournament',{p_name:name});
    if (error) throw error;
    $('admin-new-name').value = '';
    await fetchTournaments();
    note('admin-create-message',`“${name}” er oprettet og kan nu vælges i Historik. Vælg den ovenfor for at aktivere den.`);
  } catch(err) { handleError(err,'admin-create-message'); }
  finally { button.disabled = false; }
});

$('admin-tournament-options').addEventListener('change', () => {
  $('admin-save-active-btn').disabled = selectedId === currentId;
});
$('admin-lock-btn').addEventListener('click',async () => {
  $('admin-lock-btn').disabled = true;
  try {
    const {error} = await supabase.rpc('lock_admin');
    if (error) throw error;
    adminExpires = null;
    showLogin();
    note('admin-status','Administrering er låst. Den fælles adgang til registrering er uændret.');
  } catch(err) { handleError(err,'admin-status'); }
  finally { $('admin-lock-btn').disabled = false; }
});

async function init() {
  if (isPreview) {
    note('admin-status','Testtilstand. Tilslut Supabase for at oprette eller aktivere turneringer.',true);
    showLogin();
    $('admin-unlock-btn').disabled = true;
    return;
  }
  try {
    const cfg = await import('./config.js');
    if (!cfg.SUPABASE_URL?.startsWith('https://') || !cfg.SUPABASE_PUBLISHABLE_KEY ||
      cfg.SUPABASE_URL.includes('YOUR-') || cfg.SUPABASE_PUBLISHABLE_KEY.includes('YOUR-')) {
      throw new Error('Supabase mangler konfiguration i assets/js/config.js');
    }
    const {createClient} = await import('https://esm.sh/@supabase/supabase-js@2');
    supabase = createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY,{
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
      const {data:anon,error:anonError} = await supabase.auth.signInAnonymously();
      if (anonError) throw anonError;
      session = anon.session;
    }
    if (!session) throw new Error('Kunne ikke oprette anonym session.');
    if (await checkAdminAccess()) await unlocked();
    else {
      showLogin();
      note('admin-status','Indtast den separate administrationskode for at ændre spilsamlinger.');
    }
  } catch(err) {
    console.error('Fejl i Administrering:',err);
    showLogin();
    note('admin-status',`Kunne ikke åbne Administrering: ${err.message}. Kontrollér at 07_administration.sql er kørt.`,true);
  }
}
init();
