import {formatPoints} from './scoring.js';
import {sortGroups,readSelection,saveIncludeGuests,readIncludeGuests,selectionParams,renderNoteFilters} from './notes.js?v=1.0.4';

const $ = id => document.getElementById(id);
const REGULAR = ['David','Gustav','Johan','Samuel','Sofus','William'];
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
  // Routine loading/success information stays invisible; errors remain readable.
  const el = $('history-status');
  el.textContent = isError ? text : '';
  visible('history-status', isError);
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
    .map(p => String(p.solo_result || '').startsWith('Vundet') ? '✓' : '×')
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
  const head = $('history-head'); head.replaceChildren();
  const header = document.createElement('tr');
  const columns = ['Melding','🏆','Melder','Makker',...names];
  columns.forEach((label,index) => {
    const th = cell(label,'th');
    if (index >= 4) th.classList.add('payout-heading');
    if (index === 1) th.title = 'Resultat';
    header.append(th);
  });
  head.append(header);
  const body = $('history-body'); body.replaceChildren();
  for (const game of games) {
    const tr = document.createElement('tr');
    const participants = game.participants ?? [];
    const byName = new Map(participants.map(p => [p.name,p]));
    // Match the result symbols to the exact caller order shown in Melder.
    // Both names and solo results use one line per caller, even when several
    // players announce a solo in the same hand.
    const callerNames = String(game.callers ?? '').split(', ').filter(Boolean);
    const result = cell(SOLO.has(game.call_type) ? '' : gameResult(game));
    if (SOLO.has(game.call_type)) {
      result.classList.add('solo-result');
      const callerByName = new Map(participants.filter(p => p.is_caller).map(p => [p.name,p]));
      result.setAttribute('aria-label', callerNames
        .map(name => `${name}: ${String(callerByName.get(name)?.solo_result || '').startsWith('Vundet') ? 'vundet' : 'tabt'}`)
        .join(', '));
      for (const name of callerNames) {
        const line = document.createElement('span');
        line.className = 'history-solo-outcome';
        line.textContent = String(callerByName.get(name)?.solo_result || '').startsWith('Vundet') ? '✓' : '×';
        result.append(line);
      }
    }
    // PostgreSQL joins callers by seat; this same order drives the result.
    const callersCell = cell('');
    callersCell.classList.add('history-callers');
    for (const name of callerNames) {
      const line = document.createElement('span');
      line.className = 'history-caller-name';
      line.textContent = name;
      callersCell.append(line);
    }
    tr.append(cell(gameLabel(game)), result, callersCell,
      cell(game.partners));
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
  renderNoteFilters($('note-options'),groups,selectedNotes,refreshHistory);
}
async function fetchPage(reset = false) {
  if (!supabase) return;
  if (fetching) return;
  fetching = true;
  const myGeneration = generation;
  $('load-more-history').disabled = true;
  try {
    status('Henter spil og beregner point ...');
    const {data,error} = await supabase.rpc('get_game_history_for_notes',{
      ...selectionParams(selectedNotes),
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
  selectedNotes = readSelection(groups);
  $('include-guests').checked = readIncludeGuests();
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
      .select('id,name,created_at');
    if (groupsError) throw new Error(`Kunne ikke læse spilsamlinger: ${groupsError.message}. Kør 06_tournament_notes.sql.`);
    groups = sortGroups(categories ?? []);
    await openHistory();
  } catch(err) {
    status(`Supabase-fejl: ${err.message}. Kontrollér opsætning og SQL-migrationerne.`,true);
  }
}
$('load-more-history').addEventListener('click',() => fetchPage(false));
$('include-guests').addEventListener('change',()=>{
  saveIncludeGuests($('include-guests').checked);
  refreshHistory();
});
init();
