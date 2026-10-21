// Pure, testable transformations for the first Statistik module.
export function normalizeStandings(raw) {
  const rows = (raw ?? []).map(r => ({
    id:String(r.player_id),
    name:String(r.player_name),
    guest:Boolean(r.is_guest),
    points:Number(r.net_points),
    games:Number(r.games_played)
  }));
  if (rows.some(r => !r.id || !r.name || !Number.isFinite(r.points)
    || !Number.isInteger(r.games) || r.games < 1)) {
    throw new Error('Supabase returnerede ugyldige spilleresultater.');
  }
  rows.sort((a,b) => b.points-a.points || b.games-a.games || a.name.localeCompare(b.name,'da'));
  return rows;
}

// A pie chart can't encode negative quantities. Make separate pies for each
// side of the zero-sum settlement, each using the absolute net point amounts.
export function pointShares(rows, sign) {
  const people = rows.filter(r => sign === 'positive' ? r.points > 0 : r.points < 0);
  const total = people.reduce((n,r) => n + Math.abs(r.points),0);
  return people.map(r => ({...r, share:total ? Math.abs(r.points)/total : 0, magnitude:Math.abs(r.points)}));
}
