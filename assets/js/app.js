import {scoreGame, formatPoints} from './scoring.js';
window.__whistAppStarted = true;
// Load config dynamically so a missing config.js cannot hide the form.
let SUPABASE_URL = '';
let SUPABASE_PUBLISHABLE_KEY = '';

const $ = id => document.getElementById(id);
const CALLS = [
  ['almindelig', 'Almindelig'], ['gode', 'Gode'], ['halve', 'Halve'],
  ['vip', 'Vip'], ['sol', 'Sol'], ['ren_sol', 'Ren Sol'],
  ['bordlaegger', 'Bordlægger'], ['ren_bordlaegger', 'Ren Bordlægger']
];
const TRUMPS = [
  ['hearts', '❤️ Hjerter'], ['clubs', '♣️ Klør'],
  ['diamonds', '♦️ Ruder'], ['spades', '♠️ Spar'], ['no_trump', '🃏 Uden trumf']
];
const SOLO = new Set(['sol', 'ren_sol', 'bordlaegger', 'ren_bordlaegger']);
const SHORT_SOLO = new Set(['sol', 'bordlaegger']);
const SCORES = [4,3,2,1,0,-1,-2,-3,-4,-5,-6,-7];
const previewMode = new URLSearchParams(location.search).has('preview');
let supabase = null;
let accessUntil = null;
let players = [];
let activeTournament = null;
// The choice persists when registering the next game on the same page.
let scopeMode = 'active';

let requestId = null;
let submissionTime = null; // Device timestamp captured on final write attempt.
let canSave = false; // Only true after a successful authenticated Supabase data load.
const s = {
  playerIds: [], callType: null, callerIds: [],
  tricks: null, vipDepth: null, trump: null, partnerId: null,
  score: null, soloResults: {}
};


// Advance only when a user selection actually reveals the next section.
// Matches the previous form's smooth, centered step-by-step scrolling.
let pendingStepScroll = null;
function scrollToStep(id) {
  if (pendingStepScroll !== null) clearTimeout(pendingStepScroll);
  pendingStepScroll = setTimeout(() => {
    pendingStepScroll = null;
    const element = $(id);
    if (!element || element.classList.contains('hidden')) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({behavior: reducedMotion ? 'auto' : 'smooth', block: 'center'});
  }, 100);
}
function renderAndAdvance(id) {
  const wasHidden = $(id).classList.contains('hidden');
  render();
  if (wasHidden && !$(id).classList.contains('hidden')) scrollToStep(id);
}
function show(id, visible) { $(id).classList.toggle('hidden', !visible); }
function labelFrom(list, value) { return list.find(a => a[0] === value)?.[1] ?? String(value ?? ''); }
function getName(id) { return players.find(p => p.id === id)?.display_name ?? 'Ukendt spiller'; }
function sortedChosen() { return players.filter(p => s.playerIds.includes(p.id)).sort((a,b) => a.display_name.localeCompare(b.display_name,'da')); }
function isSolo() { return SOLO.has(s.callType); }
function message(id, txt, error = false) { const el = $(id); el.textContent = txt; el.style.color = error ? '#ffc2a7' : ''; }
function resetFrom(level) {
  if (level <= 1) s.callType = null;
  if (level <= 2) s.callerIds = [];
  if (level <= 3) { s.tricks = null; s.vipDepth = null; s.trump = null; s.partnerId = null; s.score = null; s.soloResults = {}; }
  if (level <= 4) { s.vipDepth = null; s.trump = null; s.partnerId = null; s.score = null; }
  if (level <= 5) { s.trump = null; s.partnerId = null; s.score = null; }
  if (level <= 6) { s.partnerId = null; s.score = null; }
  if (level <= 7) s.score = null;
  requestId = null;
  submissionTime = null;
}
function buttons(id, opts, selected, onClick, options = {}) {
  const root = $(id); root.replaceChildren();
  for (const [value, text] of opts) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'choice' + (options.guest?.(value) ? ' guest' : '');
    b.textContent = text;
    b.setAttribute('aria-pressed', String(selected(value)));
    b.disabled = Boolean(options.disabled?.(value));
    b.addEventListener('click', () => onClick(value));
    root.append(b);
  }
}
function selectedScopeId() {
  return scopeMode === 'active' && activeTournament ? activeTournament.id : null;
}
function scopeLabel() {
  return selectedScopeId() ? activeTournament.name : 'Kredsspil';
}
function renderScope() {
  const choices = [['kredsspil', 'Kredsspil']];
  if (activeTournament) choices.push(['active', activeTournament.name]);
  buttons('scope-options', choices, value =>
    value === 'kredsspil' ? !selectedScopeId() : Boolean(selectedScopeId()), value => {
      scopeMode = value;
      // A failed save retried with a new category must use a new request ID.
      requestId = null;
      submissionTime = null;
      render();
    });
  $('scope-hint').textContent = activeTournament
    ? `Aktiv turnering: ${activeTournament.name}. Kredsspil kan vælges for enkelte spil.`
    : 'Ingen aktiv turnering er valgt i Supabase. Nye spil gemmes som Kredsspil.';
}
function renderPlayers() {
  let available = players.filter(p => p.active && (!p.is_guest || $('show-guests').checked));
  available.sort((a,b) => a.display_name.localeCompare(b.display_name,'da'));
  buttons('players-options', available.map(p=>[p.id,p.display_name]),
    id=>s.playerIds.includes(id), id=>{
      if (s.playerIds.includes(id)) s.playerIds = s.playerIds.filter(x=>x!==id);
      else if (s.playerIds.length < 4) s.playerIds.push(id);
      resetFrom(1); renderAndAdvance('call-step');
    }, { guest: id=>players.find(p=>p.id===id)?.is_guest,
      disabled: id=>s.playerIds.length===4 && !s.playerIds.includes(id) });
  $('player-count').textContent = `${s.playerIds.length} / 4`;
}
function render() {
  renderScope();
  renderPlayers();
  const full = s.playerIds.length === 4;
  show('call-step', full);
  if (!full) { ['caller-step','tricks-step','vip-step','trump-step','partner-step','result-step','review-panel'].forEach(id=>show(id,false)); return; }
  buttons('call-options', CALLS, v=>s.callType===v, v=>{s.callType=v;resetFrom(2);renderAndAdvance('caller-step');});
  show('caller-step', Boolean(s.callType));
  if (!s.callType) { ['tricks-step','vip-step','trump-step','partner-step','result-step','review-panel'].forEach(id=>show(id,false)); return; }
  $('caller-help').textContent = isSolo() ? 'Vælg én eller flere meldere.' : 'Vælg én melder.';
  buttons('caller-options', sortedChosen().map(p=>[p.id,p.display_name]), id=>s.callerIds.includes(id), id=>{
    if (isSolo()) s.callerIds = s.callerIds.includes(id) ? s.callerIds.filter(x=>x!==id) : [...s.callerIds,id];
    else s.callerIds=[id];
    resetFrom(3);renderAndAdvance(isSolo() ? 'result-step' : 'tricks-step');
  });
  const hasCaller = s.callerIds.length > 0;
  show('tricks-step', hasCaller && !isSolo());
  show('vip-step', hasCaller && s.tricks!==null && s.callType==='vip');
  const canTrump = hasCaller && s.tricks!==null && (s.callType!=='vip' || s.vipDepth!==null);
  show('trump-step', !isSolo() && canTrump);
  show('partner-step', !isSolo() && canTrump && Boolean(s.trump));
  if (!isSolo() && hasCaller) {
    buttons('tricks-options', [9,10,11,12,13].map(x=>[x,String(x)]),v=>s.tricks===v,v=>{s.tricks=v;resetFrom(4);renderAndAdvance(s.callType==='vip' ? 'vip-step' : 'trump-step');});
    buttons('vip-options', [1,2,3].map(x=>[x,String(x)]),v=>s.vipDepth===v,v=>{s.vipDepth=v;resetFrom(5);renderAndAdvance('trump-step');});
    const options = s.callType==='gode' ? TRUMPS.filter(a=>['clubs','no_trump'].includes(a[0])) : TRUMPS;
    buttons('trump-options',options,v=>s.trump===v,v=>{s.trump=v;resetFrom(6);renderAndAdvance('partner-step');});
    buttons('partner-options',sortedChosen().map(p=>[p.id,p.display_name]),v=>s.partnerId===v,v=>{s.partnerId=v;resetFrom(7);renderAndAdvance('result-step');});
  }
  const canResult = isSolo() ? hasCaller : Boolean(s.partnerId);
  show('result-step', canResult);
  if (canResult) renderResult();
  const complete = canResult && (isSolo()
    ? s.callerIds.every(id=>Boolean(s.soloResults[id]))
    : s.score !== null);
  show('review-panel',complete);
  if (complete) renderReview();
}
function renderResult() {
  if (!isSolo()) {
    $('result-options').style.display='grid';
    $('result-help').textContent='Vælg resultat fra +4 til −7.';
    buttons('result-options', SCORES.map(n=>[n,n>0?`+${n}`:String(n)]), v=>s.score===v,v=>{s.score=v;requestId=null;submissionTime=null;renderAndAdvance('review-panel');});
    return;
  }
  $('result-help').textContent='Vælg udfald for hver melder.';
  const root=$('result-options');root.replaceChildren();root.style.display='block';
  const results= SHORT_SOLO.has(s.callType) ? ['Vundet (0 stik)','Vundet (1 stik)','Tabt'] : ['Vundet','Tabt'];
  for (const id of s.callerIds) {
    const wrap=document.createElement('div');wrap.className='solo-player';
    const title=document.createElement('h3');title.textContent=getName(id);wrap.append(title);
    const opts=document.createElement('div');opts.className='choices';
    for (const result of results) {
      const b=document.createElement('button'); b.type='button';b.className='choice';b.textContent=result;
      b.setAttribute('aria-pressed',String(s.soloResults[id]===result));
      b.addEventListener('click',()=>{s.soloResults[id]=result;requestId=null;submissionTime=null;renderAndAdvance('review-panel');});opts.append(b);
    }
    wrap.append(opts);root.append(wrap);
  }
}
function renderReview() {
  const fields = [
    ['Spilsamling', scopeLabel()],
    ['Spillere', s.playerIds.map(getName).join(', ')],
    ['Melding', labelFrom(CALLS,s.callType)],
    ['Melder', s.callerIds.map(getName).join(', ')]
  ];
  if (isSolo()) fields.push(['Resultater',s.callerIds.map(id=>`${getName(id)}: ${s.soloResults[id]}`).join(' · ')]);
  else fields.push(['Stik',String(s.tricks)],['Trumf',labelFrom(TRUMPS,s.trump)],
    ...(s.callType==='vip'?[['Vip dybde',String(s.vipDepth)]]:[]),
    ['Makker',getName(s.partnerId)],['Resultat',s.score>0?`+${s.score}`:String(s.score)]);
  const root=$('review-content');root.replaceChildren();
  fields.forEach(([name,value])=>{const dt=document.createElement('dt');dt.textContent=name;
    const dd=document.createElement('dd');dd.textContent=value;root.append(dt,dd);});
  renderPayoutPreview();
}
function renderPayoutPreview() {
  const root = $('payout-preview');
  root.replaceChildren();
  try {
    const payout = scoreGame(s);
    const title = document.createElement('h3');
    title.textContent = 'Pointfordeling';
    root.append(title);
    const list = document.createElement('div');
    list.className = 'payout-preview-grid';
    for (const id of s.playerIds) {
      const value = payout.get(id);
      const name = document.createElement('span'); name.textContent = getName(id);
      const number = document.createElement('strong'); number.textContent = formatPoints(value);
      number.className = value > 0 ? 'gain' : value < 0 ? 'loss' : '';
      list.append(name, number);
    }
    root.append(list);
  } catch(err) {
    root.textContent = `Kunne ikke beregne point: ${err.message}`;
  }
}
function newGame() {
  if (pendingStepScroll !== null) clearTimeout(pendingStepScroll);
  pendingStepScroll = null;
  s.playerIds=[];resetFrom(1);
  $('show-guests').checked=false;
  message('save-message','');
  show('password-panel',false);
  show('success-panel',false);show('game-panel',true);$('save-btn').disabled=false;
  render();window.scrollTo({top:0,behavior:'smooth'});
}
async function hasWriteAccess() {
  const {data,error}=await supabase.rpc('registration_access_until');
  if (error) throw error;
  accessUntil=data;
  updateAccessLabel();
  return Boolean(data && new Date(data).getTime()>Date.now());
}
function updateAccessLabel() {
  const active=accessUntil && new Date(accessUntil).getTime()>Date.now();
  $('access-status').textContent=active
    ? `Registrering er låst op på denne enhed indtil ${new Date(accessUntil).toLocaleDateString('da-DK')}.`
    : 'Du kan udfylde et spil uden kode. Den fælles adgangskode kræves først, når du gemmer.';
}
function showPasswordRequest() {
  show('password-panel',true);
  message('save-message','Indtast den fælles adgangskode nedenfor for at gemme spillet.');
  $('password-panel').scrollIntoView({behavior:'smooth',block:'center'});
  $('shared-password').focus({preventScroll:true});
}
async function saveGame() {
  if (!canSave || !supabase) {
    message('save-message','Testtilstand: Formularen virker, men Supabase er ikke tilsluttet. Ingen data er gemt. Se den gule besked øverst.',true);
    return;
  }
  if (s.playerIds.length!==4 || !s.callType || !s.callerIds.length) return;
  $('save-btn').disabled=true;
  try {
    if (!(await hasWriteAccess())) {
      $('save-btn').disabled=false;
      showPasswordRequest();
      return;
    }
  } catch (err) {
    message('save-message',`Kunne ikke kontrollere adgang: ${err.message}`,true);
    $('save-btn').disabled=false;
    return;
  }
  show('password-panel',false);
  if (!requestId) {
    requestId = crypto.randomUUID();
    // First actual registration request, after any shared-password step.
    submissionTime = new Date().toISOString();
  }
  const participants=s.playerIds.map((id,i)=>({player_id:id,seat:i+1,is_caller:s.callerIds.includes(id),is_partner:!isSolo()&&s.partnerId===id,solo_result:isSolo()?s.soloResults[id]??null:null}));
  const params={p_request_id:requestId,p_tournament_id:selectedScopeId(),p_played_at:submissionTime,p_call_type:s.callType,
    p_tricks:isSolo()?null:s.tricks,p_vip_depth:s.callType==='vip'?s.vipDepth:null,p_trump:isSolo()?null:s.trump,
    p_score:isSolo()?null:s.score,p_participants:participants};
  message('save-message','Gemmer spillet ...');
  try {
    const {data,error}=await supabase.rpc('register_game',params);
    if(error)throw error;
    $('success-id').textContent=`Spil-ID: ${data}`;
    show('game-panel',false);show('success-panel',true);
    window.scrollTo({top:0,behavior:'smooth'});
  } catch(err){message('save-message',`Spillet blev ikke bekræftet gemt: ${err.message}. Prøv igen.`,true);$('save-btn').disabled=false;}
}
function showDemo(reason) {
  // Stable fallback for troubleshooting only. Demo IDs are never sent to Supabase.
  const names=['David','Gustav','Johan','Samuel','Sofus','William',
    'Anna','Caroline','Iben','Maria','Stine','Vera'];
  const selectedNames=s.playerIds.map(id=>getName(id));
  players=names.map((name,i)=>({id:`demo-${i}`,display_name:name,is_guest:i>=6,active:true}));
  s.playerIds=players.filter(p=>selectedNames.includes(p.display_name)).map(p=>p.id);
  canSave=false;
  activeTournament=null;
  $('configuration-message').textContent=reason;
  show('configuration-message',true);
  render();
  $('access-status').textContent='Testtilstand. Du kan vælge spillere og afprøve formularen, men ingen spil kan gemmes, før Supabase virker.';
}

async function loadData() {
  const {data,error}=await supabase.from('players')
    .select('id,display_name,is_guest,active').eq('active',true).order('display_name');
  if(error)throw error;
  if(!data?.length)throw new Error('Ingen spillere i Supabase. Kontrollér players-tabellen, 02_seed.sql og adgangspolitikker.');
  const {data:groups,error:groupsError} = await supabase.from('tournaments')
    .select('id,name,is_active').order('name');
  if (groupsError) throw new Error(`Kunne ikke hente spilsamlinger: ${groupsError.message}. Kør sql/06_tournament_notes.sql i Supabase.`);
  const active = (groups ?? []).filter(t => t.is_active);
  if (active.length > 1) throw new Error('Flere turneringer er markeret aktive i Supabase.');
  activeTournament = active[0] ?? null;
  // Preserve in-progress selections when demo IDs switch to real UUIDs.
  // Every game submitted later must use the live player IDs from Supabase.
  const oldNames=new Map(players.map(p=>[p.id,p.display_name]));
  const liveByName=new Map(data.map(p=>[p.display_name.toLocaleLowerCase('da'),p.id]));
  const liveId=oldId=> oldId && liveByName.get(String(oldNames.get(oldId)||'').toLocaleLowerCase('da'));
  const priorCount=s.playerIds.length;
  const mappedPlayers=s.playerIds.map(liveId).filter(Boolean);
  const mappedCallers=s.callerIds.map(liveId).filter(Boolean);
  const mappedPartner=liveId(s.partnerId)||null;
  const mappedSolo={};
  for(const [oldId,result] of Object.entries(s.soloResults)) {
    const id=liveId(oldId);
    if(id)mappedSolo[id]=result;
  }
  players=data;
  s.playerIds=mappedPlayers;
  s.callerIds=mappedCallers;
  s.partnerId=mappedPartner;
  s.soloResults=mappedSolo;
  if(s.playerIds.length!==priorCount) resetFrom(1);
  canSave=true;
  show('configuration-message',false);
  render();
}

$('password-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if (!supabase) return;
  $('unlock-btn').disabled=true;
  message('password-message','Kontrollerer kode ...');
  try {
    const {data,error}=await supabase.rpc('unlock_registration',{
      p_password:$('shared-password').value
    });
    $('shared-password').value=''; // Never retain the shared secret in the browser's JS state.
    if (error) throw error;
    if (!data) {
      message('password-message','Forkert kode eller for mange forsøg. Prøv igen senere.',true);
      return;
    }
    accessUntil=data;
    updateAccessLabel();
    show('password-panel',false);
    message('password-message','');
    await saveGame();
  } catch(err){
    message('password-message',`Kunne ikke godkende adgang: ${err.message}`,true);
  } finally {
    $('unlock-btn').disabled=false;
    $('save-btn').disabled=false;
  }
});
$('show-guests').addEventListener('change',()=>{if(!$('show-guests').checked){const valid=new Set(players.filter(p=>!p.is_guest).map(p=>p.id));if(s.playerIds.some(id=>!valid.has(id))){s.playerIds=s.playerIds.filter(id=>valid.has(id));resetFrom(1);}}render();});
$('save-btn').addEventListener('click',saveGame);
$('new-game-btn').addEventListener('click',newGame);

async function init() {
  // Make the form usable immediately, including when the server or config fails.
  showDemo('Forbinder til Supabase. Spillerne kan vælges nu, men gemning kræver aktiv forbindelse.');
  window.__whistAppReady = true;
  if (previewMode) {
    showDemo('TESTTILSTAND: Du kan gennemgå alle felter. Intet sendes til databasen. Fjern ?preview=1 for at forbinde.');
    return;
  }
  try {
    const config = await import('./config.js');
    SUPABASE_URL = config.SUPABASE_URL ?? '';
    SUPABASE_PUBLISHABLE_KEY = config.SUPABASE_PUBLISHABLE_KEY ?? '';
  } catch (err) {
    showDemo('Kunne ikke indlæse assets/js/config.js. Kontrollér at filen findes, og at den ligger i den rigtige mappe. Formularen fungerer kun i testtilstand.');
    return;
  }
  const configReady = SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.includes('YOUR-')
    && SUPABASE_PUBLISHABLE_KEY && !SUPABASE_PUBLISHABLE_KEY.includes('YOUR-');
  if (!configReady) {
    showDemo('Supabase mangler opsætning i assets/js/config.js. Indsæt projektets URL og publishable key. Formularen vises i testtilstand og gemmer intet.');
    return;
  }
  try {
    const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
    supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
    });
    const {data,error}=await supabase.auth.getSession();
    if(error)throw error;
    let session=data.session;
    if (session && session.user?.is_anonymous === false) {
      const {error:signOutError}=await supabase.auth.signOut();
      if (signOutError)throw signOutError;
      session=null;
    }
    if(!session){
      const {data:anon,error:anonError}=await supabase.auth.signInAnonymously();
      if(anonError)throw anonError;
      session=anon.session;
    }
    if(!session)throw new Error('Kunne ikke oprette anonym session.');
    await loadData();
    try {await hasWriteAccess();}
    catch(err){
      console.warn('Adgangsstatus kan ikke kontrolleres:',err.message);
      $('access-status').textContent='Forbindelsen til spillerlisten virker, men adgangskontrollen fejler. Kontrollér sql/04_shared_password.sql.';
      $('configuration-message').textContent=`Adgangskontrol fejler: ${err.message}. Kontrollér at sql/04_shared_password.sql er kørt.`;
      show('configuration-message',true);
    }
  } catch(err) {
    console.error('Supabase initialisering fejlede:',err);
    supabase=null;
    showDemo(`Supabase kunne ikke forbindes: ${err.message}. Kontrollér assets/js/config.js, anonyme logins og SQL-tabeller. Ingen data kan gemmes i testtilstand.`);
  }
}
init();
