// Fordeling: the exact same vertical columns, 49%-height zero line, player
// positions and photo sizing as Diagram. Per-role signed totals are stacked
// outwards from the photo; role colours never change when the sign does.
import {POINT_SOURCE_ROLES} from './point-sources-model.js';
import {createChartPopover} from './chart-popover.js?v=1.0.7';

const rolesByKey = new Map(POINT_SOURCE_ROLES.map(role => [role.key, role]));
export const NEGATIVE_ROLE_ORDER = ['opponent', 'partner', 'caller', 'solo'];
export const POSITIVE_ROLE_ORDER = ['partner', 'caller', 'solo', 'opponent'];

const format = value => Number(value).toLocaleString('da-DK', {
  minimumFractionDigits:2, maximumFractionDigits:2
});
const signed = value => `${value > 0 ? '+' : ''}${format(value)}`;

export function pointSourceLayout(players) {
  const rows = players.map(player => {
    const side = (order, sign) => order.flatMap(key => {
      const entry = player.roles[key];
      if (!entry || !(entry.points * sign > 0)) return [];
      const role = rolesByKey.get(key);
      return [{key, label:role.label, color:role.color, points:entry.points, games:entry.games}];
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
  const maxSide = Math.max(0, ...rows.flatMap(row => [row.negativeTotal, row.positiveTotal]));
  // The signed axis is symmetric, and both ends round upwards to a multiple of 5.
  // Always keep a usable scale even when all players have zero points.
  const scaleMax = Math.max(5, Math.ceil((maxSide - 1e-9) / 5) * 5);
  return {rows, maxSide, scaleMax};
}

export function drawPointSources({container, players, avatar}) {
  const {rows, scaleMax} = pointSourceLayout(players);
  container.replaceChildren();
  // Popover is outside the horizontally scrolling chart, so it never causes
  // the other statistics panels to move and is never clipped when scrolling.
  const popover = createChartPopover(container.parentElement.parentElement);
  const chart = document.createElement('div');
  chart.className = 'rank-bar-chart point-sources-bars';
  chart.style.setProperty('--rank-count', String(rows.length));
  chart.style.width = rows.length > 6 ? `${(rows.length / 6 * 100).toFixed(4)}%` : '100%';
  chart.setAttribute('role', 'group');
  chart.setAttribute('aria-label', `Fordeling: søjler med point fordelt efter rolle. Skala fra minus ${scaleMax} til plus ${scaleMax} med hjælpelinjer ved fjerdedele.`);
  const zero = document.createElement('div');
  zero.className = 'rank-zero-line';
  zero.setAttribute('aria-hidden', 'true');
  chart.append(zero);
  // Dashed quarter steps provide a reference without obscuring mobile bars
  // with intermediate numbers. Only the upper and lower limits are labelled.
  for (const fraction of [-1, -0.75, -0.5, -0.25, 0.25, 0.5, 0.75, 1]) {
    // A negative value lies below the centre; positive above it.
    const top = 49 - fraction * 35;
    const isLimit = Math.abs(fraction) === 1;
    const tick = document.createElement('div');
    tick.className = `point-source-axis-tick${isLimit ? ' is-limit' : ' is-quarter'}`;
    tick.style.top = `${top}%`;
    if (isLimit) {
      const label = document.createElement('span');
      label.textContent = `${fraction > 0 ? '+' : '−'}${scaleMax.toLocaleString('da-DK')}`;
      tick.append(label);
    }
    chart.append(tick);
  }

  for (const row of rows) {
    const column = document.createElement('div');
    column.className = 'rank-bar-column point-source-column';
    column.dataset.playerId = row.player.id;
    column.setAttribute('aria-label', `${row.player.name}: ${signed(row.player.netPoints)} point`);

    const buildStack = (segments, side, total) => {
      const stack = document.createElement('div');
      stack.className = `point-source-vertical-stack point-source-stack-${side}`;
      const height = 35 * total / scaleMax;
      stack.style.height = `${height.toFixed(5)}%`;
      for (const segment of segments) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'point-source-vertical-segment';
        button.dataset.pointDetail = 'true';
        button.style.backgroundColor = segment.color;
        button.style.flexGrow = String(Math.abs(segment.points));
        const label = `${row.player.name} · ${segment.label}: ${signed(segment.points)} nettopoint, ${segment.games} spil`;
        button.setAttribute('aria-label', label);
        button.title = label;
        button.addEventListener('click', () => {
          popover.show(button, `${row.player.name} · ${segment.label}`,
            [`${signed(segment.points)} nettopoint`, `${segment.games} spil`],
            `${row.player.id}:${segment.key}`);
        });
        stack.append(button);
      }
      return stack;
    };
    column.append(buildStack(row.positive, 'positive', row.positiveTotal));
    column.append(buildStack(row.negative, 'negative', row.negativeTotal));

    const photo = avatar(row.player, 'rank-avatar-chart');
    photo.classList.add('rank-bar-avatar');
    photo.title = `${row.player.name}: ${signed(row.player.netPoints)} point`;
    const foot = document.createElement('div');
    foot.className = 'rank-bar-footer';
    const name = document.createElement('strong');
    name.textContent = row.player.name;
    name.title = row.player.name;
    const games = document.createElement('small');
    games.textContent = `${row.player.totalGames} spil`;
    foot.append(name, games);
    column.append(photo, foot);
    chart.append(column);
  }
  container.append(chart);
  return popover;
}
