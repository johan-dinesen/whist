import {formatPoints} from './scoring.js';
import {profileUrl} from './profiles.js';
import {sortGroups,readSelection,readIncludeGuests,saveIncludeGuests,selectionParams,renderNoteFilters} from './notes.js';
import {normalizeStandings} from './ranking-model.js';
import {METRICS, normalizeMeldingStatistics, displayMetric, metricDetail, playerAverages, displayAverage, displayDifference, metricValue} from './stat-metrics.js?v=0.2.10';
import {normalizeSynergy,formatSynergyPoints,synergyTint} from './synergy-model.js';
import {buildScoreHistory} from './score-history-model.js?v=0.2.13';
import {standingsAtGame} from './time-machine-model.js?v=0.2.13';
import {drawScoreHistory} from './score-history-chart.js';
import {normalizeHandsResponse,formatHandAverage} from './hands-model.js?v=0.2.11';

const $ = id => document.getElementById(id);

// Keep the three pinned Hænder columns aligned at any viewport width.
function syncHandsStickyOffsets() {
  const headers = $('hands-head')?.querySelectorAll('.hands-header-top > th');
  if (!headers || headers.length < 3) return;
  const firstWidth = headers[0].getBoundingClientRect().width;
  const secondWidth = headers[1].getBoundingClientRect().width;
  if (!firstWidth || !secondWidth) return;
  const scroll = $('hands-content');
  scroll.style.setProperty('--hands-count-left', `${firstWidth}px`);
  scroll.style.setProperty('--hands-average-left', `${firstWidth + secondWidth}px`);
}

const profileCacheVersion = String(Date.now());
let supabase = null;
let groups = [];
let selectedNotes = new Set();
let standings = [];
let activeRequest = 0;
let view = 'podium';
let historyChart = null;
let historyModel = null;
let timeMachineIndex = 0;
let timeMachineTimer = null;
let metricPeople = [];
let metricMode = 'values';

function showError(message) {
  const node = $('stats-status');
  node.textContent = message || '';
  node.classList.toggle('hidden', !message);
}
function signed(value) {
  const n = Number(value);
  return formatPoints(n);
}
// One fetch/decode per profile per page. Keep the decoded resource available
// when another statistics view needs a new avatar element. Missing photos are
// remembered too, so repeated redraws do not repeatedly request 404 URLs.
const photoCache = new Map();
function profileImage(player) {
  const url = profileUrl(supabase, player.id, profileCacheVersion);
  let entry = photoCache.get(url);
  if (entry) return entry;
  const source = new Image();
  entry = {source, status: 'loading', waiting: new Set()};
  photoCache.set(url, entry);
  source.onload = async () => {
    // Wait for decoding before revealing any cloned image. An already-loaded
    // image must not briefly fall back to an initial during a redraw.
    try { await source.decode(); } catch (_) { /* decode() is optional on some browsers */ }
    entry.status = source.naturalWidth ? 'ready' : 'missing';
    if (entry.status === 'ready') {
      for (const figure of entry.waiting) showProfileImage(figure, entry);
    }
    entry.waiting.clear();
  };
  source.onerror = () => {
    entry.status = 'missing';
    entry.waiting.clear();
  };
  source.src = url;
  return entry;
}
function showProfileImage(figure, entry) {
  if (figure.classList.contains('has-photo')) return;
  const img = entry.source.cloneNode(false);
  img.alt = '';
  img.loading = 'eager';
  img.decoding = 'sync';
  figure.append(img);
  figure.classList.add('has-photo');
}
function avatar(player, size = '') {
  const figure = document.createElement('span');
  figure.className = `rank-avatar ${size}`.trim();
  const initials = document.createElement('span');
  initials.className = 'rank-initials';
  initials.textContent = player.name.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  figure.append(initials);
  const entry = profileImage(player);
  if (entry.status === 'ready') showProfileImage(figure, entry);
  else if (entry.status === 'loading') entry.waiting.add(figure);
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
  root.style.setProperty('--rank-count', String(rows.length));
  // Six players fit at once. Extra players can still be scrolled horizontally.
  root.style.width = rows.length > 6 ? `${(rows.length / 6 * 100).toFixed(4)}%` : '100%';
  root.style.minWidth = '0';
  document.querySelector('.rank-chart-scroll-tip').classList.toggle('has-overflow', rows.length > 6);
  const maxAbs = Math.max(0.01, ...rows.map(p => Math.abs(p.points)));
  let zero = root.querySelector('.rank-zero-line');
  if (!zero) {
    zero = document.createElement('div');
    zero.className = 'rank-zero-line';
    zero.setAttribute('aria-hidden', 'true');
    root.prepend(zero);
  }

  // FLIP animation: capture each player's CURRENT visual position before a
  // ranking change. This includes their position partway through a previous
  // animation, allowing smooth playback when games advance very quickly.
  const motionAllowed = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isVisible = motionAllowed && root.getBoundingClientRect().width > 0;
  const previousLeft = new Map();
  const currentColumns = [...root.querySelectorAll('.rank-bar-column')];
  if (isVisible) {
    for (const column of currentColumns) {
      previousLeft.set(column.dataset.playerId, column.getBoundingClientRect().left);
    }
  }
  // Cancel position animations only, without interfering with CSS transitions
  // of the bar heights or score labels inside each column.
  for (const column of currentColumns) column.getAnimations().forEach(animation => animation.cancel());

  // Keep the same photo elements throughout Tidsmaskinen. Each direction has
  // its own permanent bar, so crossing zero animates through zero rather than
  // abruptly jumping from a positive bar to a negative bar.
  const existing = new Map(currentColumns.map(column => [column.dataset.playerId, column]));
  const ordered = [];
  for (const [i, player] of rows.entries()) {
    const key = String(player.id);
    let column = existing.get(key);
    if (column) existing.delete(key);
    else {
      column = document.createElement('div');
      column.className = 'rank-bar-column';
      column.dataset.playerId = key;
      const gainBar = document.createElement('div');
      gainBar.className = 'rank-bar rank-bar-positive';
      const lossBar = document.createElement('div');
      lossBar.className = 'rank-bar rank-bar-negative';
      const amount = document.createElement('strong');
      amount.className = 'rank-bar-value zero';
      const photo = avatar(player, 'rank-avatar-chart');
      photo.classList.add('rank-bar-avatar');
      const foot = document.createElement('div');
      foot.className = 'rank-bar-footer';
      const name = document.createElement('strong');
      const games = document.createElement('small');
      foot.append(name, games);
      column.append(gainBar, lossBar, amount, photo, foot);
    }
    const positive = player.points > 0;
    const negative = player.points < 0;
    const height = `${(35 * Math.abs(player.points) / maxAbs).toFixed(3)}%`;
    const gainBar = column.querySelector('.rank-bar-positive');
    const lossBar = column.querySelector('.rank-bar-negative');
    const amount = column.querySelector('.rank-bar-value');
    const foot = column.querySelector('.rank-bar-footer');
    gainBar.style.setProperty('--bar-height', positive ? height : '0%');
    lossBar.style.setProperty('--bar-height', negative ? height : '0%');
    amount.className = `rank-bar-value ${positive ? 'positive' : negative ? 'negative' : 'zero'}`;
    amount.style.setProperty('--bar-height', height);
    amount.textContent = signed(player.points);
    foot.querySelector('strong').textContent = player.name;
    foot.querySelector('strong').title = player.name;
    foot.querySelector('small').textContent = `${player.games} spil`;
    column.setAttribute('aria-label', `${i+1}. ${player.name}, ${signed(player.points)} point, ${player.games} spil`);
    ordered.push(column);
  }
  for (const stale of existing.values()) stale.remove();
  for (const [index, column] of ordered.entries()) {
    const atPosition = root.children[index + 1]; // Zero line is child 0.
    if (atPosition !== column) root.insertBefore(column, atPosition || null);
  }

  // Use a short transform animation rather than trying to transition CSS grid
  // order (grid order itself cannot be animated). No images are recreated.
  if (isVisible) {
    for (const column of ordered) {
      const oldLeft = previousLeft.get(column.dataset.playerId);
      if (oldLeft === undefined) continue; // New player, no old position.
      const delta = oldLeft - column.getBoundingClientRect().left;
      if (Math.abs(delta) < 0.5) continue;
      column.animate(
        [{transform: `translateX(${delta}px)`}, {transform: 'translateX(0px)'}],
        {duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)'}
      );
    }
  }
}
// The slider changes only Pointdiagram. Podie and Stillingshistorik always
// show their usual standings, and every frame uses the filtered game order.
function stopTimeMachine() {
  if (timeMachineTimer !== null) {
    clearInterval(timeMachineTimer);
    timeMachineTimer = null;
  }
  $('time-machine-play').textContent = 'Afspil';
  $('time-machine-play').setAttribute('aria-pressed', 'false');
}
function updateTimeMachineAvailability(message = '') {
  const ready = Boolean(historyModel?.gameCount && historyModel.players.length);
  $('time-machine-slider').disabled = !ready;
  $('time-machine-play').disabled = !ready;
  $('time-machine-latest').disabled = !ready || timeMachineIndex === historyModel.gameCount;
  $('time-machine-slider').max = String(ready ? historyModel.gameCount : 0);
  if (!ready) {
    $('time-machine-slider').value = '0';
    $('time-machine-progress').textContent = 'Spil 0 af 0';
    $('time-machine-caption').textContent = message || 'Indlæser spilhistorik …';
  }
}
function selectTimeMachineGame(index) {
  if (!historyModel?.gameCount) return;
  timeMachineIndex = Math.max(0, Math.min(historyModel.gameCount, Math.round(Number(index))));
  $('time-machine-slider').value = String(timeMachineIndex);
  $('time-machine-progress').textContent = `Spil ${timeMachineIndex} af ${historyModel.gameCount}`;
  $('time-machine-caption').textContent = timeMachineIndex === 0
    ? 'Før første spil' : timeMachineIndex === historyModel.gameCount
      ? 'Aktuel stilling' : `Stilling efter spil ${timeMachineIndex}`;
  $('time-machine-latest').disabled = timeMachineIndex === historyModel.gameCount;
  if (view === 'chart' && standings.length) {
    drawBarChart(standingsAtGame(historyModel, timeMachineIndex));
  }
}
function playTimeMachine() {
  if (!historyModel?.gameCount) return;
  if (timeMachineTimer !== null) {stopTimeMachine();return;}
  if (timeMachineIndex >= historyModel.gameCount) selectTimeMachineGame(0);
  $('time-machine-play').textContent = 'Pause';
  $('time-machine-play').setAttribute('aria-pressed', 'true');
  const step = Math.max(1, Math.ceil(historyModel.gameCount / 160));
  timeMachineTimer = setInterval(() => {
    if (view !== 'chart' || !historyModel?.gameCount) {stopTimeMachine();return;}
    selectTimeMachineGame(Math.min(historyModel.gameCount, timeMachineIndex + step));
    if (timeMachineIndex >= historyModel.gameCount) stopTimeMachine();
  }, 110);
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
  $('score-history-view').classList.toggle('hidden',empty||view!=='history');
  if(empty)return;
  renderPodium(standings);
  if (historyModel?.gameCount) selectTimeMachineGame(timeMachineIndex);
  else drawBarChart(standings);
  if(view==='history')requestAnimationFrame(mountHistoryChart);
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
function updateMetricModeButton() {
  const button=$('metric-mode-toggle');
  button.disabled = metricPeople.length === 0;
  button.setAttribute('aria-pressed', String(metricMode === 'difference'));
  button.textContent = metricMode === 'difference' ? 'Vis værdier' : 'Vis afvigelse';
}
// Switching values/relative deviation updates the existing numeric cells only.
// The player headings (and their loaded profile pictures) never get rebuilt.
function updateMetricValues() {
  const people = metricPeople;
  const means = playerAverages(people);
  const relative = metricMode === 'difference';
  updateMetricModeButton();
  const rows = $('metric-body').rows;
  for (const [metricIndex, metric] of METRICS.entries()) {
    const tr = rows[metricIndex];
    if (!tr) continue;
    for (const [playerIndex, player] of people.entries()) {
      const td = tr.cells[playerIndex + 2];
      if (!td) continue;
      td.textContent = relative
        ? displayDifference(metric, player, means)
        : displayMetric(metric, player);
      const detail = metricDetail(metric, player);
      td.title = relative
        ? `${player.name}, ${metric.label}: ${detail}. ${td.textContent} i forhold til spillergennemsnittet ${displayAverage(metric, means)}. ${metric.help}`
        : `${player.name}, ${metric.label}: ${detail}. ${metric.help}`;
      td.setAttribute('aria-label', td.title);
      td.classList.toggle('metric-percent', metric.type === 'percentage' && metricValue(metric, player) !== null && !relative);
      const value = metricValue(metric, player);
      const avg = means[metric.key];
      td.classList.toggle('metric-relative', relative && value !== null && avg !== null && Math.abs(avg) >= 1e-12 && Math.abs(value - avg) > 1e-9);
      td.classList.toggle('gain', !relative && metric.key === 'pointsPerHand' && player.avgPointsPerHand > 0);
      td.classList.toggle('loss', !relative && metric.key === 'pointsPerHand' && player.avgPointsPerHand < 0);
    }
  }
}
function renderMetricTable() {
  const people = metricPeople;
  const head = $('metric-head');
  const body = $('metric-body');
  const means = playerAverages(people);

  // Players form the columns. A new metric is therefore just another row.
  const metricHeading = document.createElement('th');
  metricHeading.scope = 'col';
  metricHeading.className = 'metric-heading';
  metricHeading.textContent = 'Statistik';
  const avgHeading = document.createElement('th');
  avgHeading.scope = 'col';
  avgHeading.className = 'metric-average-column';
  const avgTitle = document.createElement('span');
  avgTitle.className = 'metric-header-name';
  avgTitle.textContent = 'Gennemsnit';
  const avgSub = document.createElement('small');
  avgSub.textContent = `${people.length} spillere`;
  avgHeading.append(avgTitle, avgSub);
  head.replaceChildren(metricHeading, avgHeading);

  for (const player of people) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.className = 'metric-player-heading';
    const identity = document.createElement('span');
    identity.className = 'metric-column-player';
    const name = document.createElement('strong');
    name.textContent = player.name;
    const games = document.createElement('small');
    games.textContent = `${player.games} spil`;
    identity.append(avatar(player, 'metric-player-avatar'), name, games);
    th.append(identity);
    head.append(th);
  }

  body.replaceChildren();
  if (!people.length) { updateMetricModeButton(); return; }
  for (const metric of METRICS) {
    const tr = document.createElement('tr');
    const title = document.createElement('th');
    title.scope = 'row';
    title.className = 'metric-row-label';
    title.textContent = metric.label;
    title.title = metric.help;
    tr.append(title);

    const mean = document.createElement('td');
    mean.className = 'metric-average-column';
    mean.textContent = displayAverage(metric, means);
    mean.title = `${metric.label}: gennemsnit af spillernes individuelle værdier`;
    tr.append(mean);
    for (const player of people) tr.append(document.createElement('td'));
    body.append(tr);
  }
  updateMetricValues();
}
function renderMeldingStatistics(raw) {
  metricPeople=normalizeMeldingStatistics(raw);
  const state=$('metrics-state');
  const content=$('metrics-content');
  content.classList.toggle('hidden', metricPeople.length===0);
  state.classList.toggle('hidden', metricPeople.length!==0);
  if(!metricPeople.length)state.textContent='Ingen spil i de valgte spilsamlinger.';
  renderMetricTable();
}
function renderSynergy(raw) {
  const {players,matrix,maxAbs,partnershipGames} = normalizeSynergy(raw);
  const state = $('synergy-state');
  const content = $('synergy-content');
  const head = $('synergy-head');
  const body = $('synergy-body');
  const table = $('synergy-table');
  const count = $('synergy-count');
  content.classList.toggle('hidden',players.length===0);
  state.classList.toggle('hidden',players.length!==0);
  count.textContent = players.length
    ? `${players.length} spillere · ${partnershipGames} makkerspil`
    : '';
  table.style.setProperty('--synergy-columns',String(players.length + 1));
  table.classList.toggle('is-compact',players.length <= 6);
  table.classList.toggle('is-wide',players.length > 6);
  head.replaceChildren();
  body.replaceChildren();
  if (!players.length) {
    state.textContent='Ingen spil i de valgte spilsamlinger.';
    return;
  }
  const corner = document.createElement('th');
  corner.scope='col';
  corner.className='synergy-corner';
  corner.title='Spillere i rækker og kolonner';
  corner.textContent='↔';
  head.append(corner);
  for (const player of players) {
    const th=document.createElement('th');
    th.scope='col';
    th.textContent=player.name;
    th.title=player.name;
    head.append(th);
  }
  for (const [i,player] of players.entries()) {
    const tr=document.createElement('tr');
    const name=document.createElement('th');
    name.scope='row';
    name.textContent=player.name;
    name.title=player.name;
    tr.append(name);
    for (const [j,partner] of players.entries()) {
      const value=matrix[i][j];
      const td=document.createElement('td');
      td.className='synergy-data';
      if (i===j) td.classList.add('synergy-diagonal');
      if (!value.games) td.classList.add('synergy-empty');
      if (value.games) {
        td.style.backgroundColor=synergyTint(value.average,maxAbs);
      }
      const avg=document.createElement('strong');
      avg.className='synergy-average';
      avg.textContent=formatSynergyPoints(value.average);
      const sample=document.createElement('small');
      sample.className='synergy-sample';
      sample.textContent=`${value.games} spil`;
      const description=`${player.name} / ${partner.name}: ${value.games ? formatSynergyPoints(value.average)+' point i gennemsnit, ' : ''}${value.games} spil${i===j?', egen makker':''}`;
      td.title=description;
      td.setAttribute('aria-label',description);
      td.append(avg,sample);
      tr.append(td);
    }
    body.append(tr);
  }
}
// Hænder is independent from standings, Synergi and Meldingsstatistik.
// Calls (rather than participants) are the observation unit. This matters
// for Sol, where several people can call in the same physical game.
function renderHands(raw) {
  const {players, hands} = normalizeHandsResponse(raw);
  const state = $('hands-state');
  const content = $('hands-content');
  const head = $('hands-head');
  const body = $('hands-body');
  head.replaceChildren();
  body.replaceChildren();
  content.classList.toggle('hidden', hands.length === 0);
  state.classList.toggle('hidden', hands.length !== 0);
  $('hands-count').textContent = hands.length ? `${hands.length} meldingstyper · ${players.length} spillere` : '';
  if (!hands.length) {
    state.textContent = 'Ingen meldinger i de valgte spilsamlinger.';
    return;
  }

  const first = document.createElement('tr');
  first.className = 'hands-header-top';
  const fixedTitles = [['Melding', 'hands-hand'],['Antal', 'hands-total'],['Gns.', 'hands-total']];
  for (const [label, classname] of fixedTitles) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.rowSpan = 2;
    th.className = classname;
    th.textContent = label;
    first.append(th);
  }
  const second = document.createElement('tr');
  second.className = 'hands-header-sub';
  for (const player of players) {
    const th = document.createElement('th');
    th.scope = 'colgroup';
    th.colSpan = 2;
    th.className = 'hands-player-group';
    th.textContent = player.name;
    first.append(th);
    for (const [name, className] of [['Antal', 'hands-player-start'], ['Gns./%', '']]) {
      const sub = document.createElement('th');
      sub.scope = 'col';
      sub.className = className;
      sub.textContent = name;
      second.append(sub);
    }
  }
  head.append(first, second);

  for (const hand of hands) {
    const tr = document.createElement('tr');
    const label = document.createElement('th');
    label.scope = 'row';
    label.className = 'hands-hand';
    label.textContent = hand.label === 'Bordlægger' ? 'Bord' :
      hand.label === 'Ren Bordlægger' ? 'Ren Bord' : hand.label;
    tr.append(label);
    for (const text of [String(hand.count), formatHandAverage(hand.average, hand.isSolo, hand.count)]) {
      const td = document.createElement('td');
      td.className = 'hands-total';
      td.textContent = text;
      tr.append(td);
    }
    for (const [index, p] of hand.byPlayer.entries()) {
      const count = document.createElement('td');
      count.className = 'hands-player-start';
      count.textContent = p.count ? String(p.count) : '—';
      const mean = document.createElement('td');
      mean.textContent = formatHandAverage(p.average, hand.isSolo, p.count);
      mean.title = `${players[index].name}, ${hand.label}: ${p.count} meldinger${p.count ? `, ${mean.textContent} i gennemsnit` : ''}`;
      tr.append(count, mean);
    }
    body.append(tr);
  }
  // Read measured column widths after table layout rather than assuming fixed
  // widths; the measured offsets remain accurate on different devices.
  requestAnimationFrame(syncHandsStickyOffsets);
}

window.addEventListener('resize', syncHandsStickyOffsets);

// Chart.js must be constructed only after its parent tab is visible;
// otherwise it can measure a zero-width canvas on mobile.
function mountHistoryChart() {
  if(view !== 'history' || !standings.length || !historyModel?.gameCount ||
     $('score-history-view').classList.contains('hidden')) return;
  try {
    if(!historyChart){
      historyChart=drawScoreHistory({
        canvas:$('score-history-canvas'),
        legend:$('score-history-legend'),
        model:historyModel
      });
    } else {
      historyChart.resize();
    }
  } catch(err) {
    $('score-history-content').classList.add('hidden');
    $('score-history-state').textContent='Stillingshistorik kunne ikke indlæses.';
    $('score-history-state').classList.remove('hidden');
    showError(`Stillingshistorik: ${err.message}`);
  }
}
function renderScoreHistory(raw) {
  historyModel=buildScoreHistory(raw);
  timeMachineIndex = historyModel.gameCount;
  updateTimeMachineAvailability();
  if (historyModel.gameCount) selectTimeMachineGame(timeMachineIndex);
  else updateTimeMachineAvailability('Ingen spil i de valgte spilsamlinger.');
  const ready=historyModel.gameCount > 0 && historyModel.players.length > 0;
  const state=$('score-history-state');
  $('score-history-content').classList.toggle('hidden',!ready);
  state.classList.toggle('hidden',ready);
  if(!ready)state.textContent='Ingen spil i de valgte spilsamlinger.';
  if(ready && view==='history')requestAnimationFrame(mountHistoryChart);
}
function changeView(next) {
  if(!['podium','chart','history'].includes(next))return;
  if (view === 'chart' && next !== 'chart') stopTimeMachine();
  view=next;
  for(const button of document.querySelectorAll('[data-stats-view]')){
    button.setAttribute('aria-pressed',String(button.dataset.statsView===view));
  }
  $('podium-view').classList.toggle('hidden',view!=='podium'||!standings.length);
  $('chart-view').classList.toggle('hidden',view!=='chart'||!standings.length);
  $('score-history-view').classList.toggle('hidden',view!=='history'||!standings.length);
  if(view==='history')requestAnimationFrame(mountHistoryChart);
  if(view==='chart' && historyModel?.gameCount && standings.length) selectTimeMachineGame(timeMachineIndex);
}
async function refresh() {
  if(!supabase)return;
  const request=++activeRequest;
  stopTimeMachine();
  timeMachineIndex = 0;
  historyModel = null;
  updateTimeMachineAvailability();
  $('stats-refresh').disabled=true;
  showError('');
  // Discard old results as soon as the selection changes.
  standings=[];
  $('standings-empty').textContent='Indlæser stilling …';
  $('standings-empty').classList.remove('hidden');
  $('podium-view').classList.add('hidden');
  $('chart-view').classList.add('hidden');
  $('score-history-view').classList.add('hidden');
  $('stats-view-toggle').classList.add('hidden');
  metricPeople=[];
  updateMetricModeButton();
  $('metrics-state').textContent='Indlæser statistik …';
  $('metrics-state').classList.remove('hidden');
  $('metrics-content').classList.add('hidden');
  $('synergy-state').textContent='Indlæser synergi …';
  $('synergy-state').classList.remove('hidden');
  $('synergy-content').classList.add('hidden');
  $('synergy-count').textContent='';
  $('hands-state').textContent='Indlæser hænder …';
  $('hands-state').classList.remove('hidden');
  $('hands-content').classList.add('hidden');
  $('hands-count').textContent='';
  historyChart?.destroy();
  historyChart=null;
  historyModel=null;
  $('score-history-state').textContent='Indlæser stillingshistorik …';
  $('score-history-state').classList.remove('hidden');
  $('score-history-content').classList.add('hidden');
  const params={
    ...selectionParams(selectedNotes),
    p_include_guests:$('stats-include-guests').checked
  };
  // Load modules independently. An error in one must not hide the others.
  const settled=await Promise.allSettled([
    supabase.rpc('get_standings_for_notes',params),
    supabase.rpc('get_melding_statistics_for_notes',params),
    supabase.rpc('get_synergy_for_notes',params),
    supabase.rpc('get_standings_history_for_notes',params),
    supabase.rpc('get_hands_statistics_for_notes',params)
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
  const synergyResult=settled[2];
  if(synergyResult.status==='fulfilled' && !synergyResult.value.error){
    try{renderSynergy(synergyResult.value.data??[]);}
    catch(err){errors.push(`Synergi: ${err.message}`);$('synergy-state').textContent='Synergi kunne ikke indlæses.';}
  }else{
    const error=synergyResult.status==='rejected'?synergyResult.reason:synergyResult.value.error;
    errors.push(`Synergi: ${error.message||String(error)}`);
    $('synergy-state').textContent='Synergi kunne ikke indlæses.';
  }
  const graphResult=settled[3];
  if(graphResult.status==='fulfilled' && !graphResult.value.error){
    try{renderScoreHistory(graphResult.value.data);}
    catch(err){
      errors.push(`Stillingshistorik: ${err.message}`);
      $('score-history-state').textContent='Stillingshistorik kunne ikke indlæses.';
      $('score-history-state').classList.remove('hidden');
      $('score-history-content').classList.add('hidden');
      historyModel=null;
      updateTimeMachineAvailability('Tidsmaskinen kunne ikke indlæses.');
    }
  }else{
    const error=graphResult.status==='rejected'?graphResult.reason:graphResult.value.error;
    errors.push(`Stillingshistorik: ${error.message||String(error)}`);
    $('score-history-state').textContent='Stillingshistorik kunne ikke indlæses.';
    updateTimeMachineAvailability('Tidsmaskinen kunne ikke indlæses.');
  }
  const handsResult = settled[4];
  if (handsResult.status === 'fulfilled' && !handsResult.value.error) {
    try { renderHands(handsResult.value.data); }
    catch(err) {
      errors.push(`Hænder: ${err.message}`);
      $('hands-state').textContent = 'Hænder kunne ikke indlæses.';
    }
  } else {
    const err = handsResult.status === 'rejected' ? handsResult.reason : handsResult.value.error;
    errors.push(`Hænder: ${err?.message || String(err)}`);
    $('hands-state').textContent = 'Hænder kunne ikke indlæses.';
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
updateMetricModeButton();
$('metric-mode-toggle').addEventListener('click',()=>{
  if(!metricPeople.length)return;
  metricMode = metricMode==='values'?'difference':'values';
  updateMetricValues();
});
$('time-machine-slider').addEventListener('input', event => {
  stopTimeMachine();
  selectTimeMachineGame(Number(event.target.value));
});
$('time-machine-play').addEventListener('click', playTimeMachine);
$('time-machine-latest').addEventListener('click', () => {
  stopTimeMachine();
  if (historyModel?.gameCount) selectTimeMachineGame(historyModel.gameCount);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopTimeMachine();
});
$('stats-refresh').addEventListener('click',refresh);
$('stats-include-guests').addEventListener('change',()=>{
  saveIncludeGuests($('stats-include-guests').checked);
  refresh();
});
for(const button of document.querySelectorAll('[data-stats-view]')){
  button.addEventListener('click',()=>changeView(button.dataset.statsView));
}
init();
