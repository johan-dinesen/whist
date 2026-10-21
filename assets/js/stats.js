import {formatPoints} from './scoring.js';
import {profileUrl} from './profiles.js';
import {sortGroups,readSelection,readIncludeGuests,saveIncludeGuests,selectionParams,renderNoteFilters} from './notes.js';
import {normalizeStandings} from './ranking-model.js';
import {METRICS, normalizeMeldingStatistics, displayMetric, metricDetail} from './stat-metrics.js';

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
  // Show up to six equal-width players in the visible chart area on every device.
  // Additional players occupy the same width and can be reached by scrolling.
  root.style.width = rows.length > 6 ? `${(rows.length / 6 * 100).toFixed(4)}%` : '100%';
  root.style.minWidth = '0';
  document.querySelector('.rank-chart-scroll-tip').classList.toggle('has-overflow', rows.length > 6);
  document.querySelector('.rank-bar-scroll').scrollLeft = 0;
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
    name.title = player.name;
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
// Independent module: table definitions live in stat-metrics.js, so more
// statistics can be added without changing the podium or chart renderers.
function renderMetricDefinitions() {
  const terms=$('metric-definitions');
  terms.replaceChildren();
  for(const metric of METRICS){
    const dt=document.createElement('dt');dt.textContent=metric.label;
    const dd=document.createElement('dd');dd.textContent=metric.help;
    terms.append(dt,dd);
  }
}
function renderMeldingStatistics(raw) {
  const people=normalizeMeldingStatistics(raw);
  const state=$('metrics-state');
  const content=$('metrics-content');
  const head=$('metric-head');
  const body=$('metric-body');
  const legacy=$('metrics-legacy-note');
  content.classList.toggle('hidden', people.length===0);
  state.classList.toggle('hidden', people.length!==0);
  if(!people.length){
    state.textContent='Ingen spil i de valgte spilsamlinger.';
    head.replaceChildren();body.replaceChildren();
    return;
  }
  const nameHeading=document.createElement('th');
  nameHeading.scope='col'; nameHeading.textContent='Spiller';
  head.replaceChildren(nameHeading);
  for(const metric of METRICS){
    const th=document.createElement('th');
    th.scope='col'; th.textContent=metric.short;
    th.title=metric.help;
    th.setAttribute('aria-label',metric.label + '. '+metric.help);
    head.append(th);
  }
  body.replaceChildren();
  for(const player of people){
    const tr=document.createElement('tr');
    const personCell=document.createElement('th');
    personCell.scope='row'; personCell.className='metric-player';
    const info=document.createElement('span');info.className='metric-player-info';
    const name=document.createElement('strong');name.textContent=player.name;
    const games=document.createElement('small');games.textContent=`${player.games} spil`;
    info.append(name,games);
    personCell.append(avatar(player,'metric-player-avatar'),info);
    tr.append(personCell);
    for(const metric of METRICS){
      const td=document.createElement('td');
      td.textContent=displayMetric(metric,player);
      td.title=`${metric.label}: ${metricDetail(metric,player)}. ${metric.help}`;
      td.setAttribute('aria-label',td.title);
      if(metric.type==='percentage' && player[metric.valueKey]!==null) td.classList.add('metric-percent');
      if(metric.key==='pointsPerHand'){
        const v=player.avgPointsPerHand;
        td.classList.add(v>0?'gain':v<0?'loss':'');
      }
      tr.append(td);
    }
    body.append(tr);
  }
  const unknown=people.reduce((total,p)=>total+p.unknown,0);
  legacy.classList.toggle('hidden',unknown===0);
  if(unknown)legacy.textContent=`${unknown} historiske solo-sejre er kun gemt som “Vundet” uden stikantal. De tæller som meldinger, men ikke som under-/præcismeldinger eller i stikafvigelsen.`;
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
  // Discard old results as soon as the selection changes.
  standings=[];
  $('standings-empty').textContent='Indlæser stilling …';
  $('standings-empty').classList.remove('hidden');
  $('podium-view').classList.add('hidden');
  $('chart-view').classList.add('hidden');
  $('stats-view-toggle').classList.add('hidden');
  $('metrics-state').textContent='Indlæser statistik …';
  $('metrics-state').classList.remove('hidden');
  $('metrics-content').classList.add('hidden');
  const params={
    ...selectionParams(selectedNotes),
    p_include_guests:$('stats-include-guests').checked
  };
  // Read the two independent modules in parallel. A problem in one should
  // not prevent the other from loading.
  const settled=await Promise.allSettled([
    supabase.rpc('get_standings_for_notes',params),
    supabase.rpc('get_melding_statistics_for_notes',params)
  ]);
  if(request!==activeRequest)return;
  const errors=[];
  const [rankingResult, metricResult]=settled;
  if(rankingResult.status==='fulfilled' && !rankingResult.value.error){
    try{renderRankings(rankingResult.value.data??[]);}
    catch(err){errors.push(`Stilling: ${err.message}`);$('standings-empty').textContent='Stillingen kunne ikke indlæses.';}
  }else{
    const error=rankingResult.status==='rejected'?rankingResult.reason:rankingResult.value.error;
    errors.push(`Stilling: ${error.message||String(error)}`);
    $('standings-empty').textContent='Stillingen kunne ikke indlæses.';
  }
  if(metricResult.status==='fulfilled' && !metricResult.value.error){
    try{renderMeldingStatistics(metricResult.value.data??[]);}
    catch(err){errors.push(`Meldingsstatistik: ${err.message}`);$('metrics-state').textContent='Statistikken kunne ikke indlæses.';}
  }else{
    const error=metricResult.status==='rejected'?metricResult.reason:metricResult.value.error;
    errors.push(`Meldingsstatistik: ${error.message||String(error)}`);
    $('metrics-state').textContent='Statistikken kunne ikke indlæses.';
  }
  if(errors.length)showError(`Kunne ikke hente data: ${errors.join(' | ')}`);
  $('stats-refresh').disabled=false;
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
renderMetricDefinitions();
$('stats-refresh').addEventListener('click',refresh);
$('stats-include-guests').addEventListener('change',()=>{
  saveIncludeGuests($('stats-include-guests').checked);
  refresh();
});
for(const button of document.querySelectorAll('[data-stats-view]')){
  button.addEventListener('click',()=>changeView(button.dataset.statsView));
}
init();
