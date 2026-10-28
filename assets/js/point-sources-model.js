// Pointkilder: group already-settled per-game net payouts by each player's role.
// Every qualifying game contributes to exactly one role per participant.
export const POINT_SOURCE_ROLES = [
  {key:'caller', label:'Melder', color:'#e7ba61'},
  {key:'partner', label:'Makker', color:'#71cdb0'},
  {key:'opponent', label:'Modstander', color:'#84b4f5'},
  {key:'solo', label:'Sol', color:'#ea9291'}
];

const roleKeys = new Set(POINT_SOURCE_ROLES.map(role => role.key));
const compare = new Intl.Collator('da', {numeric:true,sensitivity:'base'});

export function normalizePointSources(raw) {
  const byPlayer = new Map();
  for (const row of raw ?? []) {
    const id = String(row.player_id ?? '');
    const name = String(row.player_name ?? '').trim();
    const role = String(row.source_role ?? '');
    const points = Number(row.net_points);
    const games = Number(row.games_played);
    if (!id || !name || !roleKeys.has(role) || !Number.isFinite(points) ||
        !Number.isSafeInteger(games) || games < 1 ||
        Math.abs(points * 100 - Math.round(points * 100)) > .001) {
      throw new Error('Supabase returnerede ugyldige Pointkilder-data.');
    }
    if (!byPlayer.has(id)) {
      byPlayer.set(id, {
        id, name, guest: Boolean(row.is_guest),
        roles: Object.fromEntries(POINT_SOURCE_ROLES.map(item => [item.key, {points:0,games:0}])),
        netPoints:0, totalGames:0
      });
    }
    const player = byPlayer.get(id);
    if (player.name !== name || player.roles[role].games > 0) {
      throw new Error('Dubleret eller uens Pointkilder-data.');
    }
    player.roles[role] = {points: Math.round(points * 100) / 100, games};
  }
  return [...byPlayer.values()].map(player => {
    const totalCents = POINT_SOURCE_ROLES.reduce((sum, role) =>
      sum + Math.round(player.roles[role.key].points * 100), 0);
    player.netPoints = totalCents / 100;
    player.totalGames = POINT_SOURCE_ROLES.reduce((sum, role) =>
      sum + player.roles[role.key].games, 0);
    return player;
  }).sort((a,b) => b.netPoints-a.netPoints || b.totalGames-a.totalGames || compare.compare(a.name,b.name));
}

// Pointkilder should reconcile exactly with Stilling because both RPCs
// consume game_player_payouts using the same tournament/guest filter.
export function verifyPointSourcesAgainstStandings(sourcePlayers, standings) {
  const byId = new Map(standings.map(p => [p.id,p]));
  if (byId.size !== sourcePlayers.length) throw new Error('Pointkilder stemmer ikke med Stillingen (spillere).');
  for (const player of sourcePlayers) {
    const standing = byId.get(player.id);
    if (!standing || Math.abs(standing.points - player.netPoints) >= 0.005 ||
        standing.games !== player.totalGames) {
      throw new Error('Pointkilder stemmer ikke med Stillingen (point eller spil).');
    }
  }
  return true;
}
