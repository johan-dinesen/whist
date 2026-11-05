import {getWhistClient} from './supabase-client.js';
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
// No more than 13 tricks exist; negative choices stay capped at -7.
const scoresForTricks = tricks => [
  ...Array.from({length: 14 - tricks}, (_,i) => 13 - tricks - i),
  ...Array.from({length: 5}, (_,i) => -(i + 1))
];
const previewMode = new URLSearchParams(location.search).has('preview');
let supabase = null;
let accessUntil = null;
let players = [];
// Reuse decoded profile photos across selections and redraws. Failed images
// retain an initials fallback, including players without uploaded pictures.
const choicePhotoCache = new Map();
const choicePhotoVersion = String(Date.now());
function showChoicePhoto(figure, source) {
  if (figure.classList.contains('has-photo')) return;
  const image = source.cloneNode(false);
  image.alt = '';
  image.decoding = 'async';
  figure.append(image);
  figure.classList.add('has-photo');
}
function choiceAvatar(playerId, displayName) {
  const figure = document.createElement('span');
  figure.className = 'choice-avatar';
  figure.setAttribute('aria-hidden', 'true');
  const initials = document.createElement('span');
  initials.textContent = String(displayName).trim().split(/\s+/).slice(0, 2).map(part=>part[0]).join('').toUpperCase();
  figure.append(initials);
  if (!supabase || String(playerId).startsWith('demo-')) return figure;
  const {data} = supabase.storage.from('whist-profiles').getPublicUrl(`${playerId}.webp`);
  const url = `${data.publicUrl}?v=${encodeURIComponent(choicePhotoVersion)}`;
  let entry = choicePhotoCache.get(url);
  if (!entry) {
    const source = new Image();
    entry = {source, status:'loading', waiting:new Set()};
    choicePhotoCache.set(url, entry);
    source.onload = () => {
      entry.status = source.naturalWidth ? 'ready' : 'missing';
      if (entry.status === 'ready') {
        for (const waiting of entry.waiting) showChoicePhoto(waiting, source);
      }
      entry.waiting.clear();
    };
    source.onerror = () => {entry.status = 'missing'; entry.waiting.clear();};
    source.src = url;
  }
  if (entry.status === 'ready') showChoicePhoto(figure, entry.source);
  else if (entry.status === 'loading') entry.waiting.add(figure);
  return figure;
}
// Snapshotted at the first actual save attempt; NULL means Kredsspil.
let submissionTournamentId = null;

let requestId = null;
let submissionTime = null; // Device timestamp captured on final write attempt.
let canSave = false; // Only true after a successful authenticated Supabase data load.
const s = {
  playerIds: [], callType: null, callerIds: [],
  tricks: null, vipDepth: null, trump: null, partnerId: null,
  score: null, soloResults: {}
};


// Align newly revealed sections by their heading, not by centering the entire
// panel (which may be much taller than an older phone's screen).
// Schedule for the next frame so the new section has been laid out, without
// imposing the previous 100 ms delay after each selection.
let pendingStepScroll = null;
function cancelStepScroll() {
  if (pendingStepScroll === null) return;
  clearTimeout(pendingStepScroll);
  pendingStepScroll = null;
}
function scrollToStep(id, goingBack = false) {
  cancelStepScroll();
  const align = () => {
    pendingStepScroll = null;
    const element = $(id);
    if (!element || element.classList.contains('hidden')) return;
    const heading = element.querySelector?.('.step-title, h2') ?? element;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Keep the next heading in the same comfortable position on phones and
    // desktop. A 52 px minimum avoids crowding the top edge on short screens.
    const defaultOffset = Math.min(94, Math.max(52, window.innerHeight * 0.12));
    // Back navigation must also clear the sticky navigation bar on short phones.
    const navHeight = goingBack ? document.querySelector('.topbar')?.getBoundingClientRect().height ?? 0 : 0;
    const offset = Math.max(defaultOffset, navHeight + (goingBack ? 12 : 0));
    if (typeof heading.getBoundingClientRect !== 'function') {
      element.scrollIntoView({behavior: reducedMotion ? 'auto' : 'smooth', block: 'start'});
      return;
    }
    // A freshly revealed step can be the last element on the page. Provide
    // exactly the extra scroll room needed to align its heading, rather than
    // leaving it stranded near the bottom of the screen on tall phones.
    const panel = $('game-panel');
    const destination = Math.max(0, heading.getBoundingClientRect().top + window.scrollY - offset);
    const availableScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const extraSpace = Math.max(0, Math.ceil(destination - availableScroll + 12));
    // Only grow the end spacer during a registration. Shrinking it between
    // selections can snap the current scroll position upward on mobile Safari.
    if (extraSpace) {
      const currentSpace = Number.parseFloat(panel.style.paddingBottom) || 0;
      panel.style.paddingBottom = `${currentSpace + extraSpace}px`;
      // On short pages, the first padding increase can change where the
      // document ends. Check the resulting scroll range once more.
      const remaining = destination - (document.documentElement.scrollHeight - window.innerHeight);
      if (remaining > 1) panel.style.paddingBottom = `${currentSpace + extraSpace + Math.ceil(remaining)}px`;
    }
    window.scrollTo({top: destination, behavior: reducedMotion ? 'auto' : 'smooth'});
  };
  pendingStepScroll = setTimeout(align, 80);
}
// The step controls navigate among the steps currently available. Changing an
// earlier answer still uses the existing resetFrom() logic; navigation itself
// never clears or submits anything.
const registrationSteps = [
  $('game-panel').querySelector('.step'),
  ...$('game-panel').querySelectorAll('.step[id]'),
  $('review-panel')
];
function updateRegistrationNavigation() {
  registrationSteps.forEach((step, index) => {
    const previous = registrationSteps.slice(0, index).some(other => !other.classList.contains('hidden'));
    const next = registrationSteps.slice(index + 1).some(other => !other.classList.contains('hidden'));
    step.querySelector('[data-step-direction="up"]').disabled = !previous;
    step.querySelector('[data-step-direction="down"]').disabled = !next;
  });
}
function installRegistrationNavigation() {
  registrationSteps[0].id = 'players-step';
  const review = $('review-panel');
  const reviewTitle = review.querySelector('h2');
  const reviewHeading = document.createElement('div');
  reviewHeading.className = 'step-title review-step-title';
  reviewTitle.before(reviewHeading);
  reviewHeading.append(reviewTitle);

  const arrows = {
    up: '<path d="M12 19V5m0 0-7 7m7-7 7 7"/>',
    down: '<path d="M12 5v14m0 0 7-7m-7 7-7-7"/>'
  };
  for (let index = 0; index < registrationSteps.length; index++) {
    const heading = registrationSteps[index].querySelector('.step-title');
    const controls = document.createElement('div');
    controls.className = 'step-navigation';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Naviger mellem registreringstrin');
    for (const [direction, delta, label] of [['up', -1, 'Forrige trin'], ['down', 1, 'Næste trin']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'step-navigation-button';
      button.dataset.stepDirection = direction;
      button.setAttribute('aria-label', label);
      button.title = label;
      button.innerHTML = `<svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${arrows[direction]}</svg>`;
      button.addEventListener('click', () => {
        // Clear touch/keyboard focus so the button returns to its base styling.
        button.blur();
        for (let target = index + delta; target >= 0 && target < registrationSteps.length; target += delta) {
          if (!registrationSteps[target].classList.contains('hidden')) {
            scrollToStep(registrationSteps[target].id, delta < 0);
            break;
          }
        }
      });
      controls.append(button);
    }
    heading.append(controls);
  }
  updateRegistrationNavigation();
}
installRegistrationNavigation();

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
  submissionTournamentId = null;
}
function buttons(id, opts, selected, onClick, options = {}) {
  const root = $(id); root.replaceChildren();
  for (const [value, text] of opts) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'choice' + (options.guest?.(value) ? ' guest' : '');
    b.textContent = text;
    if (options.player) {
      b.classList.add('player-choice');
      b.setAttribute('aria-label', text);
      const label = document.createElement('span');
      label.className = 'player-choice-name';
      label.textContent = text;
      b.replaceChildren(label, choiceAvatar(value, text));
    }
    b.setAttribute('aria-pressed', String(selected(value)));
    b.disabled = Boolean(options.disabled?.(value));
    b.addEventListener('click', () => onClick(value));
    root.append(b);
  }
}
function renderPlayers() {
  // Keep all regular players together; append guests alphabetically when enabled.
  const byName = (a,b) => a.display_name.localeCompare(b.display_name,'da');
  const regulars = players.filter(p => p.active && !p.is_guest).sort(byName);
  const guests = $('show-guests').checked
    ? players.filter(p => p.active && p.is_guest).sort(byName)
    : [];
  const available = [...regulars, ...guests];
  buttons('players-options', available.map(p=>[p.id,p.display_name]),
    id=>s.playerIds.includes(id), id=>{
      if (s.playerIds.includes(id)) s.playerIds = s.playerIds.filter(x=>x!==id);
      else if (s.playerIds.length < 4) s.playerIds.push(id);
      resetFrom(1); renderAndAdvance('call-step');
    }, { player:true, guest: id=>players.find(p=>p.id===id)?.is_guest,
      disabled: id=>s.playerIds.length===4 && !s.playerIds.includes(id) });
  $('player-count').textContent = `${s.playerIds.length} / 4`;
}
function render() {
  renderPlayers();
  const full = s.playerIds.length === 4;
  show('call-step', full);
  if (!full) { $('game-panel').style.paddingBottom = ''; ['caller-step','tricks-step','vip-step','trump-step','partner-step','result-step','review-panel'].forEach(id=>show(id,false)); updateRegistrationNavigation(); return; }
  buttons('call-options', CALLS, v=>s.callType===v, v=>{s.callType=v;resetFrom(2);renderAndAdvance('caller-step');});
  show('caller-step', Boolean(s.callType));
  if (!s.callType) { ['tricks-step','vip-step','trump-step','partner-step','result-step','review-panel'].forEach(id=>show(id,false)); updateRegistrationNavigation(); return; }
  $('caller-help').textContent = isSolo() ? 'Vælg én eller flere meldere.' : 'Vælg én melder.';
  buttons('caller-options', sortedChosen().map(p=>[p.id,p.display_name]), id=>s.callerIds.includes(id), id=>{
    if (isSolo()) s.callerIds = s.callerIds.includes(id) ? s.callerIds.filter(x=>x!==id) : [...s.callerIds,id];
    else s.callerIds=[id];
    resetFrom(3);renderAndAdvance(isSolo() ? 'result-step' : 'tricks-step');
  }, {player:true});
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
    buttons('partner-options',sortedChosen().map(p=>[p.id,p.display_name]),v=>s.partnerId===v,v=>{s.partnerId=v;resetFrom(7);renderAndAdvance('result-step');}, {player:true});
  }
  const canResult = isSolo() ? hasCaller : Boolean(s.partnerId);
  show('result-step', canResult);
  if (canResult) renderResult();
  const complete = canResult && (isSolo()
    ? s.callerIds.every(id=>Boolean(s.soloResults[id]))
    : s.score !== null);
  show('review-panel',complete);
  if (complete) renderReview();
  updateRegistrationNavigation();
}
function renderResult() {
  if (!isSolo()) {
    $('result-options').style.display='grid';
    $('result-help').textContent=`Vælg resultat fra +${13 - s.tricks} til −5.`;
    buttons('result-options', scoresForTricks(s.tricks).map(n=>[n,n>0?`+${n}`:String(n)]), v=>s.score===v,v=>{s.score=v;requestId=null;submissionTime=null;renderAndAdvance('review-panel');});
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
async function readActiveTournamentId() {
  // The choice is entirely implicit and configured in Administrering.
  // Take a snapshot only when the first save is attempted (after password validation).
  const {data,error} = await supabase.from('tournaments')
    .select('id').eq('is_active',true);
  if (error) throw error;
  if ((data ?? []).length > 1) throw new Error('Flere turneringer er markeret aktive.');
  return data?.[0]?.id ?? null; // No active tournament = Kredsspil.
}
function resetRegistration(scrollToTop = true) {
  cancelStepScroll();
  $('game-panel').style.paddingBottom = '';
  s.playerIds = [];
  resetFrom(1);
  $('show-guests').checked = false;
  $('shared-password').value = '';
  message('password-message', '');
  message('save-message', '');
  show('password-panel', false);
  show('success-panel', false);
  show('game-panel', true);
  $('save-btn').disabled = false;
  render();
  if (scrollToTop) {
    window.scrollTo({top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  }
}
function newGame() { resetRegistration(); }
async function hasWriteAccess() {
  const {data,error}=await supabase.rpc('registration_access_until');
  if (error) throw error;
  accessUntil=data;
  return Boolean(data && new Date(data).getTime()>Date.now());
}
function showPasswordRequest() {
  show('password-panel',true);
  message('save-message','Indtast den fælles adgangskode nedenfor for at gemme spillet.');
  $('password-panel').scrollIntoView({behavior:'smooth',block:'center'});
  $('shared-password').focus({preventScroll:true});
}
async function saveGame() {
  if (!canSave || !supabase) {
    message('save-message','Spillet kan ikke gemmes, fordi der ikke er forbindelse til Supabase. Ingen data er gemt.',true);
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
    try {
      submissionTournamentId = await readActiveTournamentId();
    } catch(err) {
      message('save-message',`Kunne ikke finde den aktive spilsamling: ${err.message}. Intet er gemt.`,true);
      $('save-btn').disabled=false;
      return;
    }
    // Capture the device timestamp, category and idempotency key together.
    // If a network request fails, retry the same attempted game, unchanged.
    requestId = crypto.randomUUID();
    submissionTime = new Date().toISOString();
  }
  const participants=s.playerIds.map((id,i)=>({player_id:id,seat:i+1,is_caller:s.callerIds.includes(id),is_partner:!isSolo()&&s.partnerId===id,solo_result:isSolo()?s.soloResults[id]??null:null}));
  const params={p_request_id:requestId,p_tournament_id:submissionTournamentId,p_played_at:submissionTime,p_call_type:s.callType,
    p_tricks:isSolo()?null:s.tricks,p_vip_depth:s.callType==='vip'?s.vipDepth:null,p_trump:isSolo()?null:s.trump,
    p_score:isSolo()?null:s.score,p_participants:participants};
  message('save-message','Gemmer spillet ...');
  try {
    const {data,error}=await supabase.rpc('register_game',params);
    if(error)throw error;
    $('success-id').textContent=`Spil-ID: ${data}`;
    window.dispatchEvent(new CustomEvent('whist:datachanged', {detail:{kind:'games'}}));
    show('game-panel',false);show('success-panel',true);
    window.scrollTo({top:0,behavior:'smooth'});
  } catch(err){message('save-message',`Spillet blev ikke bekræftet gemt: ${err.message}. Prøv igen.`,true);$('save-btn').disabled=false;}
}
function showDemo(reason, reportError = false) {
  // Stable fallback for troubleshooting only. Demo IDs are never sent to Supabase.
  const names=['David','Gustav','Johan','Samuel','Sofus','William',
    'Anna','Caroline','Iben','Maria','Stine','Vera'];
  const selectedNames=s.playerIds.map(id=>getName(id));
  players=names.map((name,i)=>({id:`demo-${i}`,display_name:name,is_guest:i>=6,active:true}));
  s.playerIds=players.filter(p=>selectedNames.includes(p.display_name)).map(p=>p.id);
  canSave=false;
  $('configuration-message').textContent=reportError ? reason : '';
  show('configuration-message',reportError);
  render();
}

async function loadData() {
  const {data,error}=await supabase.from('players')
    .select('id,display_name,is_guest,active').eq('active',true).order('display_name');
  if(error)throw error;
  if(!data?.length)throw new Error('Ingen spillere i Supabase. Kontrollér players-tabellen, 02_seed.sql og adgangspolitikker.');
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
$('new-game-btn').addEventListener('click', newGame);
$('reset-game-btn').addEventListener('click', () => resetRegistration());

// Leaving Registrering discards unfinished choices. The SPA performs its own
// immediate scroll-to-top during navigation, so don't start a second scroll.
window.addEventListener('whist:leave-registration', () => resetRegistration(false));
window.addEventListener('whist:datachanged', event => {
  if (event.detail?.kind === 'players' && supabase) void loadData().catch(console.error);
});

async function init() {
  // Make the form usable immediately, including when the server or config fails.
  showDemo('Forbinder til Supabase. Spillerne kan vælges nu, men gemning kræver aktiv forbindelse.');
  window.__whistAppReady = true;
  if (previewMode) {
    showDemo('Testtilstand: Du kan gennemgå formularen, men spil gemmes ikke. Fjern ?preview=1 for at forbinde.',true);
    return;
  }
  try {
    const config = await import('./config.js');
    SUPABASE_URL = config.SUPABASE_URL ?? '';
    SUPABASE_PUBLISHABLE_KEY = config.SUPABASE_PUBLISHABLE_KEY ?? '';
  } catch (err) {
    showDemo('Kunne ikke indlæse assets/js/config.js. Kontrollér at filen findes, og at den ligger i den rigtige mappe. Spil kan ikke gemmes.',true);
    return;
  }
  const configReady = SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.includes('YOUR-')
    && SUPABASE_PUBLISHABLE_KEY && !SUPABASE_PUBLISHABLE_KEY.includes('YOUR-');
  if (!configReady) {
    showDemo('Supabase mangler opsætning i assets/js/config.js. Indsæt projektets URL og publishable key. Spil kan ikke gemmes.',true);
    return;
  }
  try {
    supabase = await getWhistClient();
    await loadData();
    try {await hasWriteAccess();}
    catch(err){
      console.warn('Adgangsstatus kan ikke kontrolleres:',err.message);
      $('configuration-message').textContent=`Adgangskontrol fejler: ${err.message}. Kontrollér at sql/04_shared_password.sql er kørt.`;
      show('configuration-message',true);
    }
  } catch(err) {
    console.error('Supabase initialisering fejlede:',err);
    supabase=null;
    showDemo(`Supabase kunne ikke forbindes: ${err.message}. Kontrollér assets/js/config.js, anonyme logins og SQL-tabeller. Spil kan ikke gemmes.`,true);
  }
}
init();
