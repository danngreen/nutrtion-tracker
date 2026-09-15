/* Summary tab: pick a nutrient and a period, see average / min / max and the
   day-by-day trend. */
import * as store from './store.js';
import {
  el, fmt, todayStr, shiftDate, dateRange, friendlyDate, toDateStr,
  parseDateStr, emptyState, ICONS,
} from './ui.js';
import { renderChart } from './chart.js';

const PERIODS = [
  { id: '7',     label: '7 days'  },
  { id: '14',    label: '14 days' },
  { id: '30',    label: '30 days' },
  { id: '90',    label: '90 days' },
  { id: 'month', label: 'This month' },
  { id: 'all',   label: 'All time' },
  { id: 'custom',label: 'Custom'  },
];

let state = {
  nutrientId: null,
  period: '30',
  customFrom: shiftDate(todayStr(), -13),
  customTo: todayStr(),
  showTable: false,
};

function resolveRange() {
  const today = todayStr();
  switch (state.period) {
    case 'month': {
      const d = parseDateStr(today);
      return { from: toDateStr(new Date(d.getFullYear(), d.getMonth(), 1)), to: today };
    }
    case 'all': {
      const dates = [...store.loggedDates()].sort();
      return { from: dates[0] || today, to: today > (dates.at(-1) || today) ? today : dates.at(-1) };
    }
    case 'custom': {
      const from = state.customFrom <= state.customTo ? state.customFrom : state.customTo;
      const to = state.customFrom <= state.customTo ? state.customTo : state.customFrom;
      return { from, to };
    }
    default:
      return { from: shiftDate(today, -(Number(state.period) - 1)), to: today };
  }
}

export function summaryView({ setActions, rerender }) {
  const nutrients = store.nutrients();
  setActions([]);

  const root = el('div');

  if (!nutrients.length) {
    root.append(emptyState({ text: 'No nutrients are enabled. Turn some on in Settings.' }));
    return root;
  }
  if (!store.loggedDates().size) {
    root.append(emptyState({
      text: 'Nothing logged yet. Once you have a few days in the Day tab, your averages and trend show up here.',
    }));
    return root;
  }

  if (!nutrients.some((n) => n.id === state.nutrientId)) state.nutrientId = nutrients[0].id;
  const nutrient = nutrients.find((n) => n.id === state.nutrientId);

  /* ---- filters: one row above the chart ---- */
  root.append(el('div', { class: 'chips', style: 'margin-bottom:8px' },
    nutrients.map((n) => el('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(n.id === state.nutrientId),
      text: n.name,
      onclick: () => { state.nutrientId = n.id; rerender(); },
    }))));

  root.append(el('div', { class: 'chips', style: 'margin-bottom:14px' },
    PERIODS.map((p) => el('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(p.id === state.period),
      text: p.label,
      onclick: () => { state.period = p.id; rerender(); },
    }))));

  if (state.period === 'custom') {
    root.append(el('div', { class: 'field-row', style: 'margin-bottom:14px' }, [
      el('div', {}, [
        el('label', { class: 'field-label', text: 'From' }),
        el('input', {
          class: 'input', type: 'date', value: state.customFrom, max: todayStr(),
          onchange: (e) => { if (e.target.value) { state.customFrom = e.target.value; rerender(); } },
        }),
      ]),
      el('div', {}, [
        el('label', { class: 'field-label', text: 'To' }),
        el('input', {
          class: 'input', type: 'date', value: state.customTo, max: todayStr(),
          onchange: (e) => { if (e.target.value) { state.customTo = e.target.value; rerender(); } },
        }),
      ]),
    ]));
  }

  /* ---- data ---- */
  const { from, to } = resolveRange();
  const logged = store.loggedDates();
  const days = dateRange(from, to).map((date) => {
    const totals = store.totalsForDate(date);
    return { date, value: totals[nutrient.id] || 0, logged: logged.has(date) };
  });

  const countEmpty = store.settings().countEmptyDays;
  const considered = countEmpty ? days : days.filter((d) => d.logged);
  const values = considered.map((d) => d.value);
  const loggedCount = days.filter((d) => d.logged).length;

  const average = values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
  const min = values.length ? Math.min(...values) : NaN;
  const max = values.length ? Math.max(...values) : NaN;
  const total = values.reduce((a, b) => a + b, 0);

  if (!loggedCount) {
    root.append(emptyState({
      text: `Nothing logged between ${friendlyDate(from)} and ${friendlyDate(to)}.`,
    }));
    return root;
  }

  /* ---- stats ---- */
  const statBlock = (label, value, sub) => el('div', { class: 'stat' }, [
    el('div', { class: 'stat-label', text: label }),
    el('div', { class: 'stat-val' }, [fmt(value, nutrient.decimals), el('span', { class: 'unit', text: nutrient.unit })]),
    sub ? el('div', { class: 'stat-sub', text: sub }) : null,
  ]);

  const minDay = considered.find((d) => d.value === min);
  const maxDay = considered.find((d) => d.value === max);

  root.append(el('div', { class: 'card' }, [
    el('div', { class: 'stats' }, [
      statBlock('Average', average, 'per day'),
      statBlock('Min', min, minDay ? friendlyDate(minDay.date) : ''),
      statBlock('Max', max, maxDay ? friendlyDate(maxDay.date) : ''),
    ]),
    el('div', { class: 'total', style: 'border-top:1px solid var(--border)' }, [
      el('div', { class: 'total-top' }, [
        el('span', { class: 'total-name', text: `Total over ${considered.length} day${considered.length === 1 ? '' : 's'}` }),
        el('span', { class: 'total-val' }, [fmt(total, nutrient.decimals), el('span', { class: 'unit', text: nutrient.unit })]),
      ]),
      el('div', { class: 'total-goal' }, [
        el('span', { text: `${friendlyDate(from)} – ${friendlyDate(to)}` }),
        el('span', { text: `${loggedCount} of ${days.length} days logged` }),
      ]),
    ]),
  ]));

  /* ---- chart ---- */
  const chartHost = el('div', { class: 'chart-host' });
  const chartCard = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('h2', { text: `${nutrient.name} per day (${nutrient.unit})` }),
      el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        text: state.showTable ? 'Chart' : 'Table',
        onclick: () => { state.showTable = !state.showTable; rerender(); },
      }),
    ]),
    state.showTable ? dataTable(days, nutrient) : el('div', { class: 'chart-wrap' }, [chartHost]),
    state.showTable ? null : el('div', { class: 'chart-legend' }, [
      el('span', { class: 'avg' }, [el('i'), `Average ${fmt(average, nutrient.decimals)} ${nutrient.unit}`]),
      nutrient.goal > 0 ? el('span', { class: 'goal' }, [el('i'), `Goal ${fmt(nutrient.goal, nutrient.decimals)} ${nutrient.unit}`]) : null,
    ]),
  ]);
  root.append(chartCard);

  if (!state.showTable) {
    /* Draw once the card is in the document and has a real width. */
    requestAnimationFrame(() => {
      if (chartHost.isConnected) {
        renderChart(chartHost, { points: days, nutrient, average, goal: nutrient.goal });
      }
    });
  }

  root.append(el('div', { class: 'card' }, [
    el('label', { class: 'switch', style: 'padding:12px 14px' }, [
      el('input', {
        type: 'checkbox', checked: countEmpty,
        onchange: (e) => { store.updateSettings({ countEmptyDays: e.target.checked }); rerender(); },
      }),
      el('span', { text: 'Count days with nothing logged as zero' }),
    ]),
    el('p', {
      class: 'field-hint', style: 'padding:0 14px 12px;margin:0',
      text: countEmpty
        ? 'Average, min and max cover every day in the period.'
        : 'Average, min and max cover only the days you logged something.',
    }),
  ]));

  return root;
}

function dataTable(days, nutrient) {
  const rows = days.slice().reverse().map((d) => el('tr', {}, [
    el('td', { text: friendlyDate(d.date) }),
    el('td', { text: d.logged ? `${fmt(d.value, nutrient.decimals)} ${nutrient.unit}` : '—' }),
  ]));
  return el('div', { class: 'table-scroll' }, [
    el('table', { class: 'data-table' }, [
      el('thead', {}, [el('tr', {}, [el('th', { text: 'Day' }), el('th', { text: nutrient.name })])]),
      el('tbody', {}, rows),
    ]),
  ]);
}
