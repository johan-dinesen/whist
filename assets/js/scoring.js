// UI preview of settlements. The authoritative, historical calculation lives
// in sql/05_scoring_history.sql and is recalculated by PostgreSQL.
export const BASE_CENTS = Object.freeze({
  almindelig: 30, gode: 40, halve: 50, vip: 60,
  sol: 30, ren_sol: 60, bordlaegger: 120, ren_bordlaegger: 240
});
const SOLOS = new Set(['sol','ren_sol','bordlaegger','ren_bordlaegger']);

// Returns the four player payouts as a Map(playerId => decimal units).
// Handles simultaneous solo callers using transfers against all opponents.
export function scoreGame({playerIds, callType, callerIds, partnerId, tricks, vipDepth, score, soloResults}) {
  if (playerIds.length !== 4 || new Set(playerIds).size !== 4) throw Error('Vælg fire forskellige spillere');
  const base = BASE_CENTS[callType];
  if (!base) throw Error('Ukendt melding');
  const cents = new Map(playerIds.map(id => [id, 0]));
  if (SOLOS.has(callType)) {
    for (const caller of callerIds) {
      if (!cents.has(caller)) throw Error('Ukendt melder');
      const result = soloResults[caller] ?? '';
      if (result !== 'Tabt' && !result.startsWith('Vundet')) throw Error('Manglende soloudfald');
      const transfer = result.startsWith('Vundet') ? base : -base;
      cents.set(caller, cents.get(caller) + transfer);
      for (const other of playerIds) {
        if (other !== caller) cents.set(other, cents.get(other) - transfer / 3);
      }
    }
  } else {
    if (tricks == null || score == null) throw Error('Ufuldstændig melding');
    // score = 0 is the base; +1 gains 50%; -1 loses the base.
    const halfUnits = score >= 0 ? 2 + score : -(Math.abs(score) + 1);
    const depth = callType === 'vip' ? vipDepth : 1;
    const valueCents = base * 2 ** (tricks - 9) * halfUnits / 2 * depth;
    const team = new Set([...callerIds, partnerId]);
    if (team.size === 0) throw Error('Ufuldstændigt makkerhold');
    for (const id of playerIds) {
      cents.set(id, team.has(id) ? valueCents * (4 - team.size) / team.size : -valueCents);
    }
  }
  return new Map([...cents].map(([id, amount]) => [id, Math.round(amount) / 100]));
}

export function formatPoints(value) {
  if (value == null || !Number.isFinite(Number(value))) return '';
  const n = Number(value);
  const text = Math.abs(n).toLocaleString('da-DK', {minimumFractionDigits: 1, maximumFractionDigits: 2});
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${text}`;
}
