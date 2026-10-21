import {formatPoints} from './scoring.js';
import {profileUrl} from './profiles.js';
import {sortGroups,readSelection,readIncludeGuests,saveIncludeGuests,selectionParams,renderNoteFilters} from './notes.js';
import {normalizeStandings} from './ranking-model.js';

const $ = id => document.getElementById(id);
const profileCacheVersion = String(Date.now());
let supabase = null;
let groups = [];
let selectedNotes = new Set();
let standings = [];
let activeRequest = 0;
let view = 'podium';

function showError(message) {
  const node = $('stats-status');
  node.textContent = message || '';
  node.classList.toggle('hidden', !message);
}
function signed(value) {
  const n = Number(value);
  return formatPoints(n);
}
function avatar(player, size = '') {
  const figure = document.createElement('span');
  figure.className = `rank-avatar ${size}`.trim();
  const initials = document.createElement('span');
  initials.className = 'rank-initials';
  initials.textContent = player.name.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  figure.append(initials);
  const img = document.createElement('img');
  img.alt = '';
  // Eager loading is required: the initial CSS hides the image until onload.
  // Lazy-loaded, display:none images can otherwise remain unfetched indefinitely.
  img.loading = 'eager';
  img.decoding = 'async';
  // Stored photos have a stable UUID-based filename. Missing photos show initials.
  img.onload = () => figure.classList.add('has-photo');
  img.onerror = () => figure.classList.remove('has-photo');
  img.src = profileUrl(supabase, player.id, profileCacheVersion);
  figure.append(img);
  return figure;
}
function playerScore(parent, p) {
  const score = document.createElement('strong');
  score.className = `rank-score ${p.points > 0 ? 'gain' : p.points < 0 ? 'loss' : ''}`;
  score.textContent = `${signed(p.points)} point`;
  parent.append(score);
}
function renderPodium(rows) {
  const podium = $('stats-podium');
  const lower = $('stats-lower');
  podium.replaceChildren(); lower.replaceChildren();
  const top = rows.slice(0,3);
  for (const [index, player] of top.entries()) {
    const place = document.createElement('article');
    place.className = `podium-place position-${index+1}`;
    place.setAttribute('aria-label',`${index+1}. plads: ${player.name}, ${signed(player.points)} point`);
    place.append(avatar(player,'rank-avatar-podium'));
    const stand = document.createElement('div'); stand.className = 'podium-stand';
    const name = document.createElement('strong'); name.className='podium-name'; name.textContent=player.name;
    const score = document.createElement('strong'); score.className='podium-score'; score.textContent=signed(player.points);
    const games = document.createElement('span');games.className='podium-games';games.textContent=`${player.games} spil`;
    stand.append(name,score,games);place.append(stand);podium.append(place);
  }
  for (const [offset,player] of rows.slice(3).entries()) {
    const item=document.createElement('article'); item.className='ranking-item';
    const position=document.createElement('span');position.className='ranking-position';position.textContent=String(offset+4);
    const info=document.createElement('span'); info.className='ranking-person';
    const text=document.createElement('span'); text.className='ranking-person-text';
    const name=document.createElement('strong');name.textContent=player.name;
    const games=document.createElement('small');games.textContent=`${player.games} spil`;
    text.append(name,games);info.append(avatar(player),text);
    item.append(position,info);playerScore(item,player);lower.append(item);
  }
}
// Signed point chart: one horizontal zero baseline, common scale for all players.
// Positive values rise above zero; negative values descend beneath it.
function drawBarChart(rows) {
  const root = $('rank-bar-chart');
  root.replaceChildren();
  root.style.setProperty('--rank-count', String(rows.length));
  root.style.minWidth = `${Math.max(0, rows.length * 88)}px`;
  const maxAbs = Math.max(0.01, ...rows.map(p => Math.abs(p.points)));
  const zero = document.createElement('div');
  zero.className = 'rank-zero-line';
  zero.setAttribute('aria-hidden', 'true');
  root.append(zero);
  rows.forEach((player, i) => {
    const column = document.createElement('div');
    column.className = 'rank-bar-column';
    const positive = player.points > 0;
    const negative = player.points < 0;
    const height = 35 * Math.abs(player.points) / maxAbs;
    const bar = document.createElement('div');
    bar.className = `rank-bar ${positive ? 'rank-bar-positive' : negative ? 'rank-bar-negative' : 'rank-bar-zero'}`;
    bar.style.setProperty('--bar-height', `${height.toFixed(3)}%`);
    const amount = document.createElement('strong');
    amount.className = `rank-bar-value ${positive ? 'positive' : negative ? 'negative' : 'zero'}`;
    amount.style.setProperty('--bar-height', `${height.toFixed(3)}%`);
    amount.textContent = signed(player.points);
    const photo = avatar(player, 'rank-avatar-chart');
    photo.classList.add('rank-bar-avatar');
    const foot = document.createElement('div');
    foot.className = 'rank-bar-footer';
    const name = document.createElement('strong');
    name.textContent = player.name;
    const games = document.createElement('small');
    games.textContent = `${player.games} spil`;
    foot.append(name, games);
    column.setAttribute('aria-label', `${i+1}. ${player.name}, ${signed(player.points)} point, ${player.games} spil`);
    column.append(bar, amount, photo, foot);
    root.append(column);
  });
}
function renderRankings(rows) {
  standings=normalizeStandings(rows);
  $('standings-count').textContent=standings.length ? `${standings.length} spillere` : '';
  const empty=standings.length===0;
  $('standings-empty').classList.toggle('hidden',!empty);
  if (empty) $('standings-empty').textContent = 'Ingen spil i de valgte spilsamlinger.';
  $('stats-view-toggle').classList.toggle('hidden',empty);
  $('podium-view').classList.toggle('hidden',empty||view!=='podium');
  $('chart-view').classList.toggle('hidden',empty||view!=='chart');
  if(empty)return;
  renderPodium(standings);
  drawBarChart(standings);
}
function changeView(next) {
  view=next;
  for(const button of document.querySelectorAll('[data-stats-view]')){
    button.setAttribute('aria-pressed',String(button.dataset.statsView===view));
  }
  $('podium-view').classList.toggle('hidden',view!=='podium'||!standings.length);
  $('chart-view').classList.toggle('hidden',view!=='chart'||!standings.length);
}
async function refresh() {
  if(!supabase)return;
  const request=++activeRequest;
  $('stats-refresh').disabled=true;
  showError('');
  // Never display a ranking for old filters while a new selection loads.
  standings=[];
  $('standings-empty').textContent='Indlæser stilling …';
  $('standings-empty').classList.remove('hidden');
  $('podium-view').classList.add('hidden');
  $('chart-view').classList.add('hidden');
  $('stats-view-toggle').classList.add('hidden');
  try{
    const {data,error}=await supabase.rpc('get_standings_for_notes',{
      ...selectionParams(selectedNotes),
      p_include_guests:$('stats-include-guests').checked
    });
    if(request!==activeRequest)return;
    if(error)throw error;
    renderRankings(data??[]);
  }catch(err){if(request===activeRequest){
    $('standings-empty').textContent='Stillingen kunne ikke indlæses.';
    showError(`Kunne ikke hente stillingen: ${err.message}`);
  }}
  finally{if(request===activeRequest)$('stats-refresh').disabled=false;}
}
async function init(){
  try{
    const cfg=await import('./config.js');
    if(!cfg.SUPABASE_URL?.startsWith('https://')||!cfg.SUPABASE_PUBLISHABLE_KEY)
      throw new Error('Supabase mangler opsætning i assets/js/config.js');
    const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
    supabase=createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY,
      {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    const {data,error}=await supabase.auth.getSession();if(error)throw error;
    let session=data.session;
    if(session && session.user?.is_anonymous===false){
      const {error:signOutError}=await supabase.auth.signOut();if(signOutError)throw signOutError;session=null;
    }
    if(!session){const {data:anon,error:anonError}=await supabase.auth.signInAnonymously();if(anonError)throw anonError;session=anon.session;}
    if(!session)throw new Error('Kunne ikke oprette anonym læsesession');
    const {data:categories,error:groupsError}=await supabase.from('tournaments').select('id,name,created_at');
    if(groupsError)throw groupsError;
    groups=sortGroups(categories??[]);
    selectedNotes=readSelection(groups);
    $('stats-include-guests').checked=readIncludeGuests();
    renderNoteFilters($('stats-note-options'),groups,selectedNotes,refresh);
    await refresh();
  }catch(err){showError(`Statistik kunne ikke åbnes: ${err.message}`);}
}
$('stats-refresh').addEventListener('click',refresh);
$('stats-include-guests').addEventListener('change',()=>{
  saveIncludeGuests($('stats-include-guests').checked);
  refresh();
});
for(const button of document.querySelectorAll('[data-stats-view]')){
  button.addEventListener('click',()=>changeView(button.dataset.statsView));
}
init();
