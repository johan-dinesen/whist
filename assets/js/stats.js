import {formatPoints} from './scoring.js';
import {profileUrl} from './profiles.js';
import {sortGroups,readSelection,readIncludeGuests,saveIncludeGuests,selectionParams,renderNoteFilters} from './notes.js';
import {normalizeStandings,pointShares} from './ranking-model.js';

const $ = id => document.getElementById(id);
const profileCacheVersion = String(Date.now());
const gainColors = ['#78b6d7','#d7a667','#8eae91','#c492a9','#9995cb','#94c6b6',
  '#d6b98a','#8aa4c4','#bc9983','#8dbece','#c5a4c9','#a9c083'];
const lossColors = ['#be7582','#b88d68','#a48bbf','#c9a77e','#cb8d8d','#999cad'];
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
  img.loading = 'lazy';
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
    const rank = document.createElement('span'); rank.className='podium-number'; rank.textContent = String(index+1);
    const name = document.createElement('strong'); name.className='podium-name'; name.textContent=player.name;
    const score = document.createElement('strong'); score.className='podium-score'; score.textContent=signed(player.points);
    const games = document.createElement('span');games.className='podium-games';games.textContent=`${player.games} spil`;
    stand.append(rank,name,score,games);place.append(stand);podium.append(place);
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
function chartSliceStyle(items, total, palette) {
  if (!total) return 'conic-gradient(#344556 0% 100%)';
  let progress = 0;
  const slices=[];
  items.forEach((p,i) => {
    const start=progress;
    progress += p.share * 100;
    slices.push(`${palette[i % palette.length]} ${start.toFixed(5)}% ${progress.toFixed(5)}%`);
  });
  return `conic-gradient(${slices.join(',')})`;
}
function drawDonut(targetId, sign, label) {
  const root=$(targetId);root.replaceChildren();
  const items=pointShares(standings,sign);
  const total=items.reduce((n,x)=>n+x.magnitude,0);
  const palette=sign==='positive'?gainColors:lossColors;
  const heading=document.createElement('h3');heading.textContent=label;
  const donut=document.createElement('div');donut.className='rank-donut';
  donut.style.background=chartSliceStyle(items,total,palette);
  donut.setAttribute('role','img');
  donut.setAttribute('aria-label',`${label}: ${items.map(p=>`${p.name} ${Math.round(100*p.share)} procent`).join(', ') || 'Ingen'}`);
  const hole=document.createElement('span');hole.className='rank-donut-hole';
  const amount=document.createElement('strong');amount.textContent=signed(sign==='negative'?-total:total);
  const unit=document.createElement('small');unit.textContent='point i alt';
  hole.append(amount,unit);donut.append(hole);
  const legend=document.createElement('div');legend.className='rank-donut-legend';
  if(!items.length){const msg=document.createElement('p');msg.className='muted';msg.textContent='Ingen point i denne kategori.';legend.append(msg);}
  items.forEach((p,i)=>{
    const row=document.createElement('div');row.className='rank-legend-row';
    const marker=document.createElement('span');marker.className='rank-legend-marker';marker.style.backgroundColor=palette[i % palette.length];
    const name=document.createElement('span');name.textContent=p.name;
    const number=document.createElement('strong');number.textContent=`${(p.share*100).toLocaleString('da-DK',{maximumFractionDigits:1})}%`;
    const value=document.createElement('small');value.textContent=signed(sign==='negative'?-p.magnitude:p.magnitude);
    row.append(marker,name,number,value);legend.append(row);
  });
  root.append(heading,donut,legend);
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
  drawDonut('positive-donut','positive','Positive nettogevinster');
  drawDonut('negative-donut','negative','Negative nettotab');
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
