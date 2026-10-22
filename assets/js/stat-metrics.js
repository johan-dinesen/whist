// Data model for independent Meldingsstatistik module.
// All values use the same selected games / guest filtering as Stilling.
export const METRICS = [
  {
    key:'calls', label:'Meldinger', short:'Meldinger',
    help:'Andel af spillerens spillede hænder, hvor spilleren selv meldte (flere solmeldere tælles hver for sig).',
    valueKey:'callsPct', type:'percentage', fraction:'hands'
  },
  {
    key:'under', label:'Undermelding', short:'Under',
    help:'Andel af egne meldinger med positivt resultat; ved Sol/Bordlægger en sejr med 1 stik.',
    valueKey:'underPct', countKey:'under', type:'percentage'
  },
  {
    key:'over', label:'Overmelding', short:'Over',
    help:'Andel af egne meldinger med negativt resultat; for solo gælder ethvert tab.',
    valueKey:'overPct', countKey:'over', type:'percentage'
  },
  {
    key:'exact', label:'Præcis melding', short:'Præcis',
    help:'Andel af egne meldinger med resultat 0; solo med 0 stik og vundne Ren Sol/Ren Bordlægger.',
    valueKey:'exactPct', countKey:'exact', type:'percentage'
  },
  {
    key:'deviation', label:'Stikafvigelse', short:'Stikafv.',
    help:'Gennemsnitligt resultat (med fortegn) på egne meldinger af typen Almindelig, Gode, Halve eller Vip. Solo-meldinger indgår ikke.',
    valueKey:'avgDeviation', type:'deviation'
  },
  {
    key:'absoluteDeviation', label:'Absolut stikafvigelse', short:'|Stikafv.|',
    help:'Gennemsnittet af den absolutte resultatværdi på egne meldinger af typen Almindelig, Gode, Halve eller Vip. Solo-meldinger indgår ikke.',
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
      unknown:naturalNumber(r.unclassified_calls,'uklassificerede meldinger'),
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
       p.calls>p.games || p.deviationSamples>p.calls){
      throw new Error('Supabase returnerede ufuldstændige statistikdata.');
    }
    // Meldinger is a rate per played hand, not a number of calls.
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
  return metric.type==='percentage' ? `${formatNumber(value,1)} %` : formatNumber(value,2);
}

// Relative mode means an ADDITIVE difference from the equal-player average.
// Percentage-based columns use percentage points (pp), not relative % growth.
export function displayDifference(metric, player, means) {
  const val=metricValue(metric,player);
  const avg=means[metric.key];
  if(val===null || avg===null)return '—';
  const digits=metric.type==='percentage'?1:2;
  const difference=val-avg;
  const eps=Math.pow(10,-digits)/2;
  const rounded=Math.abs(difference)<eps?0:difference;
  const sign=rounded>0?'+':'';
  return `${sign}${formatNumber(rounded,digits)}${metric.type==='percentage'?' pp':''}`;
}

export function metricDetail(metric, player) {
  if(metric.key==='calls')return `${player.calls} af ${player.games} spillede hænder`;
  if(metric.type==='percentage')return `${player[metric.countKey]} af ${player.calls} meldinger`;
  if(metric.type==='deviation')return `Beregnet ud fra ${player.deviationSamples} meldinger af typen Almindelig, Gode, Halve eller Vip`;
  if(metric.type==='points')return `${formatNumber(player.points,2)} point over ${player.games} spil`;
  return metric.help;
}
