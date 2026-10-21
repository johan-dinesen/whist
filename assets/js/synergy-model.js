// Pure presentation model for the Synergi RPC.
// SQL produces every ordered player pair, so the output is an n-by-n matrix.
const collator = new Intl.Collator('da', {sensitivity: 'base', numeric: true});

export function normalizeSynergy(rows) {
  if (!Array.isArray(rows)) throw new Error('Uventet format for Synergi');
  const playersById = new Map();
  const cellsByKey = new Map();
  for (const raw of rows) {
    const a = String(raw.row_player_id ?? '');
    const b = String(raw.col_player_id ?? '');
    const aname = String(raw.row_player_name ?? '').trim();
    const bname = String(raw.col_player_name ?? '').trim();
    if (!a || !b || !aname || !bname) throw new Error('Spilleroplysninger mangler i Synergi');
    for (const [id, name] of [[a,aname],[b,bname]]) {
      if (playersById.has(id) && playersById.get(id).name !== name) throw new Error('Inkonsistente spillernavne');
      playersById.set(id, {id,name});
    }
    const count = Number(raw.games_together);
    if (!Number.isInteger(count) || count < 0) throw new Error('Ugyldigt antal makkerspil');
    const mean = raw.average_points == null ? null : Number(raw.average_points);
    if ((count === 0 && mean != null) || (count > 0 && !Number.isFinite(mean))) {
      throw new Error('Ugyldigt gennemsnit for makkerspil');
    }
    const key = `${a}|${b}`;
    if (cellsByKey.has(key)) throw new Error('Duplikeret makkerpar');
    cellsByKey.set(key,{games:count,average:mean});
  }
  const players = [...playersById.values()].sort((a,b) => collator.compare(a.name,b.name) || a.id.localeCompare(b.id));
  const matrix = players.map(a => players.map(b => {
    const cell = cellsByKey.get(`${a.id}|${b.id}`);
    if (!cell) throw new Error('Synergimatricen er ikke komplet');
    const reverse = cellsByKey.get(`${b.id}|${a.id}`);
    if (!reverse || reverse.games !== cell.games || reverse.average !== cell.average) {
      throw new Error('Synergimatricen er ikke symmetrisk');
    }
    return cell;
  }));
  const maxAbs = Math.max(0, ...matrix.flat().filter(x => x.games).map(x => Math.abs(x.average)));
  // Each non-solo game adds exactly one unique partnership, including diagonal games.
  const partnershipGames = matrix.reduce((n,row,i) => n + row.reduce((sum,cell,j) => sum + (j>=i?cell.games:0),0),0);
  return {players,matrix,maxAbs,partnershipGames};
}

export function formatSynergyPoints(value) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const str = Math.abs(n).toLocaleString('da-DK',{minimumFractionDigits:2,maximumFractionDigits:2});
  return (n>0?'+':n<0?'−':'') + str;
}

export function synergyTint(value,maxAbs) {
  if (!Number.isFinite(value) || maxAbs <= 0 || value === 0) return 'rgba(255,255,255,0.02)';
  const intensity = Math.min(1,Math.abs(value)/maxAbs);
  const alpha = (0.13 + intensity*0.46).toFixed(3);
  return value > 0 ? `rgba(46, 177, 131, ${alpha})` : `rgba(211, 89, 107, ${alpha})`;
}
