// Model for Efter klokkeslæt. Pure calculations; no browser or Supabase access.
// Server sends per-player/per-hour COUNTS AND SUMS, so both the hourly curve
// and the player's dashed overall reference use correctly weighted averages.
export const HOURLY_METRICS = Object.freeze([
  {key:'points', label:'Point/spil', unit:'point/spil'},
  {key:'calls', label:'Meldinger %', unit:'%'},
  {key:'exact', label:'Præcis melding %', unit:'%'},
  {key:'absolute', label:'Absolut stikafvigelse', unit:'stik'},
  {key:'solo', label:'Solomeldinger %', unit:'%'}
]);

const numeric = (value, field) => {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Ugyldigt ${field}`);
  return n;
};
const count = (value, field) => {
  const n = numeric(value, field);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`Ugyldigt antal ${field}`);
  return n;
};
const empty = () => ({games:0, points:0, calls:0, exact_calls:0,
  ordinary_calls:0, ordinary_abs_sum:0, solo_calls:0});
const keys = Object.keys(empty());

export function normalizeHourlyResponse(raw) {
  if (!raw || !Array.isArray(raw.players) || !Array.isArray(raw.hours))
    throw new Error('Uventet klokkeslætsdata');
  const players = raw.players.map(p => ({id:String(p.id), name:String(p.name)}))
    .sort((a,b) => a.name.localeCompare(b.name,'da',{sensitivity:'base'}) || a.id.localeCompare(b.id));
  const byId = new Map(players.map(p => [p.id,{player:p, byHour:new Map(), total:empty()}]));
  for (const row of raw.hours) {
    const id = String(row.player_id);
    const item = byId.get(id);
    if (!item) throw new Error('Ukendt spiller i klokkeslætsdata');
    const hour = count(row.hour,'time');
    if (hour < 10 || hour > 26) throw new Error('Klokkeslæt uden for 10–03');
    if (item.byHour.has(hour)) throw new Error('Dobbelt time for spiller');
    const values = {};
    for (const key of keys) values[key] = key === 'points' || key === 'ordinary_abs_sum'
      ? numeric(row[key],key) : count(row[key],key);
    if (values.games===0 || values.calls>values.games ||
        values.exact_calls>values.calls || values.solo_calls>values.calls ||
        values.ordinary_calls>values.calls || values.ordinary_abs_sum<0)
      throw new Error('Ugyldige tællinger for klokkeslæt');
    item.byHour.set(hour,values);
    for (const key of keys) item.total[key] += values[key];
  }
  const observed = raw.hours.map(row=>Number(row.hour));
  const first = observed.length ? Math.min(...observed) : null;
  const last = observed.length ? Math.max(...observed) : null;
  const hours = first===null ? [] : Array.from({length:last-first+1},(_,i)=>first+i);
  return {players:players.map(p=>byId.get(p.id)),hours};
}

export function metricObservation(counts, key) {
  if (!counts) return {value:null, samples:0};
  let denominator=0, numerator=0, factor=1;
  switch(key) {
    case 'points': denominator=counts.games; numerator=counts.points; break;
    case 'calls': denominator=counts.games; numerator=counts.calls; factor=100; break;
    case 'exact': denominator=counts.calls; numerator=counts.exact_calls; factor=100; break;
    case 'absolute': denominator=counts.ordinary_calls; numerator=counts.ordinary_abs_sum; break;
    case 'solo': denominator=counts.games; numerator=counts.solo_calls; factor=100; break;
    default: throw new Error(`Ukendt statistik: ${key}`);
  }
  return {value:denominator ? factor*numerator/denominator : null, samples:denominator};
}

export const hourLabel = hour => `${String(hour % 24).padStart(2,'0')}:00`;
export const formatHourlyValue = (number,key) => number == null ? '—' :
  `${number.toLocaleString('da-DK',{minimumFractionDigits:2,maximumFractionDigits:2})}${['calls','exact','solo'].includes(key)?' %':''}`;
