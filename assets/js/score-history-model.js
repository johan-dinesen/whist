// Pure data model for Stillingshistorik.
// Each qualifying game has one global chronological index and four payouts.
// Every player's line starts at (0,0) and stays flat on games they didn't play.
const compareNames = new Intl.Collator('da', {numeric: true, sensitivity: 'base'});

export function buildScoreHistory(data) {
  if (!data || !Array.isArray(data.players) || !Array.isArray(data.games)) {
    throw new Error('Uventet dataformat for Stillingshistorik');
  }
  const gameCount = Number(data.game_count);
  if (!Number.isSafeInteger(gameCount) || gameCount < 0 || data.games.length !== gameCount) {
    throw new Error('Antallet af spil stemmer ikke med historikken');
  }
  const players = [...data.players].map(p => ({
    id: String(p.id ?? ''), name: String(p.name ?? '').trim(), cents: 0, series: [0]
  })).sort((a,b) => compareNames.compare(a.name,b.name) || a.id.localeCompare(b.id));
  const byId = new Map();
  for (const p of players) {
    if (!p.id || !p.name || byId.has(p.id)) throw new Error('Ugyldigt spillernavn eller ID');
    byId.set(p.id,p);
  }
  const orderedGames = [...data.games].sort((a,b) => Number(a.index)-Number(b.index));
  for (const [offset,game] of orderedGames.entries()) {
    if (Number(game.index) !== offset+1 || !Array.isArray(game.payouts)) {
      throw new Error('Spillene har ikke fortløbende numre');
    }
    const participants = new Set();
    for (const paid of game.payouts) {
      const id = String(paid.player_id ?? '');
      const player = byId.get(id);
      const value = Number(paid.points);
      if (!player || participants.has(id) || !Number.isFinite(value) || Math.abs(value*100 - Math.round(value*100)) > 0.001) {
        throw new Error('Ugyldig spiller eller pointværdi i spil '+game.index);
      }
      participants.add(id);
      player.cents += Math.round(value*100);
    }
    if (participants.size !== 4) {
      throw new Error('Spil '+game.index+' mangler én eller flere af de fire spillere');
    }
    for (const player of players) player.series.push(player.cents/100);
  }
  return {
    gameCount,
    players:players.map(({id,name,series})=>({id,name,series,final:series.at(-1)}))
  };
}
