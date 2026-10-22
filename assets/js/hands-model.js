// Hænder: read-only response normalisation and display formatting.
// Independent from rankings and other statistics modules.
const collator = new Intl.Collator('da', {sensitivity:'base', numeric:true});
const numberFormat = new Intl.NumberFormat('da-DK', {minimumFractionDigits:0, maximumFractionDigits:2});
const percentFormat = new Intl.NumberFormat('da-DK', {minimumFractionDigits:0, maximumFractionDigits:1});

function validNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function validCount(value) {
  const n = validNumber(value);
  return n === null ? 0 : Math.max(0, Math.trunc(n));
}

export function normalizeHandsResponse(data) {
  if (!data || !Array.isArray(data.players) || !Array.isArray(data.hands))
    throw new Error('Supabase returnerede et ugyldigt Hænder-format');
  const players = data.players.map(p => ({ id:String(p.id), name:String(p.name||'') }))
    .sort((a,b) => collator.compare(a.name,b.name));
  const hands = data.hands.map(hand => {
    const stats = new Map((Array.isArray(hand.players) ? hand.players : [])
      .map(p => [String(p.player_id), {
        count:validCount(p.count), average:validNumber(p.average)
      }]));
    return {
      label:String(hand.label||''),
      isSolo:Boolean(hand.is_solo),
      count:validCount(hand.count),
      average:validNumber(hand.average),
      byPlayer:players.map(player => stats.get(player.id) || {count:0,average:null})
    };
  }).filter(hand=>hand.count>0);
  return {players,hands};
}

export function formatHandAverage(value, isSolo, count=1) {
  if (count === 0 || value === null || !Number.isFinite(value)) return '—';
  return isSolo ? `${percentFormat.format(value)} %` : numberFormat.format(value);
}
