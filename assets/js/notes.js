// Shared Spilsamlinger filtering used by BOTH Historik and Statistik.
// An empty selection means Alle. Guests are an independent filter.
const ORIGINAL_ORDER = [
  'Klitmøller 2026','Hals 2025','Helsinki 2024','Hals 2024','Slettestrand 2023'
];
const SELECTION_KEY = 'whist-selected-notes-v1';
const GUESTS_KEY = 'whist-include-guests-v1';

export function sortGroups(groups) {
  return [...groups].sort((a,b) => {
    const ai = ORIGINAL_ORDER.indexOf(a.name);
    const bi = ORIGINAL_ORDER.indexOf(b.name);
    if (ai === -1 && bi === -1) {
      const ta = Date.parse(a.created_at);
      const tb = Date.parse(b.created_at);
      return ((Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0))
        || b.name.localeCompare(a.name,'da');
    }
    if (ai === -1) return -1;
    if (bi === -1) return 1;
    return ai - bi;
  });
}
export function readSelection(groups) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SELECTION_KEY) ?? '[]');
    if (!Array.isArray(saved)) return new Set();
    const valid = new Set(['kredsspil',...groups.map(g => g.id)]);
    return new Set(saved.filter(x => valid.has(x)));
  } catch { return new Set(); }
}
export function saveSelection(selection) {
  try { sessionStorage.setItem(SELECTION_KEY, JSON.stringify([...selection])); } catch { /* no storage */ }
}
export function readIncludeGuests() {
  try { return sessionStorage.getItem(GUESTS_KEY) === 'true'; } catch { return false; }
}
export function saveIncludeGuests(yes) {
  try { sessionStorage.setItem(GUESTS_KEY, String(Boolean(yes))); } catch { /* no storage */ }
}
export function selectionParams(selection) {
  return selection.size === 0
    ? {p_tournament_ids:null,p_include_kredsspil:true}
    : {p_tournament_ids:[...selection].filter(x => x !== 'kredsspil'),
       p_include_kredsspil:selection.has('kredsspil')};
}
export function renderNoteFilters(root, groups, selection, onChange) {
  root.replaceChildren();
  // Keep 'Alle' next to the heading when the tournament options form complete pairs.
  // If a future odd number of tournament options exists, 'Alle' fills the last pair.
  const resetSlot = root.parentElement?.querySelector?.('[data-note-reset]');
  const resetInHeading = Boolean(resetSlot) && (groups.length + 1) % 2 === 0;
  if (resetSlot) resetSlot.classList.toggle('hidden', !resetInHeading);
  const options = [{key:'kredsspil',name:'Kredsspil'},
    ...groups.map(g => ({key:g.id,name:g.name})),
    {key:'all',name:'Alle'}];
  for (const {key,name} of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'note-chip';
    button.textContent = name;
    button.setAttribute('aria-pressed', String(key === 'all'
      ? selection.size === 0 : selection.has(key)));
    button.addEventListener('click', () => {
      if (key === 'all') selection.clear();
      else if (selection.has(key)) selection.delete(key);
      else selection.add(key);
      saveSelection(selection);
      renderNoteFilters(root,groups,selection,onChange);
      onChange();
    });
    if (key === 'all' && resetInHeading) {
      button.classList.add('note-reset-chip');
      button.setAttribute('data-note-reset', '');
      resetSlot.replaceWith(button);
    } else {
      root.append(button);
    }
  }
}
