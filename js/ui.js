/* Small DOM + formatting helpers. No framework: every view returns a node. */

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in node && k !== 'list' && k !== 'type' && k !== 'step') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function svgIcon(paths, size = 18) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const d of [].concat(paths)) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

export const ICONS = {
  plus: 'M12 5v14M5 12h14',
  chevronRight: 'M9 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  trash: ['M4 7h16', 'M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2', 'M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13'],
  x: 'M6 6l12 12M18 6L6 18',
  search: ['M11 19a8 8 0 100-16 8 8 0 000 16z', 'M21 21l-4.3-4.3'],
  edit: ['M4 20h4l11-11a2.1 2.1 0 00-3-3L5 17v3z'],
  download: ['M12 4v11', 'M8 11l4 4 4-4', 'M4 20h16'],
  upload: ['M12 19V8', 'M8 12l4-4 4 4', 'M4 20h16'],
};

/* ---- numbers ------------------------------------------------------------ */
export function fmt(value, decimals = 1) {
  if (!Number.isFinite(value)) return '—';
  /* Whole numbers stay clean; 12.0 g reads worse than 12 g. */
  const rounded = Number(value.toFixed(decimals));
  return rounded.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export function fmtQty(qty) {
  if (qty === 0.5) return '½';
  if (qty === 0.25) return '¼';
  if (qty === 0.75) return '¾';
  return Number(qty.toFixed(2)).toString();
}

export function parseNum(input) {
  const s = String(input).trim();
  if (!s) return 0;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/* ---- dates -------------------------------------------------------------- */
/* All dates are local-calendar 'YYYY-MM-DD' strings. Never construct them with
   toISOString(), which shifts to UTC and can land on the wrong day. */
export function todayStr() { return toDateStr(new Date()); }

export function toDateStr(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseDateStr(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function shiftDate(s, days) {
  const d = parseDateStr(s);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function daysBetween(a, b) {
  return Math.round((parseDateStr(b) - parseDateStr(a)) / 86400000);
}

export function dateRange(from, to) {
  const out = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard++ < 4000) {
    out.push(cur);
    cur = shiftDate(cur, 1);
  }
  return out;
}

export function friendlyDate(s) {
  const today = todayStr();
  if (s === today) return 'Today';
  if (s === shiftDate(today, -1)) return 'Yesterday';
  if (s === shiftDate(today, 1)) return 'Tomorrow';
  const d = parseDateStr(s);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
}

export function shortDate(s) {
  return parseDateStr(s).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
}

/* ---- toast -------------------------------------------------------------- */
let toastTimer;
export function toast(message, { action, onAction, duration = 3200 } = {}) {
  const root = document.getElementById('toast-root');
  root.textContent = '';
  clearTimeout(toastTimer);
  const node = el('div', { class: 'toast' }, [el('span', { text: message })]);
  if (action) {
    node.append(el('button', {
      type: 'button',
      text: action,
      onclick: () => { node.remove(); onAction?.(); },
    }));
  }
  root.append(node);
  toastTimer = setTimeout(() => node.remove(), duration);
}

/* ---- sheet -------------------------------------------------------------- */
/* A bottom sheet on phones, a centred dialog on wider screens. Returns a
   handle so callers can close it once their save succeeds. */
export function openSheet({ title, body, footer, onClose }) {
  const root = document.getElementById('sheet-root');
  const previouslyFocused = document.activeElement;

  const close = () => {
    backdrop.remove();
    document.body.style.overflow = '';
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('hashchange', close);
    previouslyFocused?.focus?.();
    onClose?.();
  };

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  };

  const closeBtn = el('button', {
    class: 'btn btn-icon btn-ghost', type: 'button',
    'aria-label': 'Close', onclick: close,
  }, [svgIcon(ICONS.x, 20)]);

  const sheet = el('div', {
    class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title,
  }, [
    el('div', { class: 'sheet-head' }, [el('h2', { text: title }), closeBtn]),
    el('div', { class: 'sheet-body' }, [body]),
    footer ? el('div', { class: 'sheet-foot' }, footer) : null,
  ]);

  const backdrop = el('div', {
    class: 'sheet-backdrop',
    onclick: (e) => { if (e.target === backdrop) close(); },
  }, [sheet]);

  root.append(backdrop);
  document.body.style.overflow = 'hidden';
  window.addEventListener('keydown', onKey);
  /* Navigating away (including the phone's back gesture) should dismiss. */
  window.addEventListener('hashchange', close);

  const focusTarget = sheet.querySelector('[data-autofocus]');
  if (focusTarget) setTimeout(() => focusTarget.focus(), 60);

  return { close, sheet };
}

export function confirmSheet({ title, message, confirmLabel = 'Delete', danger = true, onConfirm }) {
  const handle = openSheet({
    title,
    body: el('p', { text: message, style: 'margin:2px 0 4px;color:var(--text-secondary)' }),
    footer: [
      el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => handle.close() }),
      el('button', {
        class: danger ? 'btn btn-danger' : 'btn btn-primary', type: 'button', text: confirmLabel,
        onclick: () => { handle.close(); onConfirm(); },
      }),
    ],
  });
  return handle;
}

export function emptyState({ icon, text, actionLabel, onAction }) {
  return el('div', { class: 'empty' }, [
    icon ? svgIcon(icon, 38) : null,
    el('p', { text }),
    actionLabel ? el('button', { class: 'btn btn-primary', type: 'button', text: actionLabel, onclick: onAction }) : null,
  ]);
}
