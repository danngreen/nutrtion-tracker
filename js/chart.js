/* Single-series daily-total bar chart, drawn as inline SVG.
   One measure, one baseline, one hue — no second axis, no legend for the
   single series (the card title names it); the dashed reference lines get the
   legend instead. */
import { el, fmt, shortDate, friendlyDate } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const PAD = { top: 16, right: 10, bottom: 22, left: 38 };
const HEIGHT = 190;
const MAX_BAR = 24;
const GAP = 2;

function s(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  return node;
}

/* A readable y scale: every gridline must land on a round number, so pick the
   step first and let it decide the maximum. Trying a few tick counts avoids
   the case where 4 ticks force twice the headroom the data needs. */
function niceScale(maxValue) {
  if (!(maxValue > 0)) return { max: 1, step: 0.25, ticks: 4 };
  let best = null;
  for (const ticks of [4, 5, 6]) {
    const raw = maxValue / ticks;
    const base = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 2.5, 5, 10]) {
      const step = m * base;
      if (step * ticks < maxValue - 1e-9) continue;
      const max = step * ticks;
      if (!best || max < best.max - 1e-9) best = { max, step, ticks };
      break;
    }
  }
  return best || { max: maxValue, step: maxValue / 4, ticks: 4 };
}

/* Bar path: rounded at the data end, square where it meets the baseline. */
function barPath(x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h));
  if (h <= 0.5) return `M${x} ${y} h${w}`;
  return `M${x} ${y + h} V${y + rad} a${rad} ${rad} 0 0 1 ${rad} ${-rad} h${w - 2 * rad} a${rad} ${rad} 0 0 1 ${rad} ${rad} V${y + h} Z`;
}

/**
 * points: [{ date, value, logged }]  — logged=false means no food recorded.
 * Renders into `host` and re-renders on resize.
 */
export function renderChart(host, { points, nutrient, average, goal }) {
  host.textContent = '';
  const tip = el('div', { class: 'chart-tip' });
  const chart = el('div', { class: 'chart' });
  host.append(chart, tip);

  const draw = () => {
    const width = Math.max(260, host.clientWidth || 320);
    chart.textContent = '';
    if (!points.length) return;

    const plotW = width - PAD.left - PAD.right;
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const maxValue = Math.max(...points.map((p) => p.value), goal || 0, 0);
    const scale = niceScale(maxValue);
    const yMax = scale.max;
    const yOf = (v) => PAD.top + plotH - (v / yMax) * plotH;

    const band = plotW / points.length;
    const barW = Math.max(1.5, Math.min(MAX_BAR, band - GAP));
    const xOf = (i) => PAD.left + band * i + (band - barW) / 2;

    const svg = s('svg', {
      viewBox: `0 0 ${width} ${HEIGHT}`,
      width, height: HEIGHT,
      role: 'img',
      'aria-label': `Daily ${nutrient.name} for ${points.length} days, in ${nutrient.unit}. Average ${fmt(average, nutrient.decimals)}.`,
    });

    /* gridlines + y labels: recessive, hairline, solid */
    const labelDecimals = scale.step >= 1 ? 0 : (scale.step >= 0.1 ? 1 : 2);
    for (let i = 0; i <= scale.ticks; i++) {
      const v = scale.step * i;
      const y = yOf(v);
      svg.append(s('line', { class: 'grid-line', x1: PAD.left - 4, x2: width - PAD.right, y1: y, y2: y }));
      const label = s('text', { class: 'axis-text', x: PAD.left - 8, y: y + 3.5, 'text-anchor': 'end' });
      label.textContent = fmt(v, labelDecimals);
      svg.append(label);
    }

    /* bars */
    const barGroup = s('g', {});
    points.forEach((p, i) => {
      const x = xOf(i);
      if (!p.logged && p.value === 0) {
        /* A day with nothing logged reads as a baseline stub, not a zero bar. */
        barGroup.append(s('path', { class: 'bar-empty', d: barPath(x, HEIGHT - PAD.bottom - 2, barW, 2, 1) }));
        return;
      }
      const y = yOf(p.value);
      const h = HEIGHT - PAD.bottom - y;
      barGroup.append(s('path', { class: 'bar', d: barPath(x, y, barW, h, 4), 'data-i': i }));
    });
    svg.append(barGroup);

    /* average + goal reference lines */
    if (Number.isFinite(average) && average > 0) {
      const y = yOf(Math.min(average, yMax));
      svg.append(s('line', { class: 'ref-line', x1: PAD.left, x2: width - PAD.right, y1: y, y2: y }));
    }
    if (Number.isFinite(goal) && goal > 0 && goal <= yMax) {
      const y = yOf(goal);
      svg.append(s('line', { class: 'ref-goal', x1: PAD.left, x2: width - PAD.right, y1: y, y2: y }));
    }

    /* x labels: a handful, evenly spaced, always including the first and last
       day — spacing them by index keeps the ends from colliding. */
    const wanted = Math.max(2, Math.min(5, Math.floor(plotW / 58), points.length));
    const seen = new Set();
    for (let k = 0; k < wanted; k++) {
      seen.add(Math.round((k * (points.length - 1)) / (wanted - 1)));
    }
    for (const i of seen) {
      const cx = xOf(i) + barW / 2;
      if (cx < PAD.left - 2 || cx > width - PAD.right + 2) continue;
      const t = s('text', {
        class: 'axis-text', x: Math.min(Math.max(cx, 12), width - 12),
        y: HEIGHT - 6, 'text-anchor': 'middle',
      });
      t.textContent = shortDate(points[i].date);
      svg.append(t);
    }

    /* selective direct labels: only the highest day */
    const peak = points.reduce((best, p, i) => (p.value > (points[best]?.value ?? -1) ? i : best), 0);
    if (points[peak]?.value > 0 && band >= 22) {
      const t = s('text', {
        class: 'point-label', x: xOf(peak) + barW / 2, y: yOf(points[peak].value) - 5, 'text-anchor': 'middle',
      });
      t.textContent = fmt(points[peak].value, nutrient.decimals);
      svg.append(t);
    }

    /* hover / tap layer: hit targets span the full band so thin bars stay tappable */
    const hits = s('g', {});
    points.forEach((p, i) => {
      hits.append(s('rect', {
        class: 'bar-hit', x: PAD.left + band * i, y: PAD.top,
        width: band, height: plotH, 'data-i': i,
      }));
    });
    svg.append(hits);

    let activeIndex = -1;
    const showTip = (i, clientX) => {
      const p = points[i];
      if (!p) return;
      if (i !== activeIndex) {
        activeIndex = i;
        barGroup.querySelectorAll('path').forEach((n) => { n.style.opacity = ''; });
        const bar = barGroup.querySelector(`[data-i="${i}"]`);
        barGroup.querySelectorAll('path').forEach((n) => { if (n !== bar) n.style.opacity = '.55'; });
      }
      const hostBox = host.getBoundingClientRect();
      const px = hostBox.width / width;
      const cx = (PAD.left + band * i + band / 2) * px;
      tip.innerHTML = '';
      tip.append(
        el('div', { text: friendlyDate(p.date) }),
        el('div', {}, [
          el('strong', { text: p.logged ? `${fmt(p.value, nutrient.decimals)} ${nutrient.unit}` : 'nothing logged' }),
        ]),
      );
      tip.style.left = `${Math.max(48, Math.min(hostBox.width - 48, cx))}px`;
      tip.style.top = `${Math.max(30, yOf(p.value) * px - 6)}px`;
      tip.classList.add('on');
    };
    const hideTip = () => {
      activeIndex = -1;
      tip.classList.remove('on');
      barGroup.querySelectorAll('path').forEach((n) => { n.style.opacity = ''; });
    };

    const indexFromEvent = (e) => {
      const box = svg.getBoundingClientRect();
      const x = ((e.clientX - box.left) / box.width) * width;
      return Math.max(0, Math.min(points.length - 1, Math.floor((x - PAD.left) / band)));
    };

    svg.addEventListener('pointermove', (e) => showTip(indexFromEvent(e), e.clientX));
    svg.addEventListener('pointerdown', (e) => showTip(indexFromEvent(e), e.clientX));
    svg.addEventListener('pointerleave', hideTip);
    svg.addEventListener('pointercancel', hideTip);
    chart.addEventListener('pointerup', () => setTimeout(hideTip, 1800), { once: true });

    chart.append(svg);
  };

  draw();

  if (typeof ResizeObserver !== 'undefined') {
    let lastWidth = host.clientWidth;
    const ro = new ResizeObserver(() => {
      if (Math.abs(host.clientWidth - lastWidth) < 4) return;
      lastWidth = host.clientWidth;
      draw();
    });
    ro.observe(host);
    host._chartObserver?.disconnect();
    host._chartObserver = ro;
  }

  return { redraw: draw };
}
