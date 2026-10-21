// Additional Statistik modules register here, rather than modifying the
// Stilling renderer. Data is calculated by a read-only Supabase SQL RPC.

export const METRICS = [
  {
    key:'calls', label:'Meldinger', short:'Meldinger',
    help:'Antal spil, hvor spilleren selv var melder (flere solmeldere tælles hver for sig).',
    valueKey:'calls', type:'count'
  },
  {
    key:'under', label:'Undermelding', short:'Under',
    help:'Andel meldinger med positivt resultat; ved Sol/Bordlægger en sejr med 1 stik.',
    valueKey:'underPct', countKey:'under', type:'percentage'
  },
  {
    key:'over', label:'Overmelding', short:'Over',
    help:'Andel meldinger med negativt resultat; for solo gælder ethvert tab.',
    valueKey:'overPct', countKey:'over', type:'percentage'
  },
  {
    key:'exact', label:'Præcis melding', short:'Præcis',
    help:'Andel meldinger med resultat 0; solo med 0 stik og vundne Ren Sol/Ren Bordlægger.',
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
    return p;
  }).sort((a,b)=> a.name.localeCompare(b.name,'da',{sensitivity:'base'}) || a.id.localeCompare(b.id));
}

export function displayMetric(metric, player) {
  const val=player[metric.valueKey];
  if(val==null)return '—';
  if(metric.type==='count')return `${val}`;
  if(metric.type==='percentage')return `${formatNumber(val,1)} %`;
  if(metric.type==='deviation' || metric.type==='points')return formatNumber(val,2);
  return String(val);
}

export function formatNumber(value, precision) {
  return Number(value).toLocaleString('da-DK', {
    minimumFractionDigits:precision,maximumFractionDigits:precision
  });
}

export function metricDetail(metric, player) {
  if(metric.type==='percentage')return `${player[metric.countKey]} af ${player.calls} meldinger`;
  if(metric.type==='deviation')return `Beregnet ud fra ${player.deviationSamples} meldinger af typen Almindelig, Gode, Halve eller Vip`;
  if(metric.type==='points')return `${formatNumber(player.points,2)} point over ${player.games} spil`;
  if(metric.key==='calls')return `${player.games} spillede spil`;
  return metric.help;
}
