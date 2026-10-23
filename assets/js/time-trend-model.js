import {METRICS} from './stat-metrics.js';

const collator = new Intl.Collator('da', {numeric: true, sensitivity: 'base'});

export const TREND_RANGE_START = 10 * 60;
export const TREND_RANGE_END = 27 * 60;
export const TREND_WINDOW_MINUTES = 60;
export const TREND_STEP_MINUTES = 15;

const ORDINARY_CALLS = new Set(['almindelig', 'gode', 'halve', 'vip']);
const METRIC_INDEX = new Map(METRICS.map(metric => [metric.key, metric]));

function parseClockMinute(value) {
  const date = new Date(value);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const minute = date.getHours() * 60 + date.getMinutes();
  return minute < 180 ? minute + 1440 : minute;
}

export function formatClockMinute(totalMinutes) {
  const safe = Math.round(Number(totalMinutes));
  const dayMinute = ((safe % 1440) + 1440) % 1440;
  const hours = Math.floor(dayMinute / 60);
  const minutes = dayMinute % 60;
  return `${String(hours).padStart(2, '0')}.${String(minutes).padStart(2, '0')}`;
}

function classifyOutcome(callType, score, soloResult) {
  if (ORDINARY_CALLS.has(callType)) {
    if (score > 0) return 'under';
    if (score < 0) return 'over';
    if (score === 0) return 'exact';
    return 'unknown';
  }
  if (callType === 'ren_sol' || callType === 'ren_bordlaegger') {
    return /^vundet/i.test(soloResult || '') ? 'exact' : 'over';
  }
  if (callType === 'sol' || callType === 'bordlaegger') {
    const value = String(soloResult || '');
    if (/^Vundet \(0/i.test(value)) return 'exact';
    if (/^Vundet \(1/i.test(value)) return 'under';
    if (/^Vundet/i.test(value)) return 'unknown';
    return 'over';
  }
  return 'unknown';
}

function deviationValue(callType, score, soloResult) {
  if (ORDINARY_CALLS.has(callType)) {
    return Number.isFinite(score) ? score : null;
  }
  if ((callType === 'ren_sol' || callType === 'ren_bordlaegger') && /^vundet/i.test(soloResult || '')) {
    return 0;
  }
  if ((callType === 'sol' || callType === 'bordlaegger') && /^Vundet \(0/i.test(soloResult || '')) {
    return 0;
  }
  if ((callType === 'sol' || callType === 'bordlaegger') && /^Vundet \(1/i.test(soloResult || '')) {
    return 1;
  }
  return null;
}

function summarizeMetric(metricKey, observations) {
  const games = observations.length;
  const calls = observations.reduce((sum, observation) => sum + observation.calls, 0);
  const under = observations.reduce((sum, observation) => sum + observation.under, 0);
  const over = observations.reduce((sum, observation) => sum + observation.over, 0);
  const exact = observations.reduce((sum, observation) => sum + observation.exact, 0);
  const deviations = observations.map(observation => observation.deviation).filter(value => value !== null);
  const totalPayout = observations.reduce((sum, observation) => sum + observation.payout, 0);

  switch (metricKey) {
    case 'calls':
      return games ? {value: 100 * calls / games, numerator: calls, denominator: games, sampleText: `${calls} af ${games} spil`} : null;
    case 'under':
      return calls ? {value: 100 * under / calls, numerator: under, denominator: calls, sampleText: `${under} af ${calls} meldinger`} : null;
    case 'over':
      return calls ? {value: 100 * over / calls, numerator: over, denominator: calls, sampleText: `${over} af ${calls} meldinger`} : null;
    case 'exact':
      return calls ? {value: 100 * exact / calls, numerator: exact, denominator: calls, sampleText: `${exact} af ${calls} meldinger`} : null;
    case 'deviation':
      return deviations.length
        ? {value: deviations.reduce((sum, value) => sum + value, 0) / deviations.length, denominator: deviations.length, sampleText: `${deviations.length} meldinger`}
        : null;
    case 'absoluteDeviation':
      return deviations.length
        ? {value: deviations.reduce((sum, value) => sum + Math.abs(value), 0) / deviations.length, denominator: deviations.length, sampleText: `${deviations.length} meldinger`}
        : null;
    case 'pointsPerHand':
      return games ? {value: totalPayout / games, denominator: games, sampleText: `${games} spil`} : null;
    default:
      return null;
  }
}

export function buildTimeTrendModel(rows) {
  const playersById = new Map();
  const observationsByPlayer = new Map();
  let minMinute = null;
  let maxMinute = null;

  for (const row of rows ?? []) {
    const clockMinute = parseClockMinute(row?.played_at);
    if (clockMinute === null || clockMinute < TREND_RANGE_START || clockMinute > TREND_RANGE_END) continue;
    const callType = String(row?.call_type || '');
    const score = row?.score == null ? null : Number(row.score);
    const participants = Array.isArray(row?.participants) ? row.participants : [];
    if (participants.length !== 4) continue;

    minMinute = minMinute === null ? clockMinute : Math.min(minMinute, clockMinute);
    maxMinute = maxMinute === null ? clockMinute : Math.max(maxMinute, clockMinute);

    for (const participant of participants) {
      const id = String(participant?.player_id || '');
      const name = String(participant?.name || '').trim();
      if (!id || !name) continue;
      if (!playersById.has(id)) {
        const player = {id, name};
        playersById.set(id, player);
        observationsByPlayer.set(id, []);
      }
      const isCaller = Boolean(participant?.is_caller);
      const outcome = isCaller ? classifyOutcome(callType, score, participant?.solo_result) : null;
      const deviation = isCaller ? deviationValue(callType, score, participant?.solo_result) : null;
      observationsByPlayer.get(id).push({
        clockMinute,
        calls: isCaller ? 1 : 0,
        under: outcome === 'under' ? 1 : 0,
        over: outcome === 'over' ? 1 : 0,
        exact: outcome === 'exact' ? 1 : 0,
        deviation,
        payout: Number(participant?.payout) || 0
      });
    }
  }

  const players = [...playersById.values()].sort((a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id));
  for (const player of players) {
    observationsByPlayer.get(player.id).sort((a, b) => a.clockMinute - b.clockMinute);
  }

  return {players, observationsByPlayer, minMinute, maxMinute};
}

export function buildTrendSeries(model, metricKey) {
  if (!METRIC_INDEX.has(metricKey)) throw new Error('Ukendt trend-måling');
  if (!model?.players?.length || model.minMinute === null || model.maxMinute === null) {
    return {metric: METRIC_INDEX.get(metricKey), players: [], start: null, end: null};
  }

  const start = Math.max(TREND_RANGE_START, Math.floor(model.minMinute / TREND_STEP_MINUTES) * TREND_STEP_MINUTES);
  const end = Math.min(TREND_RANGE_END, Math.ceil(model.maxMinute / TREND_STEP_MINUTES) * TREND_STEP_MINUTES);
  const times = [];
  for (let minute = start; minute <= end; minute += TREND_STEP_MINUTES) times.push(minute);

  return {
    metric: METRIC_INDEX.get(metricKey),
    start,
    end,
    players: model.players.map(player => {
      const observations = model.observationsByPlayer.get(player.id) ?? [];
      const overall = summarizeMetric(metricKey, observations);
      const points = times.map(endMinute => {
        const windowStart = endMinute - TREND_WINDOW_MINUTES;
        const windowObservations = observations.filter(observation => observation.clockMinute > windowStart && observation.clockMinute <= endMinute);
        const summary = summarizeMetric(metricKey, windowObservations);
        return {
          x: endMinute,
          y: summary ? Number(summary.value) : null,
          playerId: player.id,
          playerName: player.name,
          metricKey,
          summary,
          overall,
          timeLabel: formatClockMinute(endMinute),
          windowLabel: `${formatClockMinute(Math.max(TREND_RANGE_START, endMinute - TREND_WINDOW_MINUTES))}–${formatClockMinute(endMinute)}`
        };
      });
      return {id: player.id, name: player.name, overall, points};
    })
  };
}
