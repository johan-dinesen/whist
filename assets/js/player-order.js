// Shared display ordering: established players first, guests second.
// Scoring/rank order in the Podie, Diagram and Fordeling views is not changed.
const danishNames = new Intl.Collator('da', {sensitivity:'base', numeric:true});

export function compareDisplayPlayers(a, b) {
  return Number(Boolean(a.guest)) - Number(Boolean(b.guest)) ||
    danishNames.compare(a.name, b.name) ||
    String(a.id).localeCompare(String(b.id));
}

export function guestIdsFrom(...collections) {
  return new Set(collections.flat().filter(player => player?.guest).map(player => String(player.id)));
}
