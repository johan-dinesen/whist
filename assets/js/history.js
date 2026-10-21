import {formatPoints} from './scoring.js';

const $ = id => document.getElementById(id);
const REGULAR = ['David','Gustav','Johan','Samuel','Sofus','William'];
const GROUP_ORDER = ['Slettestrand 2023','Hals 2024','Helsinki 2024','Hals 2025','Klitmøller 2026'];
const LABELS = {
  almindelig:'Alm',gode:'Gode',halve:'Halve',vip:'Vip',
  sol:'Sol',ren_sol:'Ren Sol',bordlaegger:'Bordlægger',ren_bordlaegger:'Ren Bordlægger'
};
const TRUMPS = {hearts:'♥',clubs:'♣',diamonds:'♦',spades:'♠',no_trump:'NT'};
const SOLO = new Set(['sol','ren_sol','bordlaegger','ren_bordlaegger']);
const PAGE_SIZE = 250;
let supabase = null;
let groups = [];
let selectedNotes = new Set(); // Empty = all categories, including Kredsspil.
let lastGames = [];
let allLoaded = false;
let fetching = false;
let generation = 0;

function visible(id, yes) { $(id).classList.toggle('hidden', !yes); }
function status(text, isError = false) {
  $('history-status').textContent = text;
  $('history-status').classList.toggle('notice-warning', isError);
  $('history-status').style.borderColor = isError ? '' : 'var(--edge)';
  $('history-status').style.background = isError ? '' : 'var(--surface)';
  $('history-status').style.color = isError ? '' : 'var(--muted)';
}
function cell(text, element = 'td') { const el = document.createElement(element); el.textContent = text ?? ''; return el; }
function gameLabel(game) {
  let str = SOLO.has(game.call_type) ? LABELS[game.call_type] : `${game.tricks}${LABELS[game.call_type]}`;
  if (!SOLO.has(game.call_type)) str += `${TRUMPS[game.trump] ?? ''}`;
  if (game.call_type === 'vip') str += ` ×${game.vip_depth}`;
  return str;
}
function gameResult(game) {
  if (!SOLO.has(game.call_type)) return game.score > 0 ? `+${game.score}` : String(game.score);
  return (game.participants ?? [])
    .filter(p => p.is_caller)
    .map(p => String(p.solo_result || '').startsWith('Vundet') ? '✅' : '❌')
    .join('');
}
function groupName(game) {
  return game.tournament_id
    ? (groups.find(g => g.id === game.tournament_id)?.name ?? 'Ukendt turnering')
    : 'Kredsspil';
}
function drawTable(games) {
  const allParticipants = games.flatMap(g => g.participants ?? []);
  const otherRegulars = [...new Set(allParticipants.filter(p => !p.is_guest).map(p => p.name))]
    .filter(n => !REGULAR.includes(n)).sort((a,b) => a.localeCompare(b,'da'));
  const guests = $('include-guests').checked
    ? [...new Set(allParticipants.filter(p => p.is_guest).map(p => p.name))]
      .sort((a,b) => a.localeCompare(b,'da'))
    : [];
  const names = [...REGULAR, ...otherRegulars, ...guests];
  // With a single note selected, displaying its name in every row is redundant.
  const showNoteColumn = selectedNotes.size !== 1;
  const head = $('history-head'); head.replaceChildren();
  const header = document.createElement('tr');
  const columns = ['Melding','Res.','Melder','Makker',...(showNoteColumn ? ['Note'] : []),...names];
  columns.forEach((label,index) => {
    const th = cell(label,'th');
    if (index >= (showNoteColumn ? 5 : 4)) th.classList.add('payout-heading');
    if (label === 'Res.') th.title = 'Resultat';
    header.append(th);
  });
  head.append(header);
  const body = $('history-body'); body.replaceChildren();
  for (const game of games) {
    const tr = document.createElement('tr');
    const participants = game.participants ?? [];
    const byName = new Map(participants.map(p => [p.name,p]));
    tr.append(cell(gameLabel(game)), cell(gameResult(game)), cell(game.callers),
      cell(game.partners));
    if (showNoteColumn) tr.append(cell(groupName(game)));
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
  $('history-count').textContent = games.length
    ? `${games.length} spil${allLoaded ? ' i alt' : ' indlæst'}`
    : 'Ingen spil i de valgte spilsamlinger.';
}
function noteLabel(key) {
  return key === 'kredsspil' ? 'Kredsspil' : groups.find(g => g.id === key)?.name ?? key;
}
function drawNotes() {
  const root = $('note-options'); root.replaceChildren();
  const available = [{key:'all',name:'Alle'},
    ...groups.map(g => ({key:g.id,name:g.name})),
    {key:'kredsspil',name:'Kredsspil'}];
  for (const {key,name} of available) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'note-chip';
    button.textContent = name;
    button.setAttribute('aria-pressed',String(key === 'all' ? selectedNotes.size === 0 : selectedNotes.has(key)));
    button.addEventListener('click', () => {
      if (key === 'all') selectedNotes.clear();
      else if (selectedNotes.has(key)) selectedNotes.delete(key);
      else selectedNotes.add(key);
      drawNotes();
      refreshHistory();
    });
    root.append(button);
  }
}
function selectionParams() {
  // NULL in the RPC means everything; [] explicitly means no named tournaments.
  return selectedNotes.size === 0
    ? {p_tournament_ids:null,p_include_kredsspil:true}
    : {p_tournament_ids:[...selectedNotes].filter(x => x !== 'kredsspil'),
       p_include_kredsspil:selectedNotes.has('kredsspil')};
}
async function fetchPage(reset = false) {
  if (!supabase) return;
  if (fetching) return;
  fetching = true;
  const myGeneration = generation;
  $('refresh-history').disabled = true;
  $('load-more-history').disabled = true;
  try {
    status('Henter spil og beregner point ...');
    const {data,error} = await supabase.rpc('get_game_history_for_notes',{
      ...selectionParams(),
      p_include_guests:$('include-guests').checked,
      p_max_games:PAGE_SIZE,
      p_offset:reset ? 0 : lastGames.length
    });
    if (myGeneration !== generation) return;
    if (error) throw error;
    const incoming = data ?? [];
    lastGames = reset ? incoming : [...lastGames,...incoming];
    allLoaded = incoming.length < PAGE_SIZE;
    drawTable(lastGames);
    visible('load-more-history',!allLoaded);
    status('Historikken er opdateret. Point beregnes i Supabase.');
  } catch(err) {
    if (myGeneration === generation) status(`Kunne ikke hente historik: ${err.message}`,true);
  } finally {
    fetching = false;
    $('refresh-history').disabled = false;
    $('load-more-history').disabled = false;
  }
}
// A filter change invalidates any in-flight request and starts with a fresh page.
async function refreshHistory() {
  generation += 1;
  lastGames = [];
  allLoaded = false;
  visible('load-more-history',false);
  $('history-body').replaceChildren();
  // Queued requests are not executed concurrently; re-check when the active one finishes.
  if (fetching) {
    const intendedGeneration = generation;
    const wait = () => {
      if (!fetching && generation === intendedGeneration) fetchPage(true);
      else if (fetching && generation === intendedGeneration) setTimeout(wait,50);
    };
    setTimeout(wait,50);
  } else await fetchPage(true);
}
async function openHistory() {
  visible('unlock-history',false);
  visible('history-content',true);
  drawNotes();
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
    const {data:categories,error:groupsError} = await supabase.from('tournaments')
      .select('id,name,is_active');
    if (groupsError) throw new Error(`Kunne ikke læse spilsamlinger: ${groupsError.message}. Kør 06_tournament_notes.sql.`);
    groups = (categories ?? []).sort((a,b) => {
      const ia = GROUP_ORDER.indexOf(a.name), ib = GROUP_ORDER.indexOf(b.name);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.name.localeCompare(b.name,'da');
    });
    const {data:expires,error:accessError} = await supabase.rpc('registration_access_until');
    if (accessError) throw accessError;
    if (expires && new Date(expires) > new Date()) await openHistory();
    else {
      status('Indtast den fælles kode for at se historikken.');
      visible('unlock-history',true);
    }
  } catch(err) {
    status(`Supabase-fejl: ${err.message}. Kontrollér opsætning og SQL-migrationerne.`,true);
  }
}
$('history-password-form').addEventListener('submit',async e => {
  e.preventDefault();
  if (!supabase) return;
  $('history-unlock').disabled = true;
  $('history-password-error').textContent = 'Kontrollerer adgangskode ...';
  try {
    const {data,error} = await supabase.rpc('unlock_registration',{
      p_password:$('history-password').value
    });
    $('history-password').value = '';
    if (error) throw error;
    if (!data) throw new Error('Forkert kode eller for mange forsøg');
    $('history-password-error').textContent = '';
    await openHistory();
  } catch(err) { $('history-password-error').textContent = err.message; }
  finally { $('history-unlock').disabled = false; }
});
$('refresh-history').addEventListener('click',refreshHistory);
$('load-more-history').addEventListener('click',() => fetchPage(false));
$('include-guests').addEventListener('change',refreshHistory);
init();
