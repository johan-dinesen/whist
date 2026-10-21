import {formatPoints} from './scoring.js';

const $ = id => document.getElementById(id);
const REGULAR = ['David','Gustav','Johan','Samuel','Sofus','William'];
const LABELS = {
  almindelig:'Almindelig',gode:'Gode',halve:'Halve',vip:'Vip',
  sol:'Sol',ren_sol:'Ren Sol',bordlaegger:'Bordlægger',ren_bordlaegger:'Ren Bordlægger'
};
const TRUMPS = {hearts:'♥',clubs:'♣',diamonds:'♦',spades:'♠',no_trump:'NT'};
const SOLO = new Set(['sol','ren_sol','bordlaegger','ren_bordlaegger']);
const dtFormat = new Intl.DateTimeFormat('da-DK',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
let supabase = null;
let lastGames = [];

function visible(id, yes) { $(id).classList.toggle('hidden', !yes); }
function status(text, isError = false) {
  $('history-status').textContent = text;
  $('history-status').classList.toggle('notice-warning', isError);
  $('history-status').style.borderColor = isError ? '' : 'var(--edge)';
  $('history-status').style.background = isError ? '' : 'var(--surface)';
  $('history-status').style.color = isError ? '' : 'var(--muted)';
}
function cell(text, element = 'td') { const el = document.createElement(element); el.textContent = text ?? ''; return el; }
function dated(date, inclusiveEnd = false) {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) throw new Error('Ugyldig dato');
  if (inclusiveEnd) d.setDate(d.getDate()+1);
  return d.toISOString();
}
function ensureDateOrder() {
  if ($('from-date').value && $('to-date').value && $('to-date').value < $('from-date').value) {
    throw new Error('Slutdato må ikke være før startdato');
  }
}
function gameLabel(game) {
  let str = SOLO.has(game.call_type) ? LABELS[game.call_type] : `${game.tricks}${LABELS[game.call_type]}`;
  if (!SOLO.has(game.call_type)) str += ` ${TRUMPS[game.trump] ?? ''}`;
  if (game.call_type==='vip') str += ` ×${game.vip_depth}`;
  return str;
}
function gameResult(game) {
  if (!SOLO.has(game.call_type)) return game.score > 0 ? `+${game.score}` : String(game.score);
  return (game.participants ?? [])
    .filter(p=>p.is_caller)
    .map(p=>String(p.solo_result || '').startsWith('Vundet') ? '✅' : '❌')
    .join('');
}
function drawTable(games) {
  const allParticipants = games.flatMap(g=>g.participants ?? []);
  const otherRegulars = [...new Set(allParticipants.filter(p=>!p.is_guest).map(p=>p.name))]
    .filter(n=>!REGULAR.includes(n)).sort((a,b)=>a.localeCompare(b,'da'));
  const guests = $('include-guests').checked ? [...new Set(allParticipants.filter(p=>p.is_guest).map(p=>p.name))]
    .sort((a,b)=>a.localeCompare(b,'da')) : [];
  const names = [...REGULAR, ...otherRegulars, ...guests];
  const head = $('history-head');head.replaceChildren();
  const header = document.createElement('tr');
  for (const text of ['Dato','Melding','Resultat','Melder','Makker',...names]) header.append(cell(text,'th'));
  head.append(header);
  const body = $('history-body');body.replaceChildren();
  for (const game of games) {
    const tr = document.createElement('tr');
    const participants = game.participants ?? [];
    const byName = new Map(participants.map(p=>[p.name,p]));
    tr.append(cell(dtFormat.format(new Date(game.played_at))),cell(gameLabel(game)),
      cell(gameResult(game)),cell(game.callers),cell(game.partners));
    for (const name of names) {
      const participant = byName.get(name);
      const td = cell(participant ? formatPoints(participant.payout) : '');
      td.classList.add('payout-cell');
      if (participant) {
        const amount = Number(participant.payout);
        if (amount > 0) td.classList.add('gain');
        if (amount < 0) td.classList.add('loss');
      }
      tr.append(td);
    }
    body.append(tr);
  }
  $('history-count').textContent = games.length ? `${games.length} spil (højst 500 vises)` : 'Ingen spil i denne periode.';
}
async function refreshHistory() {
  try {
    ensureDateOrder();
    $('refresh-history').disabled = true;
    status('Henter spil og beregner point ...');
    const {data,error} = await supabase.rpc('get_game_history',{
      p_from: dated($('from-date').value),
      p_to: dated($('to-date').value, true),
      p_include_guests: $('include-guests').checked,
      p_tournament_id: null,
      p_max_games: 500
    });
    if (error) throw error;
    lastGames = data ?? [];
    drawTable(lastGames);
    status(`Historikken er opdateret. Point beregnes i Supabase.`);
  } catch(err) {
    status(`Kunne ikke hente historik: ${err.message}`,true);
  } finally { $('refresh-history').disabled=false; }
}
async function openHistory() {
  visible('unlock-history',false);
  visible('history-content',true);
  await refreshHistory();
}
async function init() {
  try {
    const cfg = await import('./config.js');
    if (!cfg.SUPABASE_URL?.startsWith('https://') || !cfg.SUPABASE_PUBLISHABLE_KEY) {
      throw new Error('Supabase mangler opsætning i assets/js/config.js');
    }
    const {createClient} = await import('https://esm.sh/@supabase/supabase-js@2');
    supabase = createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
    });
    const {data,error} = await supabase.auth.getSession();
    if (error) throw error;
    let session = data.session;
    if (session && session.user?.is_anonymous === false) {
      const {error:logoutError} = await supabase.auth.signOut();
      if (logoutError) throw logoutError;
      session = null;
    }
    if (!session) {
      const {data:anon,error:anonError} = await supabase.auth.signInAnonymously();
      if (anonError) throw anonError;
      session = anon.session;
    }
    if (!session) throw new Error('Kunne ikke oprette anonym session');
    const {data:expires,error:accessError} = await supabase.rpc('registration_access_until');
    if (accessError) throw accessError;
    if (expires && new Date(expires) > new Date()) await openHistory();
    else {
      status('Indtast den fælles kode for at se historikken.');
      visible('unlock-history',true);
    }
  } catch(err) {
    status(`Supabase-fejl: ${err.message}. Kontrollér config.js, at anonyme logins er aktiveret, og at 05_scoring_history.sql er kørt.`,true);
  }
}
$('history-password-form').addEventListener('submit',async e=>{
  e.preventDefault();
  $('history-unlock').disabled=true;
  $('history-password-error').textContent='Kontrollerer adgangskode ...';
  try {
    const {data,error}=await supabase.rpc('unlock_registration',{
      p_password:$('history-password').value
    });
    $('history-password').value='';
    if (error) throw error;
    if (!data) throw new Error('Forkert kode eller for mange forsøg');
    $('history-password-error').textContent='';
    await openHistory();
  } catch(err) { $('history-password-error').textContent=err.message; }
  finally { $('history-unlock').disabled=false; }
});
$('refresh-history').addEventListener('click',refreshHistory);
$('include-guests').addEventListener('change',refreshHistory);
// Only redraw after explicit "Vis spil" for date changes.
init();
