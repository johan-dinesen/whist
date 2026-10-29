// Data model for independent Meldingsstatistik module.
// All values use the same selected games / guest filtering as Stilling.
export const METRICS = [
  {
    key:'calls', label:'Meldinger', short:'Meldinger',
    help:'Andel af spillede hænder, hvor spilleren selv meldte.',
    valueKey:'callsPct', type:'percentage', fraction:'hands'
  },
  {
    key:'under', label:'Undermelding', short:'Under',
    help:'Andel af (Almindelig, Gode, Halve og Vip), hvor spilleren fik flere stik end meldt.',
    valueKey:'underPct', countKey:'under', type:'percentage'
  },
  {
    key:'over', label:'Overmelding', short:'Over',
    help:'Andel af (Almindelig, Gode, Halve og Vip), hvor spilleren fik færre stik end meldt.',
    valueKey:'overPct', countKey:'over', type:'percentage'
  },
  {
    key:'exact', label:'Præcis melding', short:'Præcis',
    help:'Andel af (Almindelig, Gode, Halve og Vip), hvor spilleren fik præcis det meldte antal stik.',
    valueKey:'exactPct', countKey:'exact', type:'percentage'
  },
  {
    key:'deviation', label:'Stikafvigelse', short:'Stikafv.',
    help:'Gennemsnitligt resultat (med fortegn) på egne meldinger af (Almindelig, Gode, Halve og Vip).',
    valueKey:'avgDeviation', type:'deviation'
  },
  {
    key:'absoluteDeviation', label:'Absolut stikafvigelse', short:'|Stikafv.|',
    help:'Gennemsnittet af den absolutte resultatværdi på egne meldinger af (Almindelig, Gode, Halve og Vip).',
    valueKey:'avgAbsoluteDeviation', type:'deviation'
  },
  {
    key:'pointsPerHand', label:'Point pr. hånd', short:'Point/spil',
    help:'Spillerens nettopoint divideret med alle vedkommendes spil, uanset om spilleren meldte.',
    valueKey:'avgPointsPerHand', type:'points'
  }
];

const numeric = (value, fallback=0) => value == null ? fallback : Number(value);
const naturalNumber = (value, field) => {
  const n=numeric(value);
  if(!Number.isInteger(n) || n<0)throw new Error(`Ugyldigt antal for ${field}`);
  return n;
};
const optionalNumber = (value, field) => {
  if(value==null)return null;
  const n=Number(value);
  if(!Number.isFinite(n))throw new Error(`Ugyldig værdi for ${field}`);
  return n;
};

export function normalizeMeldingStatistics(data) {
  return (data ?? []).map(r => {
    const p={
      id:String(r.player_id),name:String(r.player_name),guest:Boolean(r.is_guest),
      games:naturalNumber(r.games_played,'spil'),
      points:optionalNumber(r.net_points,'nettopoint'),
      calls:naturalNumber(r.calls_made,'meldinger'),
      under:naturalNumber(r.under_calls,'undermeldinger'),
      over:naturalNumber(r.over_calls,'overmeldinger'),
      exact:naturalNumber(r.exact_calls,'præcise meldinger'),
      unknown:naturalNumber(r.unclassified_calls,'øvrige og uklassificerede meldinger'),
      underPct:optionalNumber(r.under_pct,'under-%'),
      overPct:optionalNumber(r.over_pct,'over-%'),
      exactPct:optionalNumber(r.exact_pct,'præcis-%'),
      avgDeviation:optionalNumber(r.avg_deviation,'stikafvigelse'),
      avgAbsoluteDeviation:optionalNumber(r.avg_abs_deviation,'absolut stikafvigelse'),
      deviationSamples:naturalNumber(r.deviation_observations,'kendte afvigelser'),
      avgPointsPerHand:optionalNumber(r.avg_points_per_hand,'point pr. spil')
    };
    if(!p.id || !p.name || p.games<1 || p.points===null ||
       p.under+p.over+p.exact+p.unknown!==p.calls ||
       p.calls>p.games || p.deviationSamples>p.calls ||
       p.deviationSamples!==p.under+p.over+p.exact){
      throw new Error('Supabase returnerede ufuldstændige statistikdata.');
    }
    // All call types count toward Meldinger %, but Under/Over/Præcis are
    // mutually exclusive ordinary calls with a known score.
    p.ordinaryCalls=p.under+p.over+p.exact;
    p.callsPct=100*p.calls/p.games;
    return p;
  }).sort((a,b)=> a.name.localeCompare(b.name,'da',{sensitivity:'base'}) || a.id.localeCompare(b.id));
}

export function metricValue(metric, player) {
  const value=player[metric.valueKey];
  return value==null ? null : Number(value);
}

// Each eligible player has one vote in the mean, independent of hand count.
// For a statistic with no defined value (e.g. Under for 0 calls), only
// players with a defined value are included in that statistic's denominator.
export function playerAverages(people) {
  const means={};
  for(const metric of METRICS){
    const observations=people.map(p=>metricValue(metric,p)).filter(v=>v!==null && Number.isFinite(v));
    means[metric.key]=observations.length
      ? observations.reduce((sum,v)=>sum+v,0)/observations.length
      : null;
  }
  return means;
}

export function formatNumber(value, precision) {
  const safeValue=Math.abs(Number(value)) < Math.pow(10,-precision)/2 ? 0 : Number(value);
  return safeValue.toLocaleString('da-DK', {
    minimumFractionDigits:precision,maximumFractionDigits:precision
  });
}

export function displayMetric(metric, player) {
  const val=metricValue(metric,player);
  if(val===null)return '—';
  if(metric.type==='percentage')return `${formatNumber(val,1)} %`;
  if(metric.type==='deviation' || metric.type==='points')return formatNumber(val,2);
  return String(val);
}

export function displayAverage(metric, means) {
  const value=means[metric.key];
  if(value===null)return '—';
  // Independent 1-decimal rounding can otherwise display 99,9 % or 100,1 %.
  // The underlying player percentages, and thus their means, total 100 %.
  if(metric.key==='exact' && means.under!==null && means.over!==null){
    const under=Math.round((means.under+Number.EPSILON)*10)/10;
    const over=Math.round((means.over+Number.EPSILON)*10)/10;
    return `${formatNumber(100-under-over,1)} %`;
  }
  return metric.type==='percentage' ? `${formatNumber(value,1)} %` : formatNumber(value,2);
}

// Relative deviation as requested: |player value - player average| / average * 100.
// A zero average has no defined relative deviation, so render an em dash.
// For a negative average this signed-denominator formula gives negative percentages.
export function displayDifference(metric, player, means) {
  const val=metricValue(metric,player);
  const avg=means[metric.key];
  if(val===null || avg===null || !Number.isFinite(avg) || Math.abs(avg)<1e-12)return '—';
  const relative=100*Math.abs(val-avg)/avg;
  if(!Number.isFinite(relative))return '—';
  return `${formatNumber(relative,1)} %`;
}

export function metricDetail(metric, player) {
  if(metric.key==='calls')return `${player.calls} af ${player.games} spillede hænder`;
  if(metric.type==='percentage')return `${player[metric.countKey]} af ${player.ordinaryCalls} almindelige meldinger`;
  if(metric.type==='deviation')return `Beregnet ud fra ${player.deviationSamples} meldinger af typen Almindelig, Gode, Halve eller Vip`;
  if(metric.type==='points')return `${formatNumber(player.points,2)} point over ${player.games} spil`;
  return metric.help;
}
