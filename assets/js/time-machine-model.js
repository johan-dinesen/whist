// Pure snapshot adapter for Stillingsudvikling in Pointdiagram.
// The history model uses one chronological game index shared by every player.
const names = new Intl.Collator('da', {numeric: true, sensitivity: 'base'});

export function standingsAtGame(history, gameIndex) {
  if (!history || !Number.isSafeInteger(gameIndex) || gameIndex < 0 || gameIndex > history.gameCount) {
    throw new Error('Ugyldigt spilnummer til Stillingsudvikling');
  }
  return history.players.map(player => {
    const points = player.series?.[gameIndex];
    const games = player.gamesPlayed?.[gameIndex];
    if (!Number.isFinite(points) || !Number.isSafeInteger(games) || games < 0) {
      throw new Error('Manglende historiske point eller antal spil');
    }
    return {id:player.id, name:player.name, points, games};
  }).sort((a,b) => b.points - a.points || names.compare(a.name,b.name) || a.id.localeCompare(b.id));
}
