// Role-based point distribution. Gross shows earned/lost totals separately;
// net shows each role's signed balance. Columns and photos remain fixed while
// the coloured stacks transition between the two representations.
import {POINT_SOURCE_ROLES} from './point-sources-model.js';
import {createChartPopover} from './chart-popover.js?v=1.0.7';

const rolesByKey = new Map(POINT_SOURCE_ROLES.map(role => [role.key, role]));
export const NEGATIVE_ROLE_ORDER = ['opponent', 'partner', 'caller', 'solo'];
export const POSITIVE_ROLE_ORDER = ['partner', 'caller', 'solo', 'opponent'];
const VALID_MODES = new Set(['gross', 'net']);
// Place stacks just outside the centered avatar, so tiny point values can
// remain visible and tappable. These are minimum *visible* segment lengths;
// larger bar endpoints keep their proportional distance from the zero line.
const FIRST_ROLE_MIN_PX = 20;
const OTHER_ROLE_MIN_PX = 8;

const format = value => Number(value).toLocaleString('da-DK', {
  minimumFractionDigits:2, maximumFractionDigits:2
});
const signed = value => `${value > 0 ? '+' : ''}${format(value)}`;

export function pointSourceLayout(players, mode = 'gross') {
  if (!VALID_MODES.has(mode)) throw new Error('Ukendt fordelingsvisning.');
  const rows = players.map(player => {
    const side = (order, sign) => order.flatMap(key => {
      const entry = player.roles[key];
      if (!entry) return [];
      const amount = mode === 'net'
        ? (entry.points * sign > 0 ? entry.points : 0)
        : (sign < 0 ? entry.negative : entry.positive);
      if (!(amount * sign > 0)) return [];
      const role = rolesByKey.get(key);
      return [{
        key, label:role.label, color:role.color,
        gross:amount, net:entry.points, positive:entry.positive,
        negative:entry.negative, games:entry.games
      }];
    });
    const negative = side(NEGATIVE_ROLE_ORDER, -1);
    const positive = side(POSITIVE_ROLE_ORDER, 1);
    return {
      player, negative, positive,
      negativeTotal: negative.reduce((sum, segment) => sum + Math.abs(segment.gross), 0),
      positiveTotal: positive.reduce((sum, segment) => sum + segment.gross, 0)
    };
  });
  const maxSide = Math.max(0, ...rows.flatMap(row => [row.negativeTotal, row.positiveTotal]));
  // Give bar tops at least ~9% headroom to the end reference lines. A bar at
  // 169 must not reach the label at -170, including on the 365px mobile chart.
  // Use a step of 5 up to 50, and steps of 10 above that threshold.
  const paddedMax = maxSide * 1.1;
  const step = paddedMax > 50 ? 10 : 5;
  const scaleMax = Math.max(5, Math.ceil((paddedMax - 1e-9) / step) * step);
  return {rows, maxSide, scaleMax};
}

export function drawPointSources({container, players, avatar, mode = 'gross'}) {
  if (!VALID_MODES.has(mode)) throw new Error('Ukendt fordelingsvisning.');
  container.replaceChildren();
  // The popover is outside the scrolling area and does not move other panels.
  const popover = createChartPopover(container.parentElement.parentElement);
  const chart = document.createElement('div');
  chart.className = 'rank-bar-chart point-sources-bars';
  chart.style.setProperty('--rank-count', String(players.length));
  chart.style.setProperty('--source-first-min', `${FIRST_ROLE_MIN_PX}px`);
  chart.style.setProperty('--source-other-min', `${OTHER_ROLE_MIN_PX}px`);
  chart.style.width = players.length > 6 ? `${(players.length / 6 * 100).toFixed(4)}%` : '100%';
  chart.setAttribute('role', 'group');
  const zero = document.createElement('div');
  zero.className = 'rank-zero-line';
  zero.setAttribute('aria-hidden', 'true');
  chart.append(zero);

  const limitLabels = [];
  // Keep reference lines in fixed positions; only their endpoint text changes.
  for (const fraction of [-1, -0.75, -0.5, -0.25, 0.25, 0.5, 0.75, 1]) {
    const tick = document.createElement('div');
    const isLimit = Math.abs(fraction) === 1;
    tick.className = `point-source-axis-tick${isLimit ? ' is-limit' : ' is-quarter'}`;
    tick.style.top = `${49 - fraction * 35}%`;
    if (isLimit) {
      const label = document.createElement('span');
      tick.append(label);
      limitLabels.push({fraction, label});
    }
    chart.append(tick);
  }

  // Build both role stacks once. Switching mode changes only their heights,
  // leaving the rank columns, footers and avatar DOM elements untouched.
  const columns = players.map(player => {
    const column = document.createElement('div');
    column.className = 'rank-bar-column point-source-column';
    column.dataset.playerId = player.id;
    column.setAttribute('aria-label', `${player.name}: ${signed(player.netPoints)} point`);
    const stacks = {};
    for (const [side, order] of [
      ['positive', POSITIVE_ROLE_ORDER], ['negative', NEGATIVE_ROLE_ORDER]
    ]) {
      const stack = document.createElement('div');
      stack.className = `point-source-vertical-stack point-source-stack-${side}`;
      const segments = new Map();
      for (const key of order) {
        const role = rolesByKey.get(key);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'point-source-vertical-segment';
        button.dataset.pointDetail = 'true';
        button.style.backgroundColor = role.color;
        button.addEventListener('click', () => {
          const entry = player.roles[key];
          const heading = `${player.name} · ${role.label}`;
          popover.show(button, heading, [
            {name:'Nettopoint', value:signed(entry.points)},
            {name:'Optjente bruttopoint', value:signed(entry.positive)},
            {name:'Tabte bruttopoint', value:signed(entry.negative)},
            {name:'Spil', value:String(entry.games)}
          ], `${player.id}:${key}:${side}`);
        });
        segments.set(key, button);
        stack.append(button);
      }
      column.append(stack);
      stacks[side] = {stack, segments};
    }
    const photo = avatar(player, 'rank-avatar-chart');
    photo.classList.add('rank-bar-avatar');
    photo.title = `${player.name}: ${signed(player.netPoints)} point`;
    const foot = document.createElement('div');
    foot.className = 'rank-bar-footer';
    const name = document.createElement('strong');
    name.textContent = player.name;
    name.title = player.name;
    const games = document.createElement('small');
    games.textContent = `${player.totalGames} spil`;
    foot.append(name, games);
    column.append(photo, foot);
    chart.append(column);
    return stacks;
  });

  function setMode(nextMode) {
    if (!VALID_MODES.has(nextMode)) throw new Error('Ukendt fordelingsvisning.');
    popover.hide();
    const {rows, scaleMax} = pointSourceLayout(players, nextMode);
    const label = nextMode === 'gross' ? 'Bruttopointfordeling' : 'Nettopointfordeling';
    const description = nextMode === 'gross'
      ? 'optjente point over nul og tabte point under nul'
      : 'positive og negative nettopoint efter rolle';
    chart.setAttribute('aria-label', `${label}: ${description}, fordelt efter rolle. Skala fra minus ${scaleMax} til plus ${scaleMax} med hjælpelinjer ved fjerdedele.`);
    container.setAttribute('aria-label', `${label}, fordelt efter rolle`);
    for (const {fraction, label:limit} of limitLabels) {
      limit.textContent = `${fraction > 0 ? '' : '−'}${scaleMax.toLocaleString('da-DK')}`;
    }
    rows.forEach((row, index) => {
      for (const side of ['positive', 'negative']) {
        const {stack, segments} = columns[index][side];
        const values = row[side];
        const byKey = new Map(values.map(segment => [segment.key, segment]));
        const total = side === 'positive' ? row.positiveTotal : row.negativeTotal;
        // An avatar hides the start of the original linear bars. Move stacks
        // to its rim and subtract the same radius from proportional heights;
        // this leaves the endpoint of ordinary bars exactly where it was.
        // Only exceptionally short bars are raised to a tappable minimum.
        // Flex distributes any remaining space according to real values.
        const activeCount = values.length;
        const minimumHeight = FIRST_ROLE_MIN_PX + Math.max(0, activeCount - 1) * OTHER_ROLE_MIN_PX;
        stack.style.height = activeCount
          ? `max(calc(${(35 * total / scaleMax).toFixed(5)}% - var(--source-avatar-radius)), ${minimumHeight}px)`
          : '0px';
        const nearestRoleKey = values[0]?.key;
        for (const [key, button] of segments) {
          const entry = byKey.get(key);
          const value = entry ? Math.abs(entry.gross) : 0;
          button.classList.toggle('is-active', value > 0);
          button.classList.toggle('is-nearest', value > 0 && key === nearestRoleKey);
          button.style.flexGrow = String(value);
          button.style.pointerEvents = value ? '' : 'none';
          button.tabIndex = value ? 0 : -1;
          if (value) {
            button.removeAttribute('aria-hidden');
            const role = rolesByKey.get(key);
            const detail = nextMode === 'gross' ? 'bruttopoint' : 'nettopoint';
            button.setAttribute('aria-label', `${row.player.name} · ${role.label}: ${signed(entry.gross)} ${detail}`);
            button.title = button.getAttribute('aria-label');
          } else {
            button.setAttribute('aria-hidden', 'true');
            button.removeAttribute('title');
          }
        }
      }
    });
  }

  // Initial dimensions are applied before attachment. Subsequent calls
  // animate in place via the CSS height/flex-grow transitions.
  setMode(mode);
  container.append(chart);
  return {
    setMode,
    hide: popover.hide,
    destroy: popover.destroy
  };
}
