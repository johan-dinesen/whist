// One document, four independent modules. Navigation never reloads the page.
const pages = new Map([...document.querySelectorAll('[data-whist-page]')]
  .map(element => [element.dataset.whistPage, element]));
const names = {
  registrering: 'Registrering', stilling: 'Stilling',
  historik: 'Historik', administrering: 'Administrering'
};
let activePage = null;

function routeFromUrl() {
  const candidate = decodeURIComponent(location.hash.slice(1)).toLowerCase();
  return pages.has(candidate) ? candidate : 'registrering';
}
function jumpToTop() {
  // html normally uses smooth scrolling for registration steps; navigation
  // must go to the top immediately, including after a step animation.
  const html = document.documentElement;
  const previous = html.style.scrollBehavior;
  html.style.scrollBehavior = 'auto';
  window.scrollTo(0, 0);
  html.style.scrollBehavior = previous;
}
function showPage(next) {
  if (!pages.has(next)) next = 'registrering';
  if (activePage === next) return;
  const previous = activePage;
  if (previous === 'registrering') window.dispatchEvent(new Event('whist:leave-registration'));
  activePage = next;
  for (const [key, element] of pages) element.hidden = key !== next;
  for (const link of document.querySelectorAll('[data-whist-nav]')) {
    if (link.dataset.whistNav === next) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.body.classList.toggle('data-page', next !== 'registrering');
  document.title = `Whist | ${names[next]}`;
  jumpToTop();
  // Notify the selected module after its layout is measurable.
  requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('whist:pagechange', {
    detail: {page:next, previous}
  })));
}
for (const link of document.querySelectorAll('[data-whist-nav]')) {
  link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    const next = link.dataset.whistNav;
    if (routeFromUrl() !== next || activePage !== next) {
      history.pushState({whistPage:next}, '', `#${next}`);
      showPage(next);
    } else jumpToTop();
  });
}
window.addEventListener('popstate', () => showPage(routeFromUrl()));
window.addEventListener('hashchange', () => showPage(routeFromUrl()));
showPage(routeFromUrl());
