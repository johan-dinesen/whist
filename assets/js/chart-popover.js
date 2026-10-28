// Shared, non-layout-shifting, dismissible detail overlay for the Stilling charts.
// Parent must be position:relative. No popover data is inserted below the chart.
export function createChartPopover(parent) {
  const root = document.createElement('div');
  root.className = 'chart-detail-popover hidden';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Detaljer for valgt datapunkt');
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'chart-detail-close';
  closeButton.textContent = '×';
  closeButton.setAttribute('aria-label', 'Luk detaljer');
  const title = document.createElement('strong');
  title.className = 'chart-detail-title';
  const lines = document.createElement('div');
  lines.className = 'chart-detail-lines';
  root.append(closeButton, title, lines);
  parent.append(root);
  let selected = null;

  function hide() {
    root.classList.add('hidden');
    selected = null;
  }
  function show(anchor, heading, details, key) {
    if (key && selected === key && !root.classList.contains('hidden')) {
      hide();
      return;
    }
    selected = key ?? null;
    title.textContent = heading;
    lines.replaceChildren();
    for (const detail of details) {
      const line = document.createElement('span');
      if (detail && typeof detail === 'object') {
        line.className = 'chart-detail-row';
        const name = document.createElement('span');
        name.textContent = detail.name;
        const value = document.createElement('strong');
        value.textContent = detail.value;
        line.append(name, value);
      } else {
        line.textContent = detail;
      }
      lines.append(line);
    }
    root.classList.remove('hidden');
    // Position near the clicked point, without escaping the chart container.
    const bounds = parent.getBoundingClientRect();
    const target = anchor.getBoundingClientRect();
    const width = root.offsetWidth;
    const height = root.offsetHeight;
    const targetX = target.left - bounds.left + target.width / 2;
    const targetY = target.top - bounds.top + target.height / 2;
    const left = Math.min(Math.max(6, targetX - width / 2), Math.max(6, bounds.width - width - 6));
    const top = targetY >= height + 12 ? targetY - height - 10 : Math.min(bounds.height - height - 6, targetY + 14);
    root.style.left = `${left}px`;
    root.style.top = `${Math.max(6, top)}px`;
  }
  const onDocumentPointer = event => {
    if (root.classList.contains('hidden')) return;
    if (root.contains(event.target)) return;
    // The selected bar/point is handled separately by show()'s key toggling.
    if (parent.contains(event.target) && event.target.closest?.('[data-point-detail]')) return;
    hide();
  };
  const onKey = event => { if (event.key === 'Escape') hide(); };
  root.addEventListener('click', hide); // The entire popup dismisses, including its ×.
  closeButton.addEventListener('click', hide);
  document.addEventListener('pointerdown', onDocumentPointer);
  document.addEventListener('keydown', onKey);
  return {
    show, hide,
    destroy() {
      document.removeEventListener('pointerdown', onDocumentPointer);
      document.removeEventListener('keydown', onKey);
      root.remove();
    }
  };
}
