// Pointkilder: a photo-centred, signed, stacked horizontal bar for each player.
// Proportional lengths use ONE shared point scale on both sides. A tiny
// minimum-width mark keeps very small nonzero contributions tappable.
import {POINT_SOURCE_ROLES} from './point-sources-model.js';

const rolesByKey = new Map(POINT_SOURCE_ROLES.map(role => [role.key, role]));
// Sequence outward from the player's portrait on either side of zero.
export const NEGATIVE_ROLE_ORDER = ['opponent', 'partner', 'caller', 'solo'];
export const POSITIVE_ROLE_ORDER = ['partner', 'caller', 'solo', 'opponent'];

const format = value => Number(value).toLocaleString('da-DK', {
  minimumFractionDigits: 2, maximumFractionDigits: 2
});
const signed = value => `${value > 0 ? '+' : ''}${format(value)}`;

export function pointSourceLayout(players) {
  const rows = players.map(player => {
    const side = (order, sign) => order.flatMap(key => {
      const entry = player.roles[key];
      if (!entry || !(entry.points * sign > 0)) return [];
      const role = rolesByKey.get(key);
      return [{key, label: role.label, color: role.color, points: entry.points, games: entry.games}];
    });
    const negative = side(NEGATIVE_ROLE_ORDER, -1);
    const positive = side(POSITIVE_ROLE_ORDER, 1);
    return {
      player,
      negative, positive,
      negativeTotal: negative.reduce((sum, segment) => sum + Math.abs(segment.points), 0),
      positiveTotal: positive.reduce((sum, segment) => sum + segment.points, 0)
    };
  });
  const maxSide = Math.max(.01, ...rows.flatMap(row => [row.negativeTotal, row.positiveTotal]));
  return {rows, maxSide};
}

export function drawPointSources({container, players, avatar}) {
  const {rows, maxSide} = pointSourceLayout(players);
  container.replaceChildren();

  const chart = document.createElement('div');
  chart.className = 'point-sources-bars';
  chart.setAttribute('role', 'group');
  chart.setAttribute('aria-label', 'Pointkilder: negative point til venstre og positive point til højre for spillerens billede');

  const detail = document.createElement('p');
  detail.className = 'point-source-detail hidden';
  detail.setAttribute('role', 'status');
  detail.setAttribute('aria-live', 'polite');

  for (const row of rows) {
    const line = document.createElement('div');
    line.className = 'point-source-row';
    line.setAttribute('aria-label', `${row.player.name}: ${signed(row.player.netPoints)} point i alt`);
    const buildSide = (segments, sideName, sum) => {
      const track = document.createElement('div');
      track.className = `point-source-track point-source-track-${sideName}`;
      const stack = document.createElement('div');
      stack.className = 'point-source-stack';
      // A small 2% safety margin for minimum visible segments at the extremes.
      stack.style.width = `${(sum / maxSide * 98).toFixed(5)}%`;
      for (const segment of segments) {
        const button = document.createElement('button');
        button.className = 'point-source-segment';
        button.type = 'button';
        button.style.backgroundColor = segment.color;
        button.style.flexGrow = String(Math.abs(segment.points));
        button.style.flexBasis = '0px';
        const message = `${row.player.name} · ${segment.label}: ${signed(segment.points)} point · ${segment.games} spil`;
        button.title = message;
        button.setAttribute('aria-label', message);
        button.addEventListener('click', () => {
          if (!detail.classList.contains('hidden') && detail.dataset.active === message) {
            detail.classList.add('hidden');
            detail.dataset.active = '';
          } else {
            detail.dataset.active = message;
            detail.textContent = `${message} · Samlet: ${signed(row.player.netPoints)} point`;
            detail.classList.remove('hidden');
          }
        });
        stack.append(button);
      }
      track.append(stack);
      return track;
    };

    const photo = avatar(row.player, 'point-source-avatar');
    photo.title = `${row.player.name}: ${signed(row.player.netPoints)} point i alt`;
    photo.setAttribute('aria-label', `${row.player.name}: ${signed(row.player.netPoints)} point i alt`);
    line.append(
      buildSide(row.negative, 'negative', row.negativeTotal),
      photo,
      buildSide(row.positive, 'positive', row.positiveTotal)
    );
    chart.append(line);
  }
  container.append(chart, detail);
}
