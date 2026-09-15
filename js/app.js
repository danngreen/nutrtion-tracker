/* Router + render loop. Each view is a function returning a DOM node; a
   rerender throws the node away and builds a fresh one, which is plenty fast
   at this data size and keeps state handling trivial. */
import * as store from './store.js';
import { el, toast } from './ui.js';
import { foodsView } from './foods.js';
import { dayView } from './day.js';
import { summaryView } from './summary.js';
import { settingsView, applyTheme } from './settings.js';

const ROUTES = {
  day:      { title: 'Day',      view: dayView },
  foods:    { title: 'Foods',    view: foodsView },
  summary:  { title: 'Summary',  view: summaryView },
  settings: { title: 'Settings', view: settingsView },
};

const viewHost = document.getElementById('view');
const titleNode = document.getElementById('view-title');
const actionsNode = document.getElementById('appbar-actions');

function currentRoute() {
  const name = location.hash.replace(/^#\/?/, '').split('/')[0];
  return ROUTES[name] ? name : 'day';
}

let rendering = false;
let pendingFrame = 0;
let pendingPreserveScroll = true;

/* A store commit and the view's own rerender() both want a repaint; coalesce
   them into one frame so nothing paints twice. */
function scheduleRender({ preserveScroll = true } = {}) {
  pendingPreserveScroll = pendingPreserveScroll && preserveScroll;
  if (pendingFrame) return;
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = 0;
    const preserve = pendingPreserveScroll;
    pendingPreserveScroll = true;
    render({ preserveScroll: preserve });
  });
}

function render({ preserveScroll = false } = {}) {
  if (rendering) return;
  rendering = true;
  if (pendingFrame) { cancelAnimationFrame(pendingFrame); pendingFrame = 0; pendingPreserveScroll = true; }
  const name = currentRoute();
  const route = ROUTES[name];
  const scrollY = preserveScroll ? window.scrollY : 0;

  const setActions = (nodes) => {
    actionsNode.textContent = '';
    for (const n of [].concat(nodes || [])) if (n) actionsNode.append(n);
  };

  titleNode.textContent = route.title;
  document.title = `${route.title} · Nutrition Tracker`;

  let node;
  try {
    node = route.view({ setActions, rerender: () => scheduleRender() });
  } catch (err) {
    console.error(err);
    node = el('div', { class: 'empty' }, [
      el('p', { text: 'Something went wrong rendering this page.' }),
      el('pre', { text: String(err), style: 'text-align:left;overflow:auto;font-size:.7rem' }),
    ]);
  }

  viewHost.textContent = '';
  viewHost.append(node);

  for (const tab of document.querySelectorAll('.tab')) {
    if (tab.dataset.tab === name) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }

  window.scrollTo(0, scrollY);
  rendering = false;
}

window.addEventListener('hashchange', () => render({ preserveScroll: false }));

window.addEventListener('storage-error', () => {
  toast('Could not save — device storage may be full or private browsing is on.', { duration: 6000 });
});

/* Another tab changed the data; repaint so the two stay in step. */
store.subscribe(() => {
  if (!rendering) scheduleRender();
});

applyTheme();
if (!location.hash) location.replace('#/day');
render();

/* ---- service worker: offline + home-screen install ---------------------- */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW registration failed', err));
  });
}
